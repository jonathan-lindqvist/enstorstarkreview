import contextlib
import io
import json
import hashlib
import tempfile
import unittest
import os
import subprocess
from pathlib import Path

from deploy import Deployment, DeploymentError

SHA = "a" * 40
OLD_SHA = "b" * 40


class FakeRunner:
    def __init__(self, fail=None, remote=SHA):
        self.calls = []
        self.fail = fail
        self.remote = remote
        self.head = OLD_SHA
        self.previous_revision = ""
        self.compose_files = ""

    def __call__(self, args, **kwargs):
        self.calls.append(args)
        if self.fail and self.fail(args):
            raise DeploymentError("Command failed")
        text = " ".join(args)
        if "status --porcelain" in text:
            return ""
        if "branch --show-current" in text:
            return "main"
        if "remote get-url" in text:
            return "https://github.com/jonathan-lindqvist/enstorstarkreview.git"
        if "rev-parse origin/main" in text:
            return self.remote
        if "rev-parse HEAD" in text:
            return self.head
        if "merge --ff-only" in text:
            self.head = args[-1]
        if "{{.Id}}" in text:
            return "app-id"
        if "{{.Image}}" in text:
            return "sha256:old-image"
        if "com.docker.compose.project" in text:
            if "config_files" in text:
                return self.compose_files
            return "enstorstarkreview"
        if "org.opencontainers.image.revision" in text:
            return self.previous_revision
        if "{{.State.Running}}" in text:
            return "true"
        if "{{.State.Health.Status}}" in text:
            return "healthy"
        if "{{json .Mounts}}" in text:
            return '[{"Type":"volume","Name":"existing-images","Destination":"/app/uploads/images"}]'
        if "{{.Mountpoint}}" in text:
            return str(Path(tempfile.gettempdir()) / "nonexistent-image-test-directory")
        if "ps -q mongo" in text:
            return "mongo-id"
        return ""


