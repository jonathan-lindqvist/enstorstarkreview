#!/usr/bin/env python3
"""Build, sign, and upload the iOS or Android app to internal testing, then tag the commit.

Run through mise from mobile/: `mise run release:ios`, `mise run release:android`, or
`mise run release` for both; add `--dry-run` to build and check everything without uploading or
tagging. See mobile/README.md#releases.

The build number is the commit count, the same on both platforms; it only grows on main. A release
tag (`ios/<version>+<build>`, `android/<version>+<build>`) marks each uploaded commit, and a build
number at or below an existing tag is refused because the stores reject it.
"""

import argparse
import json
import os
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

PACKAGE_NAME = "se.enstorstarkreview.app"
PLAY_SERVICE_ACCOUNT = "play-publisher@enstorstarkreview.iam.gserviceaccount.com"
PLAY_SCOPE = "https://www.googleapis.com/auth/androidpublisher"
PLAY_API = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PACKAGE_NAME}"
PLAY_UPLOAD_API = (
    "https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/"
    f"{PACKAGE_NAME}"
)
# The internal testing track; its tester list ("The Boys") lives in Play Console.
PLAY_TRACK = "internal"
# The project simulator from mobile/ios/README.md#tests; CI sets its own.
DEFAULT_IOS_TEST_DESTINATION = "platform=iOS Simulator,name=En Stor Stark (iPhone 18 Pro)"

VERSION_SOURCES = {
    "ios": ("ios/Darwin/EnStorStark.xcconfig", re.compile(r"^MARKETING_VERSION\s*=\s*(\S+)\s*$", re.M)),
    "android": ("android/app/build.gradle.kts", re.compile(r'^\s*versionName\s*=\s*"([^"]+)"', re.M)),
}


class ReleaseError(Exception):
    pass


def git(repository, *args):
    result = subprocess.run(["git", *args], cwd=repository, capture_output=True, text=True)
    if result.returncode != 0:
        raise ReleaseError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def run_command(command, cwd):
    print(f"$ {' '.join(command)}", flush=True)
    if subprocess.run(command, cwd=cwd).returncode != 0:
        raise ReleaseError(f"{command[0]} failed")


def marketing_version(platform, mobile_dir):
    name, pattern = VERSION_SOURCES[platform]
    match = pattern.search((Path(mobile_dir) / name).read_text())
    if not match:
        setting = "MARKETING_VERSION" if platform == "ios" else "versionName"
        raise ReleaseError(f"No {setting} in mobile/{name}")
    return match.group(1)


def build_number(repository):
    return int(git(repository, "rev-list", "--count", "HEAD"))


def release_tag(platform, version, build):
    return f"{platform}/{version}+{build}"


def released_tags(repository, platform):
    """Release tags of the platform, local and on origin, with their build numbers."""
    names = set(git(repository, "tag", "--list", f"{platform}/*").splitlines())
    for line in git(repository, "ls-remote", "--tags", "origin", f"refs/tags/{platform}/*").splitlines():
        names.add(line.split("refs/tags/", 1)[1])
    pattern = re.compile(rf"^{platform}/[^+]+\+(\d+)$")
    return [(int(match.group(1)), name) for name in names if (match := pattern.match(name))]


def check_releasable(repository, platform, build):
    if git(repository, "status", "--porcelain", "--untracked-files=normal"):
        raise ReleaseError("The checkout has uncommitted changes; release a committed state")
    git(repository, "fetch", "--quiet", "origin", "main")
    ancestor = subprocess.run(
        ["git", "merge-base", "--is-ancestor", "HEAD", "origin/main"],
        cwd=repository, capture_output=True,
    )
    if ancestor.returncode != 0:
        raise ReleaseError("The commit is not on origin/main; release only what has landed")
    blocking = [name for released, name in released_tags(repository, platform) if released >= build]
    if blocking:
        raise ReleaseError(
            f"Build {build} is not above the released {', '.join(sorted(blocking))}; "
            "the store rejects a build number it has seen"
        )


