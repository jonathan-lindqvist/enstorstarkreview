#!/usr/bin/python3
"""Backup-first app deployment. Install root-owned outside the app checkout."""

import contextlib
import copy
import fcntl
import gzip
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit

CONFIG_PATH = Path("/etc/enstorstarkreview/deploy.json")
MAX_CONFIG_BYTES = 16 * 1024
SHA_PATTERN = re.compile(r"[a-f0-9]{40}")
REQUEST_COOLDOWN_SECONDS = 300
MAX_REQUEST_STATE_BYTES = 2048


class DeploymentError(Exception):
    pass


class TemporaryDeploymentError(DeploymentError):
    """Exit 75 lets the workflow retry admission without retrying deployment failures."""


RECOVERY_ERRORS = (DeploymentError, OSError, ValueError, KeyError, TypeError)


def duration_ns(value):
    units = {"h": 3_600_000_000_000, "m": 60_000_000_000, "s": 1_000_000_000,
             "ms": 1_000_000, "us": 1000, "µs": 1000, "ns": 1}
    parts = re.findall(r"(\d+(?:\.\d+)?)(ms|us|µs|ns|h|m|s)", str(value))
    if str(value) == "0":
        return 0
    if not parts or "".join(number + unit for number, unit in parts) != str(value):
        raise DeploymentError("Invalid Mongo health-check duration")
    result = sum(Decimal(number) * units[unit] for number, unit in parts)
    if result != int(result):
        raise DeploymentError("Invalid Mongo health-check duration")
    return int(result)


def healthcheck_config(value):
    if not isinstance(value, dict) or not value.get("test") or value.get("disable"):
        raise DeploymentError("An explicit Mongo health check is required; use separate Mongo maintenance")
    return {
        "Test": value["test"], "Retries": value.get("retries", 0),
        **{engine: duration_ns(value.get(compose, "0")) for compose, engine in [
            ("interval", "Interval"), ("timeout", "Timeout"),
            ("start_period", "StartPeriod"), ("start_interval", "StartInterval")
        ]}
    }


def effective_healthcheck(value):
    return {key: value.get(key, [] if key == "Test" else 0) for key in
            ("Test", "Interval", "Timeout", "Retries", "StartPeriod", "StartInterval")}


def compose_strings(value):
    """A resolved model must survive Compose interpolation a second time, including secrets."""
    if isinstance(value, str):
        return value.replace("$", "$$")
    if isinstance(value, list):
        return [compose_strings(item) for item in value]
    if isinstance(value, dict):
        return {key: compose_strings(item) for key, item in value.items()}
    return value


@dataclass(frozen=True)
class DeploymentConfig:
    app_dir: Path
    backup_dir: Path
    git_user: str
    repository: str
    site_url: str
    www_url: str
    app_container: str
    mongo_container: str
    caddy_network: str
    image_mount: str
    database: str

    @classmethod
    def from_dict(cls, values):
        if not isinstance(values, dict) or set(values) != set(cls.__dataclass_fields__):
            raise DeploymentError("Invalid deployment configuration fields")
        if any(
            not isinstance(value, str) or not value or len(value) > 4096
            or any(ord(character) < 32 or ord(character) == 127 for character in value)
            for value in values.values()
        ):
            raise DeploymentError("Invalid deployment configuration values")

        def absolute_path(value):
            path = Path(value)
            if not path.is_absolute() or str(path) != value or ".." in path.parts or len(path.parts) < 3:
                raise DeploymentError("Use specific absolute deployment directories")
            return path

        app = absolute_path(values["app_dir"])
        backups = absolute_path(values["backup_dir"])
        if app.is_relative_to(backups) or backups.is_relative_to(app):
            raise DeploymentError("Application and backup directories must be separate")
        absolute_path(values["image_mount"])
        if not re.fullmatch(r"[a-z_][a-z0-9_-]{0,31}", values["git_user"]) or values["git_user"] == "root":
            raise DeploymentError("Configure a non-root Git checkout owner")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*", values["repository"]):
            raise DeploymentError("Invalid repository identifier")
        for key in ("app_container", "mongo_container", "caddy_network"):
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", values[key]):
                raise DeploymentError("Invalid container or network identifier")
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,63}", values["database"]):
            raise DeploymentError("Invalid database identifier")
        for key in ("site_url", "www_url"):
            url = urlsplit(values[key])
            if (
                url.scheme != "https" or not url.hostname or url.username is not None
                or url.password is not None or url.path not in ("", "/")
                or url.query or url.fragment or (url.port is not None and not 1 <= url.port <= 65535)
            ):
                raise DeploymentError("Configure HTTPS health URLs without credentials or query strings")
        return cls(**{
            **values, "app_dir": app, "backup_dir": backups,
            "site_url": values["site_url"].rstrip("/"),
            "www_url": values["www_url"].rstrip("/") + "/"
        })


