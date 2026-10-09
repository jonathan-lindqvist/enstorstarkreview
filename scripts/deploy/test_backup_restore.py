"""A real backup/restore rehearsal using uniquely named, disposable Docker resources."""

import gzip
import json
import os
import subprocess
import tempfile
import time
import unittest
import uuid
from pathlib import Path

from deploy import Deployment, DeploymentError, run_command


@unittest.skipUnless(os.environ.get("DEPLOY_TEST_DOCKER") == "1", "Enable the explicit disposable Docker rehearsal")
class BackupRestoreTests(unittest.TestCase):
    def test_real_app_replacement_backup_failure_and_rollback_preserve_both_volumes(self):
        prefix = "enstorstark-ci-" + uuid.uuid4().hex[:12]
        old_sha, target_sha, failed_sha = "b" * 40, "a" * 40, "c" * 40
        with tempfile.TemporaryDirectory() as temporary:
            app = Path(temporary) / "app"
            app.mkdir()
            (app / ".env").write_text("MONGO_ROOT_USERNAME=restore-test\nMONGO_ROOT_PASSWORD=local-test-only\n")
            (app / ".env").chmod(0o600)
            # A small real app container exercises Compose replacement and immutable image rollback.
            # HTTP/application behavior is covered separately by the complete Playwright suite.
            (app / "Dockerfile").write_text(
                'FROM node:22-bookworm-slim\nARG SOURCE_REVISION\nLABEL org.opencontainers.image.revision=$SOURCE_REVISION\nCMD ["sleep", "infinity"]\n'
            )
            (app / "docker-compose.yml").write_text(json.dumps({
                "services": {
                    "app": {
                        "container_name": prefix + "-app", "image": prefix + "-app:latest",
                        "build": ".", "volumes": ["app-images:/app/uploads/images"],
                        "depends_on": {"mongo": {"condition": "service_healthy"}}
                    },
                    "mongo": {
                        "container_name": prefix + "-mongo", "image": "mongo:7",
                        "environment": {
                            "MONGO_INITDB_ROOT_USERNAME": "${MONGO_ROOT_USERNAME}",
                            "MONGO_INITDB_ROOT_PASSWORD": "${MONGO_ROOT_PASSWORD}"
                        },
                        "volumes": ["mongo-data:/data/db"],
                        "healthcheck": {
                            "test": ["CMD-SHELL", 'mongosh --quiet --username "$$MONGO_INITDB_ROOT_USERNAME" --password "$$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "db.adminCommand({ping:1}).ok"'],
                            "interval": "1s", "timeout": "5s", "retries": 60
                        }
                    }
                }, "volumes": {"app-images": {}, "mongo-data": {}}
            }))
            backup_root = Path(temporary) / "backups"

            class RehearsalDeployment(Deployment):
                head = old_sha
                remote = target_sha
                backup_fails = False
                reject_revision = None

                def git(self, *args):
                    if args[:2] == ("remote", "get-url"):
                        return "https://github.com/jonathan-lindqvist/enstorstarkreview.git"
                    if args[0] == "branch":
                        return "main"
                    if args[0] == "rev-parse":
                        return self.remote if args[1] == "origin/main" else self.head
                    if args[0] == "merge":
                        self.head = args[-1]
                    return ""

                def backup(self, *args):
                    if self.backup_fails:
                        raise DeploymentError("Injected backup failure")
                    return super().backup(*args)

                def check_health(self, *, expected_sha=None, expected_image=None):
                    if expected_sha == self.reject_revision:
                        return False
                    if self.inspect("enstorstarkreview-app", "{{.State.Running}}") != "true":
                        return False
                    if self.inspect("enstorstarkreview-mongo", "{{.State.Health.Status}}") != "healthy":
                        return False
                    if expected_sha and self.inspect("enstorstarkreview-app", '{{index .Config.Labels "org.opencontainers.image.revision"}}') != expected_sha:
                        return False
                    return not expected_image or self.inspect("enstorstarkreview-app", "{{.Image}}") == expected_image

            def runner(args, **kwargs):
                translated = [
                    prefix + "-app" if value == "enstorstarkreview-app" else
                    prefix + "-mongo" if value == "enstorstarkreview-mongo" else
                    prefix + "_default" if value == "caddy_net" else value for value in args
                ]
                if args[:3] == ["docker", "volume", "inspect"]:
                    return temporary  # Docker owns the real mountpoint; the fixture image is 19 bytes.
                # Desktop may install Compose under the operator's HOME; production uses system plugins.
                try:
                    return run_command(["/usr/bin/env", f"HOME={Path.home()}", *translated], **kwargs)
                except DeploymentError as error:
                    cause = error.__cause__
                    if isinstance(cause, subprocess.CalledProcessError):
                        # These commands only see the isolated fixture credentials; keep those private too.
                        details = (cause.stderr or b"").decode().replace("local-test-only", "[test credential]")
                        raise AssertionError("Disposable Docker command failed: " + details) from error
                    raise

            deployment = RehearsalDeployment(app, backup_root, runner)
            deployment.project = prefix
            try:
                runner(deployment.compose("build", "--build-arg", f"SOURCE_REVISION={old_sha}", "app"), timeout=300)
                runner(deployment.compose("up", "-d"), timeout=180)
                mongo = deployment.inspect("enstorstarkreview-mongo", "{{.Id}}")
                initial_app = deployment.inspect("enstorstarkreview-app", "{{.Id}}")
                volume = json.loads(deployment.inspect("enstorstarkreview-app", "{{json .Mounts}}"))[0]["Name"]
                mongo_mounts = {
                    mount["Destination"]: mount["Name"] for mount in
                    json.loads(deployment.inspect("enstorstarkreview-mongo", "{{json .Mounts}}"))
                }
                run_command(["docker", "exec", prefix + "-app", "sh", "-c", "printf 'fixture image bytes' > /app/uploads/images/fixture.jpg"])
                mongo_query = "const connection = new Mongo('mongodb://restore-test:local-test-only@127.0.0.1:27017/?authSource=admin'); const db = connection.getDB('enstorstark');"
                run_command(["docker", "exec", prefix + "-mongo", "mongosh", "--nodb", "--quiet", "--eval", mongo_query + "db.bars.insertOne({slug:'deployment-check',image:'fixture.jpg'});"])
                self.assertTrue(deployment.deploy(target_sha))
                self.assertNotEqual(deployment.inspect("enstorstarkreview-app", "{{.Id}}"), initial_app)
                deployed_app = deployment.inspect("enstorstarkreview-app", "{{.Id}}")
                deployed_image = deployment.inspect("enstorstarkreview-app", "{{.Image}}")
                deployment.remote = failed_sha
                deployment.backup_fails = True
                with self.assertRaisesRegex(DeploymentError, "backup failure"):
                    deployment.deploy(failed_sha)
                self.assertEqual(deployment.inspect("enstorstarkreview-app", "{{.Id}}"), deployed_app)
                deployment.backup_fails = False
                deployment.reject_revision = failed_sha
                with self.assertRaisesRegex(DeploymentError, "previous app restored"):
                    deployment.deploy(failed_sha)
                self.assertEqual(deployment.inspect("enstorstarkreview-app", "{{.Image}}"), deployed_image)
                self.assertEqual(deployment.inspect("enstorstarkreview-mongo", "{{.Id}}"), mongo)
                self.assertEqual({
                    mount["Destination"]: mount["Name"] for mount in
                    json.loads(deployment.inspect("enstorstarkreview-mongo", "{{json .Mounts}}"))
                }, mongo_mounts)
                self.assertEqual(json.loads(deployment.inspect("enstorstarkreview-app", "{{json .Mounts}}"))[0]["Name"], volume)
                self.assertEqual(run_command(["docker", "exec", prefix + "-app", "cat", "/app/uploads/images/fixture.jpg"]), "fixture image bytes")
                self.assertEqual(run_command(["docker", "exec", prefix + "-mongo", "mongosh", "--nodb", "--quiet", "--eval", mongo_query + "print(db.bars.findOne({slug:'deployment-check'}).image);"]), "fixture.jpg")
            finally:
                # Only this randomly named, disposable project may have its volumes removed.
                subprocess.run(deployment.compose("down", "--volumes"), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                for backup in backup_root.glob("*/COMPLETE"):
                    tag = "enstorstarkreview-rollback:" + backup.parent.name.lower()
                    subprocess.run(["docker", "image", "rm", tag], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                subprocess.run(["docker", "image", "rm", prefix + "-app:latest"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)

    def test_both_archives_restore_real_data_and_corrupt_backups_fail(self):
        prefix = "enstorstark-ci-" + uuid.uuid4().hex[:12]
        containers = [prefix + "-source", prefix + "-target"]
        volumes = [prefix + suffix for suffix in ("-db-source", "-db-target", "-images-source", "-images-target")]
        try:
            for volume in volumes:
                run_command(["docker", "volume", "create", volume])
            for index, container in enumerate(containers):
                command = ["docker", "run", "-d", "--name", container, "--mount", f"type=volume,source={volumes[index]},target=/data/db"]
                if index == 0:
                    command.extend(["--env", "MONGO_INITDB_ROOT_USERNAME=restore-test", "--env", "MONGO_INITDB_ROOT_PASSWORD=local-test-only"])
                command.append("mongo:7")
                run_command(command)
            uri_js = "const uri = 'mongodb://restore-test:local-test-only@127.0.0.1:27017/?authSource=admin';"
            for index, container in enumerate(containers):
                deadline = time.monotonic() + 90
                while True:
                    try:
                        connection = uri_js + "const connection = new Mongo(uri);" if index == 0 else "const connection = new Mongo('mongodb://127.0.0.1:27017');"
                        result = run_command(["docker", "exec", container, "mongosh", "--nodb", "--quiet", "--eval", connection + "print(connection.getDB('admin').runCommand({ping:1}).ok);"])
                        if result == "1":
                            break
                    except DeploymentError:
                        pass
                    if time.monotonic() >= deadline:
                        self.fail("Disposable Mongo failed to start")
                    time.sleep(1)
            run_command(["docker", "exec", containers[0], "mongosh", "--nodb", "--quiet", "--eval", uri_js + "new Mongo(uri).getDB('enstorstark').bars.insertOne({slug:'restore-check',image:'fixture.jpg',publicationStatus:'published'});"])
            run_command(["docker", "run", "--rm", "--network", "none", "--mount", f"type=volume,source={volumes[2]},target=/data", "--entrypoint", "sh", "mongo:7", "-c", "printf 'fixture image bytes' > /data/fixture.jpg; chmod 644 /data/fixture.jpg"])
            image = run_command(["docker", "inspect", "--format", "{{.Image}}", containers[0]])
            with tempfile.TemporaryDirectory() as temporary:
                app = Path(temporary) / "app"
                app.mkdir()
                (app / "docker-compose.yml").write_text("services:\n  app:\n    image: mongo:7\n")
                backup_root = Path(temporary) / "backups"
                backup_root.mkdir(mode=0o700)
                deployment = Deployment(app, backup_root)
                deployment.project = prefix
                state = {"mongo": containers[0], "volume": volumes[2], "previous_image": image, "previous_commit": "b" * 40}
                # The rehearsal is unprivileged on the host; size inspection must happen in Docker.
                original_runner = deployment.runner
                deployment.runner = lambda args, **kwargs: temporary if args[:3] == ["docker", "volume", "inspect"] else original_runner(args, **kwargs)
                backup = deployment.backup("a" * 40, state)
                self.assertTrue((backup / "COMPLETE").exists())
                self.assertEqual((backup / "manifest.json").stat().st_mode & 0o777, 0o600)
                manifest = json.loads((backup / "manifest.json").read_text())
                self.assertTrue(manifest["live_backup"])
                self.assertEqual(len(manifest["sha256"]), 3)
                run_command(["docker", "exec", "-i", containers[1], "mongorestore", "--archive", "--gzip", "--quiet"], input_path=backup / "mongo.archive.gz")
                restored = run_command(["docker", "exec", containers[1], "mongosh", "enstorstark", "--quiet", "--eval", "print(db.bars.findOne({slug:'restore-check'}).image)"])
                self.assertEqual(restored, "fixture.jpg")
                run_command(["docker", "run", "--rm", "--network", "none", "--mount", f"type=volume,source={volumes[3]},target=/data", "--mount", f"type=bind,source={backup},target=/backup,readonly", "--entrypoint", "tar", image, "-xzf", "/backup/images.tar.gz", "-C", "/data"])
                restored_image = run_command(["docker", "run", "--rm", "--network", "none", "--mount", f"type=volume,source={volumes[3]},target=/data,readonly", "--entrypoint", "cat", image, "/data/fixture.jpg"])
                self.assertEqual(restored_image, "fixture image bytes")
                # A successful gzip envelope containing invalid Mongo data must still be rejected.
                def corrupt_dump(args, **kwargs):
                    if "mongodump" in args:
                        with gzip.open(kwargs["output_path"], "wb") as stream:
                            stream.write(b"not a Mongo archive")
                        return ""
                    return deployment.runner_before_corruption(args, **kwargs)
                deployment.runner_before_corruption = deployment.runner
                deployment.runner = corrupt_dump
                with self.assertRaises(DeploymentError):
                    deployment.backup("c" * 40, state)
                self.assertEqual(len(list(backup_root.glob("*/COMPLETE"))), 1)
        finally:
            for container in containers:
                subprocess.run(["docker", "rm", "-f", container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            for volume in volumes:
                subprocess.run(["docker", "volume", "rm", volume], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


if __name__ == "__main__":
    unittest.main()
