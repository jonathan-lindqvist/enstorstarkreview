#!/usr/bin/env python3
"""Build, sign, and upload the iOS or Android app to internal testing, then tag the commit.

Run through mise from mobile/: `mise run release:ios`, `mise run release:android`, or
`mise run release` for both; add `--dry-run` to build and check everything without uploading or
tagging. The release workflow (.github/workflows/mobile-release.yml) runs it too, after
`release.py changed ios android` decided which apps changed since their last release. See
mobile/README.md#releases.

The version is the release date in Stockholm (`2026.10.25`). The build number is the commit count,
or one above the highest release of either platform when a feature-branch release went past it,
so it always rises; `--build-number` overrides it. A release tag (`ios/<version>+<build>`,
`android/<version>+<build>`) marks each uploaded commit.
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
from datetime import date, datetime
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

PLATFORM_NAMES = {"ios": "iOS", "android": "Android"}
# What a platform's build is made from: a change here since its last release makes a new one.
PLATFORM_SOURCES = {"ios": ["mobile/ios", "openapi"], "android": ["mobile/android", "openapi"]}
APP_STORE_CONNECT_KEY = ("ASC_KEY_PATH", "ASC_KEY_ID", "ASC_ISSUER_ID")


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


def calendar_version(day):
    # Each part is compared as a number by the stores, so no zero padding.
    return f"{day.year}.{day.month}.{day.day}"


def stockholm_today():
    from zoneinfo import ZoneInfo

    return datetime.now(ZoneInfo("Europe/Stockholm")).date()


def build_number(repository):
    return int(git(repository, "rev-list", "--count", "HEAD"))


def release_tag(platform, version, build):
    return f"{platform}/{version}+{build}"


def released_tags(repository, platforms=tuple(PLATFORM_NAMES)):
    """Release tags of the platforms, local and on origin, with their build numbers."""
    names = set()
    for platform in platforms:
        names.update(git(repository, "tag", "--list", f"{platform}/*").splitlines())
        remote = git(repository, "ls-remote", "--tags", "origin", f"refs/tags/{platform}/*")
        names.update(line.split("refs/tags/", 1)[1] for line in remote.splitlines())
    pattern = re.compile(rf"^(?:{'|'.join(platforms)})/[^+]+\+(\d+)$")
    return [(int(match.group(1)), name) for name in names if (match := pattern.match(name))]


def resolve_build_number(repository, override=None):
    """Above every earlier release of both platforms, since the stores reject a number they saw."""
    released = released_tags(repository)
    highest, highest_tag = max(released, default=(0, None))
    if override is not None:
        if not re.fullmatch(r"[1-9]\d*", str(override)):
            raise ReleaseError(f"The build number must be a positive whole number, not {override!r}")
        if int(override) <= highest:
            raise ReleaseError(
                f"Build {override} is not above the released {highest_tag}; "
                "the store rejects a build number it has seen"
            )
        return int(override)
    count = build_number(repository)
    if count <= highest:
        print(f"The commit count {count} is not above {highest_tag}; using build {highest + 1}.")
        return highest + 1
    return count


def changed_platforms(repository, platforms):
    """Whether each app's folder or the API contract changed since that platform's newest release."""
    git(repository, "fetch", "--quiet", "--tags", "origin")
    return {platform: changed_since_last_release(repository, platform) for platform in platforms}


def changed_since_last_release(repository, platform):
    released = released_tags(repository, (platform,))
    if not released:
        return True
    _, latest = max(released)
    unchanged = subprocess.run(
        ["git", "diff", "--quiet", f"refs/tags/{latest}", "HEAD", "--", *PLATFORM_SOURCES[platform]],
        cwd=repository,
    )
    if unchanged.returncode not in (0, 1):
        raise ReleaseError(f"Could not compare with {latest}")
    if unchanged.returncode == 0:
        print(f"No {PLATFORM_NAMES[platform]} changes since {latest}.")
        return False
    print(f"{PLATFORM_NAMES[platform]} changed since {latest}.")
    return True


def app_store_connect_arguments():
    """The App Store Connect API key for cloud signing in CI; locally Xcode's account signs."""
    values = [os.environ.get(name) for name in APP_STORE_CONNECT_KEY]
    if not any(values):
        return []
    missing = [name for name, value in zip(APP_STORE_CONNECT_KEY, values) if not value]
    if missing:
        raise ReleaseError(f"Incomplete App Store Connect key: {', '.join(missing)} is not set")
    path, key_id, issuer_id = values
    return [
        "-authenticationKeyPath", path, "-authenticationKeyID", key_id,
        "-authenticationKeyIssuerID", issuer_id,
    ]


def check_releasable(repository):
    """A release is a committed, pushed state, so its tag points at a commit others can see."""
    if git(repository, "status", "--porcelain", "--untracked-files=normal"):
        raise ReleaseError("The checkout has uncommitted changes; release a committed state")
    git(repository, "fetch", "--quiet", "origin")
    if not git(repository, "branch", "--remotes", "--contains", "HEAD"):
        raise ReleaseError("The commit is not on origin; push it before releasing")


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