def maps_api_key(android_dir):
    if os.environ.get("MAPS_API_KEY"):
        return True
    local = android_dir / "local.properties"
    if not local.is_file():
        return False
    return any(
        line.strip().startswith("MAPS_API_KEY=") and line.strip().split("=", 1)[1]
        for line in local.read_text().splitlines()
    )


def release_ios(ios_dir, build, *, dry_run, run):
    output = ios_dir / ".build/release"
    shutil.rmtree(output, ignore_errors=True)
    output.mkdir(parents=True)
    archive = output / "EnStorStark.xcarchive"
    common = ["-quiet", "-workspace", "Project.xcworkspace", "-skipPackagePluginValidation"]
    run([
        "xcodebuild", "test", *common, "-scheme", "EnStorStarkModelTests",
        "-destination", os.environ.get("IOS_TEST_DESTINATION", DEFAULT_IOS_TEST_DESTINATION),
        "-derivedDataPath", ".build/xcode",
    ], ios_dir)
    # Its own derived data, so a release does not invalidate the everyday simulator builds.
    run([
        "xcodebuild", "archive", *common, "-scheme", "EnStorStark App", "-configuration", "Release",
        "-destination", "generic/platform=iOS", "-archivePath", str(archive),
        "-derivedDataPath", str(output / "xcode"), "-allowProvisioningUpdates",
        f"CURRENT_PROJECT_VERSION={build}",
    ], ios_dir)
    options = plistlib.loads((ios_dir / "ExportOptions.plist").read_bytes())
    if dry_run:
        options["destination"] = "export"
    options_path = output / "ExportOptions.plist"
    options_path.write_bytes(plistlib.dumps(options))
    run([
        "xcodebuild", "-exportArchive", "-archivePath", str(archive),
        "-quiet", "-exportOptionsPlist", str(options_path), "-exportPath", str(output / "export"),
        "-allowProvisioningUpdates",
    ], ios_dir)


def release_android(android_dir, version, build, *, dry_run, run, play_publisher):
    gradle = ["mise", "exec", "--", "gradle"]
    run([*gradle, ":app:testDebugUnitTest", ":app:verifyRoborazziDebug", ":app:lintDebug"], android_dir)
    run([*gradle, ":app:bundleRelease", f"-PversionCode={build}"], android_dir)
    outputs = android_dir / "app/build/outputs"
    play_publisher().publish(
        outputs / "bundle/release/app-release.aab",
        outputs / "mapping/release/mapping.txt",
        version_code=build,
        release_name=f"{version} ({build})",
        dry_run=dry_run,
    )


def release(platform, mobile_dir, *, dry_run, run=run_command, play_publisher=None):
    mobile_dir = Path(mobile_dir).resolve()
    repository = mobile_dir.parent
    version = marketing_version(platform, mobile_dir)
    build = build_number(repository)
    tag = release_tag(platform, version, build)
    try:
        check_releasable(repository, platform, build)
    except ReleaseError as error:
        if not dry_run:
            raise
        # A dry run checks the build of any state, for example a branch before it lands.
        print(f"Warning, a release would stop here: {error}", file=sys.stderr)
    if platform == "android":
        android_dir = mobile_dir / "android"
        # Without these the build still succeeds: signed with the debug key, or with an empty map.
        if not (android_dir / "keystore.properties").is_file():
            raise ReleaseError("mobile/android/keystore.properties (the Play upload key) is missing")
        if not maps_api_key(android_dir):
            raise ReleaseError("MAPS_API_KEY is not in the environment or mobile/android/local.properties")
        release_android(
            android_dir, version, build, dry_run=dry_run, run=run,
            play_publisher=play_publisher or PlayPublisher.with_gcloud,
        )
    else:
        release_ios(mobile_dir / "ios", build, dry_run=dry_run, run=run)
    if dry_run:
        print(f"Dry run: built {tag}; nothing uploaded or tagged.")
        return
    git(repository, "tag", tag, "HEAD")
    try:
        git(repository, "push", "--quiet", "origin", f"refs/tags/{tag}")
    except ReleaseError as error:
        raise ReleaseError(f"Uploaded, but pushing the tag failed; push {tag} by hand. {error}")
    print(f"Released {tag} to internal testing.")