def load_config(path):
    """Read only a bounded root-owned file in a protected directory, never runner input."""
    try:
        for parent in path.parents:
            metadata = parent.lstat()
            # A root-owned child is protected in sticky ancestors such as /tmp in tests.
            writable = metadata.st_mode & 0o022
            if (
                not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0
                or (writable and (parent == path.parent or not metadata.st_mode & stat.S_ISVTX))
            ):
                raise DeploymentError("Deployment configuration directories must be root-owned and protected")
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK)
        with os.fdopen(descriptor, "rb") as source:
            metadata = os.fstat(source.fileno())
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_mode & 0o077:
                raise DeploymentError("Deployment configuration must be a private root-owned regular file")
            if metadata.st_size > MAX_CONFIG_BYTES:
                raise DeploymentError("Deployment configuration is too large")
            content = source.read(MAX_CONFIG_BYTES + 1)
        if len(content) > MAX_CONFIG_BYTES:
            raise DeploymentError("Deployment configuration is too large")
        return DeploymentConfig.from_dict(json.loads(content))
    except (OSError, ValueError, TypeError) as error:
        raise DeploymentError("Cannot read valid private deployment configuration; inspect the VPS locally") from error


def validate_sha(sha):
    if not isinstance(sha, str) or not SHA_PATTERN.fullmatch(sha) or sha == "0" * 40:
        raise DeploymentError("Expected one nonzero, lowercase, 40-character commit SHA")


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
    def __init__(self, config, runner=None, health=None):
        self.config = config
        self.app_dir = config.app_dir
        self.backup_dir = config.backup_dir
        self.runner = runner or run_command
        self.health = health or self.check_health
        self.project = None

    def git(self, *args):
        # Do not run repository hooks or Git configuration as root.
        return self.runner(["runuser", "-u", self.config.git_user, "--", "git", "-C", str(self.app_dir), *args])

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

    def revision_model(self, sha):
        # Resolve only a tested revision, with the existing project and protected environment.
        # Keep the result in memory: neither command output nor environment belongs in CI logs.
        source = self.git("show", f"{sha}:docker-compose.yml")
        with tempfile.TemporaryDirectory(prefix=".mongo-preflight-", dir=self.backup_dir) as temporary:
            path = Path(temporary) / "compose.source.yml"
            path.write_text(source)
            path.chmod(0o600)
            # Compose re-escapes every dollar in its rendered JSON, including environment values.
            rendered = self.runner(self.compose("config", "--format", "json", files=[path]))
            model = json.loads(rendered.replace("$$", "$"))
        return model

    def mongo_snapshot(self):
        container = self.config.mongo_container
        return {
            "image": self.inspect(container, "{{.Image}}"),
            **{key: json.loads(self.inspect(container, template)) for key, template in [
                ("config", "{{json .Config}}"), ("mounts", "{{json .Mounts}}"),
                ("logging", "{{json .HostConfig.LogConfig}}"),
                ("networks", "{{json .NetworkSettings.Networks}}"),
                ("restart", "{{json .HostConfig.RestartPolicy}}")
            ]}
        }

    def mongo_baseline(self, revision, image):
        path = self.backup_dir / ".mongo-baseline.json"
        try:
            descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK)
        except FileNotFoundError:
            return revision if SHA_PATTERN.fullmatch(revision) and revision != "0" * 40 else None
        try:
            with os.fdopen(descriptor, "rb") as source:
                metadata = os.fstat(source.fileno())
                if (not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.geteuid()
                        or metadata.st_mode & 0o077 or metadata.st_size > MAX_CONFIG_BYTES):
                    raise ValueError("Unsafe Mongo baseline")
                value = json.loads(source.read(MAX_CONFIG_BYTES + 1))
            if (not isinstance(value, dict) or set(value) != {"commit", "image"}
                    or not isinstance(value["commit"], str) or not SHA_PATTERN.fullmatch(value["commit"])
                    or value["image"] != image):
                raise ValueError("Unknown Mongo baseline")
            validate_sha(value["commit"])
            return value["commit"]
        except RECOVERY_ERRORS as error:
            raise DeploymentError("Mongo baseline needs operator verification before separate Mongo maintenance") from error

    def record_mongo_baseline(self, sha, image):
        temporary = self.backup_dir / f".mongo-baseline-{uuid.uuid4().hex}.tmp"
        try:
            private_json(temporary, {"commit": sha, "image": image})
            os.replace(temporary, self.backup_dir / ".mongo-baseline.json")
        finally:
            temporary.unlink(missing_ok=True)

    def mongo_plan(self, sha, revision, previous):
        runtime = self.mongo_snapshot()
        baseline = self.mongo_baseline(revision, runtime["image"])
        before = self.revision_model(baseline or previous)
        target = self.revision_model(sha)

        def protected(model):
            service = {key: value for key, value in model["services"]["mongo"].items()
                       if key not in ("logging", "healthcheck")}
            return {
                "service": service,
                "volumes": {mount["source"]: model["volumes"][mount["source"]]
                            for mount in service.get("volumes", []) if mount.get("type") == "volume"},
                "networks": {name: model["networks"][name] for name in service.get("networks", {})}
            }

        if protected(before) != protected(target) or self.git(
            "diff", "--name-only", baseline or previous, sha, "--",
            "db/Dockerfile", "db/init.js", "db/.dockerignore"
        ):
            raise DeploymentError("Mongo image, build inputs or protected configuration changed; use separate Mongo maintenance")
        service = target["services"]["mongo"]
        logging = service.get("logging", {})
        if not logging.get("driver"):
            raise DeploymentError("Explicit Mongo logging is required; use separate Mongo maintenance")
        desired = {"logging": {"Type": logging["driver"], "Config": logging.get("options", {})},
                   "healthcheck": healthcheck_config(service.get("healthcheck"))}
        self.validate_mongo_runtime(target, runtime)
        changed = (runtime["logging"] != desired["logging"] or
                   effective_healthcheck(runtime["config"].get("Healthcheck", {})) != desired["healthcheck"])
        if changed and not baseline:
            raise DeploymentError("Mongo maintenance requires an operator-verified revision baseline")
        print("Mongo logging and health-check settings " + ("need maintenance" if changed else "are current"), flush=True)
        return {"changed": changed, "runtime": runtime, "target": target, "desired": desired}

    def validate_mongo_runtime(self, model, runtime):
        service = model["services"]["mongo"]
        image = json.loads(self.runner(["docker", "image", "inspect", "--format", "{{json .Config}}", runtime["image"]]))
        environment = dict(item.split("=", 1) for item in image.get("Env", []) or [])
        environment.update(service.get("environment", {}))
        actual_environment = dict(item.split("=", 1) for item in runtime["config"].get("Env", []) or [])
        networks = {model["networks"][name]["name"] for name in service.get("networks", {})}
        restart = service.get("restart", "no").split(":")
        expected_restart = {"Name": restart[0], "MaximumRetryCount": int(restart[1]) if len(restart) == 2 else 0}
        checks = {
            "container name": service.get("container_name") == self.config.mongo_container,
            "environment": environment == actual_environment,
            "command": (image.get("Cmd") if service.get("command") is None else service["command"]) == runtime["config"].get("Cmd"),
            "entrypoint": (image.get("Entrypoint") if service.get("entrypoint") is None else service["entrypoint"]) == runtime["config"].get("Entrypoint"),
            "restart policy": expected_restart == runtime["restart"],
            "networks": networks == set(runtime["networks"])
        }
        mounts = {mount["Destination"]: mount for mount in runtime["mounts"]}
        expected_destinations = set(image.get("Volumes", {}) or {})
        for mount in service.get("volumes", []):
            actual = mounts.get(mount["target"], {})
            expected_destinations.add(mount["target"])
            checks["volumes"] = checks.get("volumes", True) and (
                mount["type"] == "volume" and actual.get("Type") == "volume"
                and actual.get("Name") == model["volumes"][mount["source"]]["name"]
                and actual.get("RW") == (not mount.get("read_only", False))
            )
        checks["volumes"] = checks.get("volumes", True) and set(mounts) == expected_destinations and all(
            mount.get("Type") == "volume" and mount.get("Name") for mount in mounts.values()
        )
        differences = ", ".join(key for key, valid in checks.items() if not valid)
        if differences:
            raise DeploymentError(f"Running Mongo {differences} differ; use separate Mongo maintenance")

    def mongo_files(self, directory, plan):
        runtime = plan["runtime"]
        model = copy.deepcopy(plan["target"])
        service = model["services"]["mongo"]
        model["services"] = {"mongo": service}
        model["volumes"] = {}
        for index, mount in enumerate(runtime["mounts"]):
            name = f"mongo-volume-{index}"
            model["volumes"][name] = {"external": True, "name": mount["Name"]}
        original_mounts = {mount["target"]: mount for mount in service.get("volumes", [])}
        service["volumes"] = [
            {**original_mounts.get(mount["Destination"], {}), "type": "volume", "source": f"mongo-volume-{index}",
             "target": mount["Destination"], "read_only": not mount["RW"]}
            for index, mount in enumerate(runtime["mounts"])
        ]
        model["networks"] = {name: {"external": True, "name": model["networks"][name]["name"]}
                             for name in service.get("networks", {})}
        service.pop("build", None)
        service["image"] = runtime["image"]
        target = directory / "mongo.target.json"
        private_json(target, compose_strings(model))
        service["logging"] = {"driver": runtime["logging"]["Type"], "options": runtime["logging"].get("Config", {})}
        healthcheck = effective_healthcheck(runtime["config"]["Healthcheck"])
        service["healthcheck"] = {
            "test": healthcheck["Test"], "retries": healthcheck["Retries"],
            **{compose: f"{healthcheck[engine]}ns" for compose, engine in [
                ("interval", "Interval"), ("timeout", "Timeout"),
                ("start_period", "StartPeriod"), ("start_interval", "StartInterval")
            ] if healthcheck[engine]}
        }
        previous = directory / "mongo.previous.json"
        private_json(previous, compose_strings(model))
        return [previous, target]

    def verify_mongo(self, plan, *, previous=False):
        actual = self.mongo_snapshot()
        expected = plan["runtime"]
        def mounts(value):
            return sorted((mount["Destination"], mount["Type"], mount.get("Name"), mount["RW"])
                          for mount in value["mounts"])
        settings = ({"logging": expected["logging"], "healthcheck": effective_healthcheck(expected["config"]["Healthcheck"])}
                    if previous else plan["desired"])
        if (actual["image"] != expected["image"] or mounts(actual) != mounts(expected)
                or actual["logging"] != settings["logging"]
                or effective_healthcheck(actual["config"].get("Healthcheck", {})) != settings["healthcheck"]
                or any(actual["config"].get(key) != expected["config"].get(key) for key in ("Cmd", "Entrypoint"))
                or dict(item.split("=", 1) for item in actual["config"].get("Env", []) or []) !=
                   dict(item.split("=", 1) for item in expected["config"].get("Env", []) or [])
                or actual["restart"] != expected["restart"] or set(actual["networks"]) != set(expected["networks"])
                or self.inspect(self.config.mongo_container, "{{.State.Health.Status}}") != "healthy"):
            raise DeploymentError("Mongo maintenance verification failed")

    def mongo_up(self, file):
        self.runner(self.compose(
            "up", "-d", "--no-deps", "--no-build", "--pull", "never", "--force-recreate",
            "--wait", "--wait-timeout", "120", "mongo", files=[file]
        ), timeout=150)

    def maintain_mongo(self, sha, state):
        attempted = False
        directory = None
        try:
            print("Pausing application writes for Mongo settings maintenance", flush=True)
            self.runner(["docker", "stop", state["app"]])
            directory = self.backup(sha, {**state, "live_backup": False})
            self.git("fetch", "origin", "main")
            if self.git("rev-parse", "origin/main") != sha:
                self.runner(["docker", "start", state["app"]])
                if not self.health(expected_image=state["previous_image"]):
                    raise DeploymentError("Previous app health checks failed")
                print("Skipping superseded commit after maintenance backup", flush=True)
                return None
            attempted = True
            self.mongo_up(directory / "mongo.target.json")
            self.verify_mongo(state["mongo_plan"])
            self.record_mongo_baseline(sha, state["mongo_plan"]["runtime"]["image"])
        except RECOVERY_ERRORS as error:
            try:
                if attempted:
                    self.mongo_up(directory / "mongo.previous.json")
                    self.verify_mongo(state["mongo_plan"], previous=True)
                self.runner(["docker", "start", state["app"]])
                if not self.health(expected_image=state["previous_image"]):
                    raise DeploymentError("Previous app health checks failed")
            except RECOVERY_ERRORS as rollback_error:
                with contextlib.suppress(*RECOVERY_ERRORS):
                    self.runner(["docker", "stop", self.config.app_container])
                raise DeploymentError("Mongo maintenance and rollback failed; app stopped; operator recovery required") from rollback_error
            raise DeploymentError("Mongo maintenance failed; previous app restored") from error
        print("Mongo logging and health-check settings applied", flush=True)
        return directory

    def admit_request(self):
        """Persist admission under the deployment lock before any Git or Docker work."""
        path = self.backup_dir / ".deployment-request.json"
        try:
            try:
                descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK)
            except FileNotFoundError:
                last_attempt = None
            else:
                with os.fdopen(descriptor, "rb") as source:
                    metadata = os.fstat(source.fileno())
                    if (
                        not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != os.geteuid()
                        or metadata.st_mode & 0o077 or metadata.st_size > MAX_REQUEST_STATE_BYTES
                    ):
                        raise ValueError("Unsafe request state")
                    content = source.read(MAX_REQUEST_STATE_BYTES + 1)
                if len(content) > MAX_REQUEST_STATE_BYTES:
                    raise ValueError("Oversized request state")
                state = json.loads(content)
                if not isinstance(state, dict) or set(state) != {"last_attempt_at"}:
                    raise ValueError("Invalid request state fields")
                last_attempt = state["last_attempt_at"]
                if type(last_attempt) is not int or not 0 <= last_attempt <= 2**53 - 1:
                    raise ValueError("Invalid request timestamp")
            now = int(time.time())
            if last_attempt is not None and last_attempt + REQUEST_COOLDOWN_SECONDS > now:
                remaining = last_attempt + REQUEST_COOLDOWN_SECONDS - now
                raise TemporaryDeploymentError(f"Deployment requests are rate-limited; retry in {remaining} seconds")
            temporary = self.backup_dir / f".deployment-request-{uuid.uuid4().hex}.tmp"
            try:
                private_json(temporary, {"last_attempt_at": now})
                with temporary.open("rb") as source:
                    os.fsync(source.fileno())
                os.replace(temporary, path)
                directory = os.open(self.backup_dir, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
                try:
                    os.fsync(directory)
                finally:
                    os.close(directory)
            finally:
                temporary.unlink(missing_ok=True)
        except (OSError, ValueError, TypeError) as error:
            raise DeploymentError("Invalid or unwritable deployment rate-limit state; inspect the VPS locally") from error

    def preflight(self, sha):
        if self.git("remote", "get-url", "origin") not in (
            f"https://github.com/{self.config.repository}.git", f"git@github.com:{self.config.repository}.git"
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
        app = self.inspect(self.config.app_container, "{{.Id}}")
        revision = self.runner([
            "docker", "inspect", "--format",
            '{{index .Config.Labels "org.opencontainers.image.revision"}}', app
        ])
        previous = revision if SHA_PATTERN.fullmatch(revision) and revision != "0" * 40 else checkout_before
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
        self.runner(["docker", "network", "inspect", "--format", "{{.Name}}", self.config.caddy_network])
        mongo = self.runner(self.compose("ps", "-q", "mongo"))
        if not mongo or len(mongo.splitlines()) != 1:
            raise DeploymentError("Mongo container not found")
        if self.inspect(self.config.mongo_container, "{{.Id}}") != mongo:
            raise DeploymentError("Configured Mongo container differs from Compose")
        if self.inspect(app, "{{.State.Running}}") != "true":
            raise DeploymentError("Existing app is not running")
        if self.inspect(mongo, "{{.State.Health.Status}}") != "healthy":
            raise DeploymentError("Mongo is not healthy")
        mongo_plan = self.mongo_plan(sha, revision, previous)
        if revision == sha:
            if not self.health(expected_sha=sha):
                raise DeploymentError("Already-running revision failed health checks; operator recovery required")
            if not mongo_plan["changed"]:
                print("Skipping already-running healthy commit", flush=True)
                return None
        mounts = json.loads(self.inspect(app, "{{json .Mounts}}"))
        image_volumes = [
            mount["Name"] for mount in mounts
            if mount.get("Type") == "volume" and mount.get("Destination") == self.config.image_mount
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
            "mongo": mongo, "volume": volume, "app": app,
            "same_revision": revision == sha, "mongo_plan": mongo_plan
        }

    def backup(self, sha, state):
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        directory = self.backup_dir / f"{stamp}-{sha[:12]}-{uuid.uuid4().hex[:8]}"
        directory.mkdir(mode=0o700)
        config_path = f"/tmp/deployment-backup-{uuid.uuid4().hex}.json"
        mongo = state["mongo"]
        config_script = """
const fs = require('fs');
const user = process.env.MONGO_INITDB_ROOT_USERNAME;
const password = process.env.MONGO_INITDB_ROOT_PASSWORD;
if (!user || !password) throw new Error('Mongo credentials are missing');
const uri = 'mongodb://' + encodeURIComponent(user) + ':' + encodeURIComponent(password)
  + '@127.0.0.1:27017/?authSource=admin';
fs.writeFileSync(process.env.BACKUP_CONFIG, JSON.stringify({ uri }), { mode: 0o600 });
const stats = new Mongo(uri).getDB(process.env.BACKUP_DATABASE).stats();
print(JSON.stringify({ bytes: stats.dataSize + stats.indexSize }));
"""
        try:
            stats = json.loads(self.runner([
                "docker", "exec", "--env", f"BACKUP_CONFIG={config_path}",
                "--env", f"BACKUP_DATABASE={self.config.database}", mongo,
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
            consistency = "app stays online" if state.get("live_backup", True) else "application writes paused"
            print(f"Backing up MongoDB and uploaded images ({consistency})", flush=True)
            archive = directory / "mongo.archive.gz"
            self.runner([
                "docker", "exec", mongo, "mongodump", f"--config={config_path}",
                f"--db={self.config.database}", "--archive", "--gzip", "--quiet"
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
            "live_backup": state.get("live_backup", True), "sha256": {}
        }
        files = [archive, images, previous_compose]
        if state.get("mongo_plan", {}).get("changed"):
            plan = state["mongo_plan"]
            runtime = plan["runtime"]
            manifest["mongo"] = {key: runtime[key] for key in ("image", "mounts", "logging")}
            manifest["mongo"]["healthcheck"] = runtime["config"]["Healthcheck"]
            files.extend(self.mongo_files(directory, plan))
        for file in files:
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
                if self.inspect(self.config.app_container, "{{.State.Running}}") != "true":
                    raise DeploymentError("App is not running")
                if self.inspect(self.config.mongo_container, "{{.State.Health.Status}}") != "healthy":
                    raise DeploymentError("Mongo is not healthy")
                if expected_image and self.inspect(self.config.app_container, "{{.Image}}") != expected_image:
                    raise DeploymentError("Recovered app image differs from the previous image")
                if expected_sha and self.inspect(
                    self.config.app_container, '{{index .Config.Labels "org.opencontainers.image.revision"}}'
                ) != expected_sha:
                    raise DeploymentError("Running app revision differs from tested commit")
                for path in ("/", "/about", "/feed.xml"):
                    with opener.open(self.config.site_url + path, timeout=5) as response:
                        if response.status != 200:
                            raise DeploymentError("Public health check failed")
                try:
                    opener.open(self.config.www_url, timeout=5)
                except urllib.error.HTTPError as response:
                    if response.code not in (301, 308) or response.headers.get("Location") != self.config.site_url + "/":
                        raise DeploymentError("WWW redirect health check failed")
                else:
                    raise DeploymentError("WWW must redirect")
                return True
            except (DeploymentError, urllib.error.URLError, OSError):
                if time.monotonic() >= deadline:
                    return False
                time.sleep(3)

    def deploy(self, sha):
        validate_sha(sha)
        self.backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.backup_dir.chmod(0o700)
        with (self.backup_dir / ".deploy.lock").open("a") as lock:
            os.chmod(lock.name, 0o600)
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise TemporaryDeploymentError("A deployment is already running") from error
            self.admit_request()
            state = self.preflight(sha)
            if state is None:
                return False
            directory = self.backup(sha, state)
            # A second backup must retain this immutable pre-checkout snapshot too.
            state["previous_compose"] = directory / "compose.previous.yml"
            rollback_image = "enstorstarkreview-rollback:" + directory.name.lower()
            self.runner(["docker", "image", "tag", state["previous_image"], rollback_image])
            # A newer merge may arrive during backup/build. Never deploy an older queued run.
            self.git("fetch", "origin", "main")
            if self.git("rev-parse", "origin/main") != sha:
                print("Skipping superseded commit after backup", flush=True)
                return False
            if not state["same_revision"]:
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
            maintenance = None
            if state["mongo_plan"]["changed"]:
                maintenance = self.maintain_mongo(sha, state)
                if maintenance is None:
                    return False
            try:
                if state["same_revision"]:
                    self.runner(["docker", "start", state["app"]])
                else:
                    self.runner(self.compose("up", "-d", "--no-deps", "--no-build", "--pull", "never", "--force-recreate", "app"))
                if not self.health(expected_sha=sha):
                    raise DeploymentError("New app health checks failed")
                self.record_mongo_baseline(sha, state["mongo_plan"]["runtime"]["image"])
            except RECOVERY_ERRORS as error:
                override = directory / "rollback.json"
                print("Deployment failed; restoring previous app image", flush=True)
                try:
                    private_json(override, {"services": {"app": {"image": rollback_image}}})
                    self.runner(self.compose(
                        "up", "-d", "--no-deps", "--no-build", "--pull", "never", "--force-recreate", "app",
                        files=[directory / "compose.previous.yml", override]
                    ))
                    if not self.health(expected_image=state["previous_image"]):
                        raise DeploymentError("Previous app health checks failed")
                except RECOVERY_ERRORS as rollback_error:
                    with contextlib.suppress(*RECOVERY_ERRORS):
                        self.runner(["docker", "stop", self.config.app_container])
                    raise DeploymentError("Deployment and rollback failed; operator recovery required") from rollback_error
                raise DeploymentError("Deployment failed; previous app restored") from error
            private_json(directory / "DEPLOYED.json", {
                "commit": sha, "image": self.inspect(self.config.app_container, "{{.Image}}"),
                "mongo_settings_applied": maintenance is not None,
                "maintenance_backup": str(maintenance) if maintenance else None
            })
            print(f"Deployed {sha}", flush=True)
            return True


def main():
    os.umask(0o077)
    if os.geteuid() != 0:
        raise DeploymentError("Run the installed helper using its dedicated sudo rule")
    if len(sys.argv) != 2:
        raise DeploymentError("Usage: enstorstarkreview-deploy COMMIT_SHA")
    validate_sha(sys.argv[1])
    Deployment(load_config(CONFIG_PATH)).deploy(sys.argv[1])


def cli():
    try:
        main()
    except RECOVERY_ERRORS as error:
        # Unexpected decoding/filesystem errors can include unsafe values; keep logs generic.
        message = str(error) if isinstance(error, DeploymentError) else "Deployment failed; inspect the VPS locally"
        print(message, file=sys.stderr)
        return 75 if isinstance(error, TemporaryDeploymentError) else 1
    return 0


if __name__ == "__main__":
    sys.exit(cli())