class FakeDeployment(Deployment):
    def backup(self, *args):
        self.backup_called = True
        self.backup_state = args[1]
        if getattr(self, "backup_fails", False):
            raise DeploymentError("Backup failed")
        directory = self.backup_dir / "backup-test"
        directory.mkdir()
        (directory / "compose.previous.yml").write_text((self.app_dir / "docker-compose.yml").read_text())
        return directory


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.app = Path(self.temp.name) / "app"
        self.app.mkdir()
        (self.app / ".env").write_text("APP_MONGO_URI=secret-never-log-me\n")
        (self.app / ".env").chmod(0o600)
        (self.app / "docker-compose.yml").write_text("services:\n  app:\n    build: .\n")
        self.backups = Path(self.temp.name) / "backups"
        self.runner = FakeRunner()
        self.runner.compose_files = str(self.app / "docker-compose.yml")
        self.deployment = FakeDeployment(self.app, self.backups, self.runner, lambda **_kwargs: True)
        self.deployment.backup_called = False

    def app_replacements(self):
        return [args for args in self.runner.calls if "up" in args]

    def test_invalid_sha_performs_no_commands(self):
        for sha in ["main", SHA + ";echo unsafe", "", "0" * 40]:
            with self.assertRaises(DeploymentError):
                self.deployment.deploy(sha)
        self.assertEqual(self.runner.calls, [])

    def test_backup_failure_never_changes_checkout_or_replaces_app(self):
        self.deployment.backup_fails = True
        with self.assertRaises(DeploymentError):
            self.deployment.deploy(SHA)
        self.assertTrue(self.deployment.backup_called)
        self.assertEqual(self.app_replacements(), [])
        self.assertFalse(any("merge" in args for args in self.runner.calls))

    def test_stale_commit_is_skipped_without_backup_or_replacement(self):
        self.runner.remote = "c" * 40
        self.assertFalse(self.deployment.deploy(SHA))
        self.assertFalse(self.deployment.backup_called)
        self.assertEqual(self.app_replacements(), [])

    def test_success_replaces_only_app_after_backup(self):
        self.assertTrue(self.deployment.deploy(SHA))
        self.assertTrue(self.deployment.backup_called)
        self.assertEqual(len(self.app_replacements()), 1)
        self.assertEqual(self.app_replacements()[0][-1], "app")
        self.assertIn("--no-deps", self.app_replacements()[0])
        self.assertIn("--no-build", self.app_replacements()[0])
        self.assertFalse(any("stop" in args or "down" in args for args in self.runner.calls))

    def test_build_failure_keeps_running_app(self):
        self.runner.fail = lambda args: "build" in args
        with self.assertRaises(DeploymentError):
            self.deployment.deploy(SHA)
        self.assertEqual(self.app_replacements(), [])

    def test_superseded_commit_after_build_never_replaces_app(self):
        def supersede(args):
            if "build" in args:
                self.runner.remote = "c" * 40
            return False
        self.runner.fail = supersede
        self.assertFalse(self.deployment.deploy(SHA))
        self.assertTrue(self.deployment.backup_called)
        self.assertEqual(self.app_replacements(), [])

    def test_failed_replacement_attempts_rollback_and_reports_failure(self):
        self.runner.fail = lambda args: "up" in args and len(self.app_replacements()) == 1
        with self.assertRaisesRegex(DeploymentError, "previous app restored"):
            self.deployment.deploy(SHA)
        self.assertEqual(len(self.app_replacements()), 2)
        self.assertFalse(list(self.backups.rglob("DEPLOYED.json")))

    def test_failed_rollback_command_reports_operator_recovery(self):
        self.runner.fail = lambda args: "up" in args
        with self.assertRaisesRegex(DeploymentError, "rollback failed"):
            self.deployment.deploy(SHA)
        self.assertEqual(len(self.app_replacements()), 2)

    def test_world_readable_environment_file_aborts_before_backup(self):
        (self.app / ".env").chmod(0o644)
        with self.assertRaisesRegex(DeploymentError, "mode 600"):
            self.deployment.deploy(SHA)
        self.assertFalse(self.deployment.backup_called)
        self.assertEqual(self.app_replacements(), [])

    def test_previous_commit_comes_from_running_image_after_a_prior_rollback(self):
        self.runner.previous_revision = "c" * 40
        self.assertTrue(self.deployment.deploy(SHA))
        self.assertEqual(self.deployment.backup_state["previous_commit"], "c" * 40)

    def test_previous_compose_comes_from_running_container_after_a_prior_rollback(self):
        previous = self.backups / "older-backup"
        previous.mkdir(parents=True)
        compose = previous / "compose.previous.yml"
        compose.write_text("services:\n  app:\n    image: old-app\n")
        override = previous / "rollback.json"
        override.write_text('{"services":{"app":{"image":"old-app"}}}')
        self.runner.compose_files = f"{compose},{override}"
        self.assertTrue(self.deployment.deploy(SHA))
        self.assertEqual(self.deployment.backup_state["previous_compose"], compose)

    def test_retry_after_failed_build_retains_the_running_apps_saved_compose(self):
        previous = self.backups / "older-backup"
        previous.mkdir(parents=True)
        compose = previous / "compose.previous.yml"
        compose.write_text("services:\n  app:\n    image: old-app\n")
        (previous / "COMPLETE").touch()
        (previous / "manifest.json").write_text(json.dumps({
            "previous_image": "sha256:old-image",
            "sha256": {"compose.previous.yml": hashlib.sha256(compose.read_bytes()).hexdigest()}
        }))
        self.assertTrue(self.deployment.deploy(SHA))
        self.assertEqual(self.deployment.backup_state["previous_compose"], compose)

    def test_ssh_forced_command_rejects_injection_before_sudo(self):
        script = Path(__file__).with_name("ssh-command.sh")
        for command in ["", "bash", "deploy main", "deploy " + SHA + ";echo unsafe", "deploy " + SHA + " extra"]:
            result = subprocess.run(
                ["sh", str(script)], capture_output=True, text=True,
                env={**os.environ, "SSH_ORIGINAL_COMMAND": command}
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn("sudo", result.stderr)

    def test_health_failure_restores_previous_image_and_fails(self):
        self.deployment.health = lambda **kwargs: kwargs.get("expected_sha") != SHA
        with self.assertRaisesRegex(DeploymentError, "previous app restored"):
            self.deployment.deploy(SHA)
        self.assertEqual(len(self.app_replacements()), 2)
        rollback = next(self.backups.rglob("rollback.json"))
        self.assertIn("enstorstarkreview-rollback", rollback.read_text())

    def test_rollback_failure_is_reported_without_secrets(self):
        self.deployment.health = lambda **_kwargs: False
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            with self.assertRaisesRegex(DeploymentError, "rollback failed"):
                self.deployment.deploy(SHA)
        self.assertNotIn("secret-never-log-me", output.getvalue())

    def test_concurrent_deployment_does_no_protected_work(self):
        import fcntl

        self.backups.mkdir()
        with (self.backups / ".deploy.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(DeploymentError, "already running"):
                self.deployment.deploy(SHA)
        self.assertEqual(self.runner.calls, [])


if __name__ == "__main__":
    unittest.main()