class PlayPublisher:
    """Uploads a bundle through the Android Publisher API in one edit."""

    def __init__(self, request):
        self.request = request

    @classmethod
    def with_gcloud(cls):
        token = gcloud_access_token()
        return cls(lambda *args, **kwargs: play_request(token, *args, **kwargs))

    def publish(self, bundle, mapping, version_code, release_name, dry_run):
        edit = self.request("POST", f"{PLAY_API}/edits")["id"]
        print(f"Play: uploading {Path(bundle).name} as {release_name}", flush=True)
        try:
            uploaded = self.request(
                "POST", f"{PLAY_UPLOAD_API}/edits/{edit}/bundles?uploadType=media",
                body=Path(bundle).read_bytes(), content_type="application/octet-stream",
            )
            if uploaded.get("versionCode") != version_code:
                raise ReleaseError(
                    f"Play read version code {uploaded.get('versionCode')}, expected {version_code}"
                )
            self.request(
                "POST",
                f"{PLAY_UPLOAD_API}/edits/{edit}/apks/{version_code}/deobfuscationFiles/proguard"
                "?uploadType=media",
                body=Path(mapping).read_bytes(), content_type="application/octet-stream",
            )
            track = {
                "track": PLAY_TRACK,
                "releases": [
                    {"name": release_name, "versionCodes": [str(version_code)], "status": "completed"}
                ],
            }
            self.request(
                "PUT", f"{PLAY_API}/edits/{edit}/tracks/{PLAY_TRACK}",
                body=json.dumps(track).encode(), content_type="application/json",
            )
            if dry_run:
                self.request("POST", f"{PLAY_API}/edits/{edit}:validate")
                self.discard(edit)
                print("Play: the release is valid; discarded it (dry run)")
            else:
                self.request("POST", f"{PLAY_API}/edits/{edit}:commit")
                print(f"Play: released to the {PLAY_TRACK} track")
        except BaseException:
            self.discard(edit)
            raise

    def discard(self, edit):
        try:
            self.request("DELETE", f"{PLAY_API}/edits/{edit}")
        except ReleaseError as error:
            print(f"Could not discard Play edit {edit}: {error}", file=sys.stderr)


def gcloud_access_token():
    """A short-lived token for the Play service account, impersonated with the user's gcloud login."""
    command = [
        "gcloud", "auth", "print-access-token",
        f"--impersonate-service-account={PLAY_SERVICE_ACCOUNT}", f"--scopes={PLAY_SCOPE}",
    ]
    if os.environ.get("PLAY_GCLOUD_CONFIGURATION"):
        command.append(f"--configuration={os.environ['PLAY_GCLOUD_CONFIGURATION']}")
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0 or not result.stdout.strip():
        raise ReleaseError(f"gcloud could not get a Play token: {result.stderr.strip()[-500:]}")
    return result.stdout.strip()


def play_request(token, method, url, body=None, content_type=None):
    headers = {"Authorization": f"Bearer {token}"}
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(url, data=body if body is not None else b"", method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=600) as response:
            text = response.read().decode()
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")[:1000]
        raise ReleaseError(f"Play API {method} {url.split('?')[0]} failed: {error.code} {detail}")
    except urllib.error.URLError as error:
        raise ReleaseError(f"Play API {method} {url.split('?')[0]} failed: {error.reason}")
    return json.loads(text) if text.strip() else {}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("platform", choices=sorted(VERSION_SOURCES))
    parser.add_argument("--dry-run", action="store_true", help="build and check, upload and tag nothing")
    args = parser.parse_args(argv)
    try:
        release(args.platform, Path(__file__).resolve().parent.parent, dry_run=args.dry_run)
    except ReleaseError as error:
        print(f"Release failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