def release_ios(ios_dir, version, build, *, dry_run, run):
    authentication = app_store_connect_arguments()
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
    # Its own derived data, so a release does not invalidate the everyday simulator builds. The
    # archive is ad-hoc signed and the export signs it for distribution, so a fresh CI machine
    # needs no certificate: cloud signing with the App Store Connect key creates none.
    run([
        "xcodebuild", "archive", *common, "-scheme", "EnStorStark App", "-configuration", "Release",
        "-destination", "generic/platform=iOS", "-archivePath", str(archive),
        "-derivedDataPath", str(output / "xcode"), "-allowProvisioningUpdates", *authentication,
        "CODE_SIGN_IDENTITY=-", "AD_HOC_CODE_SIGNING_ALLOWED=YES",
        f"MARKETING_VERSION={version}", f"CURRENT_PROJECT_VERSION={build}",
    ], ios_dir)
    options = plistlib.loads((ios_dir / "ExportOptions.plist").read_bytes())
    if dry_run:
        options["destination"] = "export"
    options_path = output / "ExportOptions.plist"
    options_path.write_bytes(plistlib.dumps(options))
    run([
        "xcodebuild", "-exportArchive", "-archivePath", str(archive),
        "-quiet", "-exportOptionsPlist", str(options_path), "-exportPath", str(output / "export"),
        "-allowProvisioningUpdates", *authentication,
    ], ios_dir)


def release_android(android_dir, version, build, *, dry_run, run, play_publisher):
    gradle = ["mise", "exec", "--", "gradle"]
    run([*gradle, ":app:testDebugUnitTest", ":app:verifyRoborazziDebug", ":app:lintDebug"], android_dir)
    run([*gradle, ":app:bundleRelease", f"-PversionCode={build}", f"-PversionName={version}"], android_dir)
    outputs = android_dir / "app/build/outputs"
    play_publisher().publish(
        outputs / "bundle/release/app-release.aab",
        outputs / "mapping/release/mapping.txt",
        version_code=build,
        release_name=f"{version} ({build})",
        dry_run=dry_run,
    )


def release(
    platform, mobile_dir, *, dry_run, run=run_command, play_publisher=None, today=None,
    push_tag=True, build_number=None,
):
    mobile_dir = Path(mobile_dir).resolve()
    repository = mobile_dir.parent
    version = calendar_version(today or stockholm_today())
    try:
        check_releasable(repository)
    except ReleaseError as error:
        if not dry_run:
            raise
        # A dry run checks the build of any state, for example uncommitted work.
        print(f"Warning, a release would stop here: {error}", file=sys.stderr)
    build = resolve_build_number(repository, build_number)
    tag = release_tag(platform, version, build)
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
        app_store_connect_arguments()
        release_ios(mobile_dir / "ios", version, build, dry_run=dry_run, run=run)
    if dry_run:
        print(f"Dry run: built {tag}; nothing uploaded or tagged.")
        return
    git(repository, "tag", tag, "HEAD")
    if not push_tag:
        print(f"Released {tag} to internal testing; the tag is local.")
        return
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
        token = play_access_token()
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


def play_access_token():
    """The release workflow passes a token from Workload Identity Federation; locally gcloud."""
    return os.environ.get("PLAY_ACCESS_TOKEN") or gcloud_access_token()


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


def repository_root():
    return Path(__file__).resolve().parent.parent.parent


def main_changed(argv):
    parser = argparse.ArgumentParser(
        prog="release.py changed",
        description="Print which apps changed since their last release, as GitHub job outputs.",
    )
    parser.add_argument("platforms", nargs="+", choices=sorted(PLATFORM_NAMES))
    args = parser.parse_args(argv)
    try:
        changed = changed_platforms(repository_root(), args.platforms)
    except ReleaseError as error:
        print(f"Change check failed: {error}", file=sys.stderr)
        return 1
    lines = "".join(f"{platform}={str(value).lower()}\n" for platform, value in changed.items())
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as outputs:
            outputs.write(lines)
    print(lines, end="")
    return 0


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] == ["changed"]:
        return main_changed(argv[1:])
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("platform", choices=sorted(PLATFORM_NAMES))
    parser.add_argument("--dry-run", action="store_true", help="build and check, upload and tag nothing")
    parser.add_argument(
        "--no-push-tag", dest="push_tag", action="store_false",
        help="leave the release tag local (the workflow pushes it with its own token)",
    )
    parser.add_argument(
        "--build-number", help="use this build number; it must be above every earlier release",
    )
    args = parser.parse_args(argv)
    try:
        release(
            args.platform, repository_root() / "mobile", dry_run=args.dry_run,
            push_tag=args.push_tag, build_number=args.build_number,
        )
    except ReleaseError as error:
        print(f"Release failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
