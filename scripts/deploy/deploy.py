#!/usr/bin/python3
"""Backup-first app deployment. Install root-owned outside the app checkout."""

import contextlib
import fcntl
import gzip
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

APP_DIR = Path("/opt/apps/enstorstarkreview")
BACKUP_DIR = Path("/opt/backups/enstorstarkreview")
SITE = "https://enstorstarkreview.se"
REPOSITORY = "jonathan-lindqvist/enstorstarkreview"
SHA_PATTERN = re.compile(r"[a-f0-9]{40}")


class DeploymentError(Exception):
    pass


def run_command(args, *, input_path=None, output_path=None, timeout=120):
    """Never forward command output/errors that could contain production secrets."""
    with contextlib.ExitStack() as stack:
        stdin = stack.enter_context(Path(input_path).open("rb")) if input_path else subprocess.DEVNULL
        stdout = stack.enter_context(Path(output_path).open("wb")) if output_path else subprocess.PIPE
        try:
            result = subprocess.run(
                args, stdin=stdin, stdout=stdout, stderr=subprocess.PIPE,
                check=True, timeout=timeout, env={
                    "PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "HOME": "/root",
                    "LANG": "C.UTF-8", "GIT_TERMINAL_PROMPT": "0"
                }
            )
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as error:
            raise DeploymentError(f"Command failed ({Path(args[0]).name}); inspect the VPS locally") from error
        return (result.stdout or b"").decode("utf-8").strip()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, _request, _fp, _code, _message, _headers, _url):
        return None


def private_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")
    path.chmod(0o600)


