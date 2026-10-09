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
