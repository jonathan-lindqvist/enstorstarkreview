import contextlib
import io
import json
import hashlib
import tempfile
import unittest
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

import deploy

from deploy import Deployment, DeploymentConfig, DeploymentError, run_command

SHA = "a" * 40
OLD_SHA = "b" * 40


class PrivateConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.path = self.directory / "deploy.json"
        self.values = {
            "app_dir": str(self.directory / "app"),
            "backup_dir": str(self.directory / "backups"),
            "git_user": "fixture-owner",
            "repository": "example-owner/example-app",
            "site_url": "https://reviews.example.com",
            "www_url": "https://www.reviews.example.com/",
            "app_container": "fixture-app",
            "mongo_container": "fixture-mongo",
            "caddy_network": "fixture-proxy",
            "image_mount": "/app/uploads/images",
            "database": "fixture_reviews"
        }
        self.path.write_text(json.dumps(self.values))
        self.path.chmod(0o600)
        self.file_owner = 0
        self.directory_owner = 0

    def run_main(self, arguments=None):
        original_fstat, original_stat = os.fstat, os.stat

        def owner(stats, uid):
            fields = list(stats)
            fields[4] = uid
            return os.stat_result(fields)

        def file_stat(fd):
            return owner(original_fstat(fd), self.file_owner)

        def directory_stat(path, *args, **kwargs):
            return owner(original_stat(path, *args, **kwargs), self.directory_owner)

        with patch.object(deploy, "CONFIG_PATH", self.path, create=True), \
                patch.object(deploy.os, "geteuid", return_value=0), \
                patch.object(deploy.os, "umask"), \
                patch.object(deploy.os, "fstat", side_effect=file_stat), \
                patch.object(deploy.os, "stat", side_effect=directory_stat), \
                patch.object(deploy.sys, "argv", arguments or ["installed-helper", SHA]), \
                patch.object(deploy, "Deployment") as factory:
            self.factory = factory
            deploy.main()
            return factory

    def assert_rejected(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            with self.assertRaises(DeploymentError) as failure:
                self.run_main()
        self.factory.assert_not_called()
        self.assertNotIn("secret-never-log-me", str(failure.exception) + output.getvalue())

    def test_private_configuration_controls_deployment_without_environment_overrides(self):
        with patch.dict(os.environ, {"DEPLOY_CONFIG": "/tmp/secret-never-log-me.json"}):
            factory = self.run_main()
        args, _kwargs = factory.call_args
        self.assertEqual(len(args), 1)
        config = args[0]
        self.assertEqual(config.app_dir, Path(self.values["app_dir"]))
        self.assertEqual(config.backup_dir, Path(self.values["backup_dir"]))
        self.assertEqual(config.git_user, self.values["git_user"])
        self.assertEqual(config.database, self.values["database"])
        factory.return_value.deploy.assert_called_once_with(SHA)

    def test_missing_configuration_fails_before_deployment(self):
        self.path.unlink()
        self.assert_rejected()

    def test_malformed_and_oversized_configuration_fail_without_logging_values(self):
        for content in ["secret-never-log-me", json.dumps(self.values) + " " * 16384, "[]"]:
            with self.subTest(content_length=len(content)):
                self.path.write_text(content)
                self.assert_rejected()

    def test_public_or_non_root_owned_configuration_is_rejected(self):
        self.path.chmod(0o644)
        self.assert_rejected()
        self.path.chmod(0o600)
        self.file_owner = 1001
        self.assert_rejected()

    def test_writable_or_non_root_owned_configuration_directory_is_rejected(self):
        self.directory.chmod(0o777)
        self.assert_rejected()
        self.directory.chmod(0o700)
        self.directory_owner = 1001
        self.assert_rejected()

    def test_symlinked_configuration_is_rejected(self):
        actual = self.directory / "actual.json"
        self.path.rename(actual)
        self.path.symlink_to(actual)
        self.assert_rejected()

    def test_symlinked_configuration_directory_is_rejected(self):
        link = self.directory / "link"
        link.symlink_to(self.directory, target_is_directory=True)
        self.path = link / "deploy.json"
        self.assert_rejected()

    def test_fifo_configuration_is_rejected_without_waiting_for_a_writer(self):
        self.path.unlink()
        os.mkfifo(self.path, mode=0o600)
        self.assert_rejected()

    def test_invalid_settings_fail_before_deployment_and_do_not_leak_values(self):
        invalid = [
            {"app_dir": "secret-never-log-me"},
            {"app_dir": "/"},
            {"app_dir": str(self.directory / "app/../other")},
            {"backup_dir": self.values["app_dir"]},
            {"backup_dir": self.values["app_dir"] + "/backups"},
            {"backup_dir": str(self.directory)},
            {"git_user": "root"},
            {"git_user": "owner;secret-never-log-me"},
            {"repository": "../secret-never-log-me"},
            {"site_url": "http://reviews.example.com"},
            {"site_url": "https://secret-never-log-me@example.com"},
            {"www_url": "https://www.example.com/?secret-never-log-me"},
            {"app_container": "--secret-never-log-me"},
            {"mongo_container": "mongo\nsecret-never-log-me"},
            {"caddy_network": ""},
            {"image_mount": "relative/path"},
            {"database": "reviews;secret-never-log-me"},
            {"extra": "secret-never-log-me"}
        ]
        for changes in invalid:
            with self.subTest(changes=tuple(changes)):
                self.path.write_text(json.dumps({**self.values, **changes}))
                self.assert_rejected()
        self.path.write_text(json.dumps({key: value for key, value in self.values.items() if key != "git_user"}))
        self.assert_rejected()

    def test_invalid_sha_or_extra_arguments_fail_before_loading_configuration(self):
        self.path.unlink()
        for arguments in [["helper", "main"], ["helper", SHA, "/tmp/other.json"]]:
            with self.subTest(arguments=arguments):
                with self.assertRaises(DeploymentError):
                    self.run_main(arguments)
                self.factory.assert_not_called()


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
            return "https://github.com/example-owner/example-app.git"
        if "rev-parse origin/main" in text:
            return self.remote
        if "rev-parse HEAD" in text:
            return self.head
        if "merge --ff-only" in text:
            self.head = args[-1]
        if "{{.Id}}" in text:
            return "mongo-id" if args[-1] == "fixture-mongo" else "app-id"
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
        self.config = DeploymentConfig.from_dict({
            "app_dir": str(self.app), "backup_dir": str(self.backups),
            "git_user": "fixture-owner", "repository": "example-owner/example-app",
            "site_url": "https://reviews.example.com", "www_url": "https://www.reviews.example.com/",
            "app_container": "fixture-app", "mongo_container": "fixture-mongo",
            "caddy_network": "fixture-proxy", "image_mount": "/app/uploads/images",
            "database": "fixture_reviews"
        })
        self.deployment = FakeDeployment(self.config, self.runner, lambda **_kwargs: True)
        self.deployment.backup_called = False
        self.now = 1000
        clock = patch.object(deploy.time, "time", side_effect=lambda: self.now)
        clock.start()
        self.addCleanup(clock.stop)

    def app_replacements(self):
        return [args for args in self.runner.calls if "up" in args]

    def test_healthy_already_running_revision_skips_backup_build_and_replacement(self):
        self.runner.previous_revision = SHA
        self.runner.head = SHA
        checks = []
        self.deployment.health = lambda **kwargs: checks.append(kwargs) or True
        self.assertFalse(self.deployment.deploy(SHA))
        self.assertEqual(checks, [{"expected_sha": SHA}])
        self.assertFalse(self.deployment.backup_called)
        self.assertEqual(self.app_replacements(), [])
        self.assertFalse(any("build" in args or "merge" in args for args in self.runner.calls))
        self.assertEqual(list(self.backups.glob("*/")), [])

    def test_checkout_sha_without_a_running_revision_label_still_deploys(self):
        self.runner.head = SHA
        self.assertTrue(self.deployment.deploy(SHA))
        self.assertTrue(self.deployment.backup_called)

    def test_unhealthy_already_running_revision_fails_without_backup_or_replacement(self):
        self.runner.previous_revision = SHA
        self.deployment.health = lambda **_kwargs: False
        with self.assertRaisesRegex(DeploymentError, "Already-running revision failed health"):
            self.deployment.deploy(SHA)
        self.assertFalse(self.deployment.backup_called)
        self.assertEqual(self.app_replacements(), [])

    def test_failed_attempt_limits_a_new_helper_process_before_external_commands(self):
        self.deployment.backup_fails = True
        with self.assertRaisesRegex(DeploymentError, "Backup failed"):
            self.deployment.deploy(SHA)
        calls_before_retry = list(self.runner.calls)
        retry = FakeDeployment(self.config, self.runner, lambda **_kwargs: True)
        retry.backup_called = False
        with self.assertRaisesRegex(DeploymentError, "rate-limited"):
            retry.deploy("c" * 40)
        self.assertEqual(self.runner.calls, calls_before_retry)
        self.assertFalse(retry.backup_called)

    def test_cooldown_expires_at_five_minutes_and_rejections_do_not_extend_it(self):
        self.deployment.backup_fails = True
        with self.assertRaisesRegex(DeploymentError, "Backup failed"):
            self.deployment.deploy(SHA)
        calls_before_retry = list(self.runner.calls)
        self.now += 299
        with self.assertRaisesRegex(DeploymentError, "rate-limited"):
            self.deployment.deploy(SHA)
        self.assertEqual(self.runner.calls, calls_before_retry)
        self.now += 1
        self.deployment.backup_fails = False
        self.assertTrue(self.deployment.deploy(SHA))

    def test_failed_git_fetch_also_consumes_an_attempt(self):
        self.runner.fail = lambda args: "fetch" in args
        with self.assertRaises(DeploymentError):
            self.deployment.deploy(SHA)
        calls_before_retry = list(self.runner.calls)
        self.runner.fail = None
        with self.assertRaisesRegex(DeploymentError, "rate-limited"):
            self.deployment.deploy(SHA)
        self.assertEqual(self.runner.calls, calls_before_retry)
        self.assertFalse(self.deployment.backup_called)

    def test_corrupt_or_oversized_rate_limit_state_fails_without_commands_or_logs(self):
        self.backups.mkdir(mode=0o700)
        state = self.backups / ".deployment-request.json"
        for content in ["secret-never-log-me", " " * 2049, '{"last_attempt_at":true}', '{}']:
            state.write_text(content)
            state.chmod(0o600)
            output = io.StringIO()
            with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
                with self.assertRaisesRegex(DeploymentError, "rate-limit state") as failure:
                    self.deployment.deploy(SHA)
            self.assertEqual(self.runner.calls, [])
            self.assertNotIn("secret-never-log-me", output.getvalue() + str(failure.exception))

    def test_public_or_symlinked_rate_limit_state_is_rejected(self):
        self.backups.mkdir(mode=0o700)
        state = self.backups / ".deployment-request.json"
        state.write_text('{"last_attempt_at":0}')
        state.chmod(0o644)
        with self.assertRaisesRegex(DeploymentError, "rate-limit state"):
            self.deployment.deploy(SHA)
        state.unlink()
        state.symlink_to(self.app / ".env")
        with self.assertRaisesRegex(DeploymentError, "rate-limit state"):
            self.deployment.deploy(SHA)
        self.assertEqual(self.runner.calls, [])
        self.assertIn("secret-never-log-me", (self.app / ".env").read_text())

    def test_failed_admission_write_stops_before_external_commands(self):
        with patch.object(deploy, "private_json", side_effect=OSError("secret-never-log-me")):
            with self.assertRaisesRegex(DeploymentError, "rate-limit state") as failure:
                self.deployment.deploy(SHA)
        self.assertNotIn("secret-never-log-me", str(failure.exception))
        self.assertEqual(self.runner.calls, [])
        self.assertEqual(list(self.backups.glob("*.tmp")), [])

    def test_clock_rollback_does_not_bypass_the_cooldown(self):
        self.deployment.backup_fails = True
        with self.assertRaises(DeploymentError):
            self.deployment.deploy(SHA)
        calls_before_retry = list(self.runner.calls)
        self.now -= 100
        with self.assertRaisesRegex(DeploymentError, "rate-limited"):
            self.deployment.deploy(SHA)
        self.assertEqual(self.runner.calls, calls_before_retry)

    def test_rate_limit_state_is_private_and_rejections_leave_it_unchanged(self):
        self.runner.remote = "c" * 40
        self.assertFalse(self.deployment.deploy(SHA))
        state = self.backups / ".deployment-request.json"
        self.assertEqual(state.stat().st_mode & 0o777, 0o600)
        previous = state.read_bytes()
        with self.assertRaises(deploy.TemporaryDeploymentError):
            self.deployment.deploy(SHA)
        self.assertEqual(state.read_bytes(), previous)

    def test_temporary_cli_failures_return_75_and_real_failures_return_1(self):
        for failure, expected in [
            (deploy.TemporaryDeploymentError("Admission is temporarily blocked"), 75),
            (DeploymentError("Backup failed"), 1),
            (OSError("secret-never-log-me"), 1)
        ]:
            output = io.StringIO()
            with patch.object(deploy, "main", side_effect=failure), contextlib.redirect_stderr(output):
                self.assertEqual(deploy.cli(), expected)
            self.assertNotIn("secret-never-log-me", output.getvalue())

    def test_wrong_configured_mongo_is_rejected_before_backup_or_replacement(self):
        self.deployment.config = DeploymentConfig.from_dict({
            **self.config.__dict__, "app_dir": str(self.app), "backup_dir": str(self.backups),
            "mongo_container": "wrong-mongo"
        })
        with self.assertRaisesRegex(DeploymentError, "differs from Compose"):
            self.deployment.deploy(SHA)
        self.assertFalse(self.deployment.backup_called)
        self.assertEqual(self.app_replacements(), [])

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

    def test_private_settings_select_checkout_owner_containers_network_and_origin(self):
        self.assertTrue(self.deployment.deploy(SHA))
        git_commands = [args for args in self.runner.calls if args[0] == "runuser"]
        self.assertTrue(git_commands)
        self.assertTrue(all(args[2] == self.config.git_user for args in git_commands))
        inspections = [args[-1] for args in self.runner.calls if args[:2] == ["docker", "inspect"]]
        self.assertIn(self.config.app_container, inspections)
        self.assertIn(self.config.mongo_container, inspections)
        self.assertTrue(any(args[-1] == self.config.caddy_network for args in self.runner.calls))

    def test_health_checks_use_private_urls_and_container_names(self):
        requests = []

        class Response:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        class Opener:
            def open(inner_self, url, **_kwargs):
                requests.append(url)
                if url == self.config.www_url:
                    raise deploy.urllib.error.HTTPError(
                        url, 308, "redirect", {"Location": self.config.site_url + "/"}, None
                    )
                return Response()

        with patch.object(deploy.urllib.request, "build_opener", return_value=Opener()):
            self.assertTrue(self.deployment.check_health(expected_image="sha256:old-image"))
        self.assertEqual(requests, [self.config.site_url + path for path in ("/", "/about", "/feed.xml")] + [self.config.www_url])

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
        checks = []
        def health(**kwargs):
            checks.append(kwargs)
            return kwargs.get("expected_sha") != SHA
        self.deployment.health = health
        with self.assertRaisesRegex(DeploymentError, "previous app restored"):
            self.deployment.deploy(SHA)
        self.assertEqual(len(self.app_replacements()), 2)
        rollback = next(self.backups.rglob("rollback.json"))
        self.assertIn("enstorstarkreview-rollback", rollback.read_text())
        self.assertEqual(checks[1]["expected_image"], "sha256:old-image")

    def test_rollback_failure_is_reported_without_secrets(self):
        self.deployment.health = lambda **_kwargs: False
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            with self.assertRaisesRegex(DeploymentError, "rollback failed"):
                self.deployment.deploy(SHA)
        self.assertNotIn("secret-never-log-me", output.getvalue())

    def test_failed_dependency_output_never_reaches_deployment_logs(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            with self.assertRaises(DeploymentError) as failure:
                run_command([
                    sys.executable, "-c",
                    "import sys; print('secret-never-log-me'); print('secret-never-log-me', file=sys.stderr); sys.exit(1)"
                ])
        self.assertNotIn("secret-never-log-me", output.getvalue())
        self.assertNotIn("secret-never-log-me", str(failure.exception))

    def test_concurrent_deployment_does_no_protected_work(self):
        import fcntl

        self.backups.mkdir()
        with (self.backups / ".deploy.lock").open("w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(DeploymentError, "already running"):
                self.deployment.deploy(SHA)
        self.assertEqual(self.runner.calls, [])


class WorkflowRetryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        repository = Path(__file__).resolve().parents[2]
        result = subprocess.run([
            "node", "--input-type=module", "-e",
            "import {readFileSync} from 'node:fs'; import {parse} from 'yaml'; "
            "process.stdout.write(parse(readFileSync('.github/workflows/deploy.yml','utf8')).jobs.deploy.steps[0].run);"
        ], cwd=repository, capture_output=True, text=True, check=True)
        cls.command = result.stdout

    def run_workflow(self, behavior):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            scripts = directory / "bin"
            scripts.mkdir()
            ssh = scripts / "ssh"
            ssh.write_text("""#!/bin/sh
count=$(cat "$FAKE_SSH_COUNT" 2>/dev/null || printf 0)
count=$((count+1))
printf '%s' "$count" > "$FAKE_SSH_COUNT"
case "$FAKE_SSH_BEHAVIOR" in
  retry-once) test "$count" -gt 1 && exit 0; exit 75 ;;
  blocked) exit 75 ;;
  failure) exit 1 ;;
  transport) exit 255 ;;
esac
exit 0
""")
            ssh.chmod(0o755)
            sleep = scripts / "sleep"
            sleep.write_text('#!/bin/sh\nprintf "wait\\n" >> "$FAKE_SLEEP_COUNT"\n')
            sleep.chmod(0o755)
            result = subprocess.run(["bash", "-c", self.command], capture_output=True, text=True, env={
                "PATH": str(scripts) + ":/usr/bin:/bin", "RUNNER_TEMP": temporary,
                "GITHUB_STEP_SUMMARY": str(directory / "summary"), "TESTED_SHA": SHA,
                "DEPLOY_HOST": "server.example.com", "DEPLOY_USER": "fixture-ci", "DEPLOY_PORT": "22",
                "DEPLOY_SSH_KEY": "secret-never-log-me", "DEPLOY_KNOWN_HOSTS": "fixture-host-key",
                "FAKE_SSH_BEHAVIOR": behavior, "FAKE_SSH_COUNT": str(directory / "calls"),
                "FAKE_SLEEP_COUNT": str(directory / "waits")
            }, timeout=10)
            self.assertEqual(list(directory.glob("deploy-ssh.*")), [])
            self.assertNotIn("secret-never-log-me", result.stdout + result.stderr)
            calls = int((directory / "calls").read_text())
            waits = (directory / "waits").read_text().count("wait") if (directory / "waits").exists() else 0
            return result.returncode, calls, waits

    def test_temporary_rejection_retries_and_succeeds(self):
        self.assertEqual(self.run_workflow("retry-once"), (0, 2, 1))

    def test_temporary_rejections_have_a_bounded_retry_budget(self):
        self.assertEqual(self.run_workflow("blocked"), (75, 11, 10))

    def test_deployment_and_transport_failures_are_not_retried(self):
        self.assertEqual(self.run_workflow("failure"), (1, 1, 0))
        self.assertEqual(self.run_workflow("transport"), (255, 1, 0))


if __name__ == "__main__":
    unittest.main()