class Deployment:
    def __init__(self, app_dir=APP_DIR, backup_dir=BACKUP_DIR, runner=None, health=None):
        self.app_dir = Path(app_dir)
        self.backup_dir = Path(backup_dir)
        self.runner = runner or run_command
        self.health = health or self.check_health
        self.project = None

    def git(self, *args):
        # Do not run repository hooks or Git configuration as root.
        return self.runner(["runuser", "-u", "deploy", "--", "git", "-C", str(self.app_dir), *args])

    def compose(self, *args, files=None):
        command = [
            "docker", "compose", "--project-directory", str(self.app_dir),
            "--env-file", str(self.app_dir / ".env"), "--project-name", self.project
        ]
        for file in files or [self.app_dir / "docker-compose.yml"]:
            command.extend(["--file", str(file)])
        return [*command, *args]

    def inspect(self, name, template):
        value = self.runner(["docker", "inspect", "--format", template, name])
        if not value:
            raise DeploymentError("Missing Docker inspection result")
        return value

    def preflight(self, sha):
        if self.git("remote", "get-url", "origin") not in (
            f"https://github.com/{REPOSITORY}.git", f"git@github.com:{REPOSITORY}.git"
        ):
            raise DeploymentError("Unexpected Git origin")
        if self.git("status", "--porcelain", "--untracked-files=no"):
            raise DeploymentError("Tracked deployment files have local changes")
        if self.git("branch", "--show-current") != "main":
            raise DeploymentError("Deployment checkout must be on main")
        self.git("fetch", "origin", "main")
        if self.git("rev-parse", "origin/main") != sha:
            print("Skipping superseded commit", flush=True)
            return None
        self.git("merge-base", "--is-ancestor", "HEAD", sha)
        checkout_before = self.git("rev-parse", "HEAD")
        if not SHA_PATTERN.fullmatch(checkout_before):
            raise DeploymentError("Invalid previous commit")
        env_file = self.app_dir / ".env"
        if not env_file.is_file() or env_file.stat().st_mode & 0o077:
            raise DeploymentError("Production .env must exist with mode 600")
        app = self.inspect("enstorstarkreview-app", "{{.Id}}")
        revision = self.runner([
            "docker", "inspect", "--format",
            '{{index .Config.Labels "org.opencontainers.image.revision"}}', app
        ])
        previous = revision if SHA_PATTERN.fullmatch(revision) else checkout_before
        compose_files = self.inspect(
            app, '{{index .Config.Labels "com.docker.compose.project.config_files"}}'
        ).split(",")
        previous_compose = Path(compose_files[0]).resolve()
        normal_compose = [str((self.app_dir / "docker-compose.yml").resolve())]
        rollback_compose = [str(previous_compose), str(previous_compose.parent / "rollback.json")]
        if compose_files != normal_compose and not (
            compose_files == rollback_compose
            and previous_compose.name == "compose.previous.yml"
            and previous_compose.is_relative_to(self.backup_dir.resolve())
        ):
            raise DeploymentError("Unexpected running Compose definition; reconcile it before deployment")
        if not previous_compose.is_file():
            raise DeploymentError("Previous running Compose definition is missing")
        self.project = self.inspect(app, '{{index .Config.Labels "com.docker.compose.project"}}')
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", self.project):
            raise DeploymentError("Invalid Compose project")
        self.runner(self.compose("config", "--quiet"))
        self.runner(["docker", "network", "inspect", "--format", "{{.Name}}", "caddy_net"])
        mongo = self.runner(self.compose("ps", "-q", "mongo"))
        if not mongo or len(mongo.splitlines()) != 1:
            raise DeploymentError("Mongo container not found")
        if self.inspect(app, "{{.State.Running}}") != "true":
            raise DeploymentError("Existing app is not running")
        if self.inspect(mongo, "{{.State.Health.Status}}") != "healthy":
            raise DeploymentError("Mongo is not healthy")
        mounts = json.loads(self.inspect(app, "{{json .Mounts}}"))
        image_volumes = [
            mount["Name"] for mount in mounts
            if mount.get("Type") == "volume" and mount.get("Destination") == "/app/uploads/images"
        ]
        if len(image_volumes) != 1:
            raise DeploymentError("Expected existing uploaded-image volume is missing")
        volume = image_volumes[0]
        self.runner(["docker", "volume", "inspect", "--format", "{{.Mountpoint}}", volume])
        image = self.inspect(app, "{{.Image}}")
        # A failed build can advance the checkout while the old container still uses its image.
        # Recover the immutable Compose snapshot captured before that checkout update.
        if compose_files == normal_compose:
            for backup in sorted(self.backup_dir.iterdir(), reverse=True):
                if not backup.is_dir() or not (backup / "COMPLETE").is_file():
                    continue
                manifest = json.loads((backup / "manifest.json").read_text())
                if manifest.get("previous_image") != image:
                    continue
                saved = backup / "compose.previous.yml"
                digest = hashlib.sha256(saved.read_bytes()).hexdigest()
                if manifest.get("sha256", {}).get(saved.name) != digest:
                    raise DeploymentError("Saved running Compose definition failed its checksum")
                previous_compose = saved
                break
        return {
            "previous_commit": previous, "checkout_before": checkout_before,
            "previous_commit_source": "image_label" if previous == revision else "checkout_fallback",
            "previous_compose": previous_compose, "previous_image": image,
            "mongo": mongo, "volume": volume
        }

    def backup(self, sha, state):
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        directory = self.backup_dir / f"{stamp}-{sha[:12]}-{uuid.uuid4().hex[:8]}"
        directory.mkdir(mode=0o700)
        config_path = f"/tmp/enstorstark-backup-{uuid.uuid4().hex}.json"
        mongo = state["mongo"]
        config_script = """
const fs = require('fs');
const user = process.env.MONGO_INITDB_ROOT_USERNAME;
const password = process.env.MONGO_INITDB_ROOT_PASSWORD;
if (!user || !password) throw new Error('Mongo credentials are missing');
const uri = 'mongodb://' + encodeURIComponent(user) + ':' + encodeURIComponent(password)
  + '@127.0.0.1:27017/?authSource=admin';
fs.writeFileSync(process.env.BACKUP_CONFIG, JSON.stringify({ uri }), { mode: 0o600 });
const stats = new Mongo(uri).getDB('enstorstark').stats();
print(JSON.stringify({ bytes: stats.dataSize + stats.indexSize }));
"""
        try:
            stats = json.loads(self.runner([
                "docker", "exec", "--env", f"BACKUP_CONFIG={config_path}", mongo,
                "mongosh", "--nodb", "--quiet", "--eval", config_script
            ]))
            mongo_bytes = stats.get("bytes")
            if not isinstance(mongo_bytes, (int, float)) or mongo_bytes < 0:
                raise DeploymentError("Invalid Mongo backup size estimate")
            image_path = Path(self.runner([
                "docker", "volume", "inspect", "--format", "{{.Mountpoint}}", state["volume"]
            ]))
            image_bytes = sum(
                file.lstat().st_size for file in image_path.rglob("*") if file.is_file()
            )
            required = 2 * (mongo_bytes + image_bytes) + 256 * 1024 * 1024
            if shutil.disk_usage(directory).free < required:
                raise DeploymentError("Insufficient disk space for verified backups")
            print("Backing up MongoDB and uploaded images (app stays online)", flush=True)
            archive = directory / "mongo.archive.gz"
            self.runner([
                "docker", "exec", mongo, "mongodump", f"--config={config_path}",
                "--db=enstorstark", "--archive", "--gzip", "--quiet"
            ], output_path=archive, timeout=1800)
            self.runner([
                "docker", "run", "--rm", "--network", "none", "--read-only",
                "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--user", f"{os.getuid()}:{os.getgid()}",
                "--entrypoint", "sh", "--mount",
                f"type=volume,source={state['volume']},target=/data,readonly", "--mount",
                f"type=bind,source={directory},target=/backup", state["previous_image"],
                "-c", "umask 077; exec tar -czf /backup/images.tar.gz -C /data ."
            ], timeout=1800)
            images = directory / "images.tar.gz"
            for file in (archive, images):
                file.chmod(0o600)
                if file.stat().st_size == 0:
                    raise DeploymentError("A backup archive is empty")
                with gzip.open(file, "rb") as stream, open(os.devnull, "wb") as sink:
                    shutil.copyfileobj(stream, sink)
            self.runner([
                "docker", "exec", "-i", mongo, "mongorestore", f"--config={config_path}",
                "--archive", "--gzip", "--dryRun", "--quiet"
            ], input_path=archive, timeout=1800)
            self.runner(["tar", "-tzf", str(images)], timeout=1800)
        finally:
            self.runner(["docker", "exec", mongo, "rm", "-f", "--", config_path])
        previous_compose = directory / "compose.previous.yml"
        shutil.copyfile(state.get("previous_compose", self.app_dir / "docker-compose.yml"), previous_compose)
        previous_compose.chmod(0o600)
        manifest = {
            "target_commit": sha, "created_at": stamp,
            "previous_commit": state["previous_commit"], "previous_image": state["previous_image"],
            "previous_commit_source": state.get("previous_commit_source", "checkout_fallback"),
            "checkout_before": state.get("checkout_before", state["previous_commit"]),
            "image_volume": state["volume"], "project": self.project,
            "live_backup": True, "sha256": {}
        }
        for file in (archive, images, previous_compose):
            with file.open("rb") as stream:
                manifest["sha256"][file.name] = hashlib.file_digest(stream, "sha256").hexdigest()
        private_json(directory / "manifest.json", manifest)
        (directory / "COMPLETE").touch(mode=0o600)
        print(f"Verified backup: {directory.name}", flush=True)
        return directory

    def check_health(self, *, expected_sha=None, expected_image=None):
        opener = urllib.request.build_opener(NoRedirect())
        deadline = time.monotonic() + 120
        while True:
            try:
                if self.inspect("enstorstarkreview-app", "{{.State.Running}}") != "true":
                    raise DeploymentError("App is not running")
                if self.inspect("enstorstarkreview-mongo", "{{.State.Health.Status}}") != "healthy":
                    raise DeploymentError("Mongo is not healthy")
                if expected_image and self.inspect("enstorstarkreview-app", "{{.Image}}") != expected_image:
                    raise DeploymentError("Recovered app image differs from the previous image")
                if expected_sha and self.inspect(
                    "enstorstarkreview-app", '{{index .Config.Labels "org.opencontainers.image.revision"}}'
                ) != expected_sha:
                    raise DeploymentError("Running app revision differs from tested commit")
                for path in ("/", "/about", "/feed.xml"):
                    with opener.open(SITE + path, timeout=5) as response:
                        if response.status != 200:
                            raise DeploymentError("Public health check failed")
                try:
                    opener.open("https://www.enstorstarkreview.se/", timeout=5)
                except urllib.error.HTTPError as response:
                    if response.code not in (301, 308) or response.headers.get("Location") != SITE + "/":
                        raise DeploymentError("WWW redirect health check failed")
                else:
                    raise DeploymentError("WWW must redirect")
                return True
            except (DeploymentError, urllib.error.URLError, OSError):
                if time.monotonic() >= deadline:
                    return False
                time.sleep(3)

    def deploy(self, sha):
        if not isinstance(sha, str) or not SHA_PATTERN.fullmatch(sha) or sha == "0" * 40:
            raise DeploymentError("Expected one nonzero, lowercase, 40-character commit SHA")
        self.backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.backup_dir.chmod(0o700)
        with (self.backup_dir / ".deploy.lock").open("a") as lock:
            os.chmod(lock.name, 0o600)
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise DeploymentError("A deployment is already running") from error
            state = self.preflight(sha)
            if state is None:
                return False
            directory = self.backup(sha, state)
            rollback_image = "enstorstarkreview-rollback:" + directory.name.lower()
            self.runner(["docker", "image", "tag", state["previous_image"], rollback_image])
            # A newer merge may arrive during backup/build. Never deploy an older queued run.
            self.git("fetch", "origin", "main")
            if self.git("rev-parse", "origin/main") != sha:
                print("Skipping superseded commit after backup", flush=True)
                return False
            self.git("merge", "--ff-only", sha)
            if self.git("rev-parse", "HEAD") != sha:
                raise DeploymentError("Checkout does not match tested commit")
            self.runner(self.compose("config", "--quiet"))
            print("Building tested app revision", flush=True)
            self.runner(self.compose("build", "--no-cache", "--build-arg", f"SOURCE_REVISION={sha}", "app"), timeout=1800)
            self.git("fetch", "origin", "main")
            if self.git("rev-parse", "origin/main") != sha:
                print("Skipping superseded commit after build", flush=True)
                return False
            try:
                self.runner(self.compose("up", "-d", "--no-deps", "--no-build", "--force-recreate", "app"))
                if not self.health(expected_sha=sha):
                    raise DeploymentError("New app health checks failed")
            except DeploymentError as error:
                override = directory / "rollback.json"
                private_json(override, {"services": {"app": {"image": rollback_image}}})
                print("Deployment failed; restoring previous app image", flush=True)
                try:
                    self.runner(self.compose(
                        "up", "-d", "--no-deps", "--no-build", "--force-recreate", "app",
                        files=[directory / "compose.previous.yml", override]
                    ))
                    if not self.health(expected_image=state["previous_image"]):
                        raise DeploymentError("Previous app health checks failed")
                except DeploymentError as rollback_error:
                    raise DeploymentError("Deployment and rollback failed; operator recovery required") from rollback_error
                raise DeploymentError("Deployment failed; previous app restored") from error
            private_json(directory / "DEPLOYED.json", {"commit": sha, "image": self.inspect("enstorstarkreview-app", "{{.Image}}")})
            print(f"Deployed {sha}", flush=True)
            return True


def main():
    os.umask(0o077)
    if os.geteuid() != 0:
        raise DeploymentError("Run the installed helper using its dedicated sudo rule")
    if len(sys.argv) != 2:
        raise DeploymentError("Usage: enstorstarkreview-deploy COMMIT_SHA")
    Deployment().deploy(sys.argv[1])


if __name__ == "__main__":
    try:
        main()
    except (DeploymentError, OSError, ValueError, KeyError) as error:
        # Unexpected decoding/filesystem errors can include unsafe values; keep logs generic.
        message = str(error) if isinstance(error, DeploymentError) else "Deployment failed; inspect the VPS locally"
        print(message, file=sys.stderr)
        sys.exit(1)
