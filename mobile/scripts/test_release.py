import contextlib
import io
import json
import os
import plistlib
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from datetime import date

import release
from release import PlayPublisher, ReleaseError


def setUpModule():
    # The tests make their own repositories; GIT_* from the caller (the CI container sets
    # GIT_COMMON_DIR) would point every git command at the caller's repository instead.
    environment = mock.patch.dict(os.environ, clear=True, values={
        key: value for key, value in os.environ.items() if not key.startswith("GIT_")
    })
    environment.start()
    unittest.addModuleCleanup(environment.stop)


def git(cwd, *args):
    return subprocess.run(
        ["git", *args], cwd=cwd, check=True, capture_output=True, text=True
    ).stdout.strip()


class Repository:
    """A checkout with an `origin` remote and the version files of both apps."""

    def __init__(self, root: Path):
        self.origin = root / "origin.git"
        self.path = root / "checkout"
        subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(self.origin)], check=True)
        subprocess.run(["git", "init", "-q", "-b", "main", str(self.path)], check=True)
        git(self.path, "config", "user.email", "release@example.com")
        git(self.path, "config", "user.name", "Release Test")
        git(self.path, "config", "commit.gpgsign", "false")
        git(self.path, "config", "tag.gpgsign", "false")
        git(self.path, "remote", "add", "origin", str(self.origin))
        self.write("mobile/ios/Darwin/EnStorStark.xcconfig", "MARKETING_VERSION = 1.2.3\n")
        self.write(
            "mobile/android/app/build.gradle.kts",
            'android {\n    defaultConfig {\n        versionName = "4.5.6"\n    }\n}\n',
        )
        self.commit("first")

    @property
    def mobile(self):
        return self.path / "mobile"

    def write(self, name, text):
        path = self.path / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def commit(self, message, push=True):
        git(self.path, "add", "-A")
        git(self.path, "commit", "-q", "--allow-empty", "-m", message)
        if push:
            git(self.path, "push", "-q", "origin", "HEAD:main")

    def tag(self, name, push=True):
        git(self.path, "tag", name)
        if push:
            git(self.path, "push", "-q", "origin", f"refs/tags/{name}")


class TempRepositoryTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.repo = Repository(Path(temp.name))


class VersionTests(TempRepositoryTest):
    def test_version_is_the_release_date_without_zero_padding(self):
        self.assertEqual(release.calendar_version(date(2026, 1, 5)), "2026.1.5")
        self.assertEqual(release.calendar_version(date(2026, 10, 25)), "2026.10.25")

    def test_build_number_is_the_commit_count_and_names_the_tag(self):
        self.repo.commit("second")
        self.repo.commit("third")
        self.assertEqual(release.build_number(self.repo.path), 3)
        self.assertEqual(release.release_tag("ios", "1.2.3", 3), "ios/1.2.3+3")


class ReleasableTests(TempRepositoryTest):
    def check(self):
        release.check_releasable(self.repo.path)

    def test_clean_pushed_commit_is_releasable(self):
        self.check()

    def test_changed_tracked_file_is_refused(self):
        self.repo.write("mobile/ios/Darwin/EnStorStark.xcconfig", "MARKETING_VERSION = 9.9.9\n")
        with self.assertRaisesRegex(ReleaseError, "uncommitted"):
            self.check()

    def test_untracked_file_is_refused(self):
        self.repo.write("notes.txt", "not committed")
        with self.assertRaisesRegex(ReleaseError, "uncommitted"):
            self.check()

    def test_ignored_files_do_not_block(self):
        self.repo.write(".gitignore", "build/\n")
        self.repo.commit("ignore build output")
        self.repo.write("build/app.aab", "binary")
        self.check()

    def test_commit_on_a_pushed_feature_branch_is_releasable(self):
        git(self.repo.path, "checkout", "-q", "-b", "feature")
        self.repo.commit("feature work", push=False)
        git(self.repo.path, "push", "-q", "origin", "feature")
        self.check()

    def test_commit_that_is_not_pushed_is_refused(self):
        self.repo.commit("local only", push=False)
        with self.assertRaisesRegex(ReleaseError, "not on origin"):
            self.check()

    def test_origin_is_fetched_before_the_check(self):
        other = Path(self.repo.path.parent / "other")
        subprocess.run(["git", "clone", "-q", str(self.repo.origin), str(other)], check=True)
        self.repo.commit("pushed from here")
        # The second checkout has the commit, but its origin/main is stale until the check fetches.
        git(other, "fetch", "-q", str(self.repo.path), "HEAD")
        git(other, "checkout", "-q", "--detach", "FETCH_HEAD")
        release.check_releasable(other)


class BuildNumberTests(TempRepositoryTest):
    def resolve(self, override=None):
        return release.resolve_build_number(self.repo.path, override)

    def test_build_number_is_the_commit_count_above_every_release(self):
        self.repo.commit("second")
        self.repo.tag("ios/2026.1.1+1")
        self.assertEqual(self.resolve(), 2)

    def test_a_higher_release_of_either_platform_moves_the_number_past_it(self):
        # A feature-branch release has more commits than main, which squash merges collapse.
        self.repo.tag("android/2026.1.1+40")
        self.assertEqual(self.resolve(), 41)

    def test_release_tags_only_on_origin_count(self):
        git(self.repo.path, "tag", "ios/2026.1.1+40")
        git(self.repo.path, "push", "-q", "origin", "refs/tags/ios/2026.1.1+40")
        git(self.repo.path, "tag", "-d", "ios/2026.1.1+40")
        self.assertEqual(self.resolve(), 41)

    def test_override_above_every_release_is_used(self):
        self.repo.tag("ios/2026.1.1+40")
        self.assertEqual(self.resolve(500), 500)

    def test_override_at_or_below_a_release_is_refused(self):
        self.repo.tag("ios/2026.1.1+40")
        for override in (40, 12):
            with self.assertRaisesRegex(ReleaseError, r"ios/2026\.1\.1\+40"):
                self.resolve(override)

    def test_override_must_be_a_positive_whole_number(self):
        for override in ("abc", "0", "-3", "1.5"):
            with self.assertRaisesRegex(ReleaseError, "positive whole number"):
                self.resolve(override)


class FakePlayApi:
    """Records requests to the Android Publisher API and answers like it."""

    def __init__(self, uploaded_version_code=310, fail_on=None):
        self.requests = []
        self.uploaded_version_code = uploaded_version_code
        self.fail_on = fail_on

    def __call__(self, method, url, body=None, content_type=None):
        path = url.split("/androidpublisher/v3/applications/se.enstorstarkreview.app", 1)[1]
        self.requests.append((method, path, body, content_type))
        if self.fail_on and self.fail_on in path:
            raise ReleaseError("Play API request failed: 500")
        if method == "POST" and path == "/edits":
            return {"id": "edit-1"}
        if path.startswith("/edits/edit-1/bundles"):
            return {"versionCode": self.uploaded_version_code}
        return {}

    def paths(self):
        return [f"{method} {path.split('?')[0]}" for method, path, _, _ in self.requests]


class PlayPublisherTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.bundle = Path(temp.name) / "app-release.aab"
        self.bundle.write_bytes(b"bundle")
        self.mapping = Path(temp.name) / "mapping.txt"
        self.mapping.write_text("mapping")

    def publish(self, api, dry_run=False):
        PlayPublisher(api).publish(
            self.bundle, self.mapping, version_code=310, release_name="4.5.6 (310)", dry_run=dry_run
        )

    def test_uploads_bundle_and_mapping_then_releases_to_internal_testing(self):
        api = FakePlayApi()
        self.publish(api)
        self.assertEqual(api.paths(), [
            "POST /edits",
            "POST /edits/edit-1/bundles",
            "POST /edits/edit-1/apks/310/deobfuscationFiles/proguard",
            "PUT /edits/edit-1/tracks/internal",
            "POST /edits/edit-1:commit",
        ])
        _, bundle_path, bundle_body, bundle_type = api.requests[1]
        self.assertIn("uploadType=media", bundle_path)
        self.assertEqual((bundle_body, bundle_type), (b"bundle", "application/octet-stream"))
        track = json.loads(api.requests[3][2])
        self.assertEqual(track, {
            "track": "internal",
            "releases": [{"name": "4.5.6 (310)", "versionCodes": ["310"], "status": "completed"}],
        })

    def test_dry_run_validates_and_discards_the_edit(self):
        api = FakePlayApi()
        self.publish(api, dry_run=True)
        self.assertEqual(api.paths()[-2:], ["POST /edits/edit-1:validate", "DELETE /edits/edit-1"])
        self.assertNotIn("POST /edits/edit-1:commit", api.paths())

    def test_unexpected_version_code_discards_the_edit_without_releasing(self):
        api = FakePlayApi(uploaded_version_code=309)
        with self.assertRaisesRegex(ReleaseError, "309"):
            self.publish(api)
        self.assertEqual(api.paths()[-1], "DELETE /edits/edit-1")
        self.assertFalse(any("tracks" in path or ":commit" in path for path in api.paths()))

    def test_failed_request_discards_the_edit_without_releasing(self):
        api = FakePlayApi(fail_on="tracks")
        with self.assertRaisesRegex(ReleaseError, "500"):
            self.publish(api)
        self.assertEqual(api.paths()[-1], "DELETE /edits/edit-1")
        self.assertNotIn("POST /edits/edit-1:commit", api.paths())


class FakeRunner:
    def __init__(self, fail_on=None):
        self.commands = []
        self.fail_on = fail_on

    def __call__(self, command, cwd):
        self.commands.append((list(command), Path(cwd)))
        if self.fail_on and self.fail_on in command:
            raise ReleaseError(f"{' '.join(command)} failed")

    def joined(self):
        return [" ".join(command) for command, _ in self.commands]


class FakePublisher:
    def __init__(self):
        self.published = []

    def publish(self, bundle, mapping, version_code, release_name, dry_run):
        self.published.append((bundle, mapping, version_code, release_name, dry_run))


TODAY = date(2026, 10, 25)
VERSION = "2026.10.25"


class ReleaseCase(TempRepositoryTest):
    def setUp(self):
        super().setUp()
        self.repo.write(".gitignore", "local.properties\nkeystore.properties\n")
        self.repo.write("mobile/ios/ExportOptions.plist", plistlib.dumps({
            "method": "app-store-connect", "destination": "upload",
        }).decode())
        self.repo.commit("release inputs")
        self.repo.write("mobile/android/keystore.properties", "storeFile=upload.jks\n")
        self.repo.write("mobile/android/local.properties", "MAPS_API_KEY=maps-key\n")
        self.build = release.build_number(self.repo.path)
        self.runner = FakeRunner()
        self.publisher = FakePublisher()
        environment = {key: value for key, value in os.environ.items() if key != "MAPS_API_KEY"}
        self.environment = mock.patch.dict(os.environ, environment, clear=True)
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def release(self, platform, dry_run=False, **options):
        return release.release(
            platform, self.repo.mobile, dry_run=dry_run, run=self.runner,
            play_publisher=lambda: self.publisher, today=TODAY, **options,
        )

    def tags(self):
        return git(self.repo.path, "ls-remote", "--tags", "origin")



class ReleaseTests(ReleaseCase):
    def test_ios_tests_archives_with_the_build_number_uploads_and_tags(self):
        self.release("ios")
        commands = self.runner.joined()
        self.assertTrue(commands[0].startswith("xcodebuild test "))
        self.assertIn("-scheme EnStorStarkModelTests", commands[0])
        archive = next(command for command in commands if command.startswith("xcodebuild archive"))
        self.assertIn("-configuration Release", archive)
        self.assertIn(f"CURRENT_PROJECT_VERSION={self.build}", archive)
        self.assertIn(f"MARKETING_VERSION={VERSION}", archive)
        # Ad-hoc signed; the export signs for distribution (cloud signing in CI, no certificate).
        self.assertIn("CODE_SIGN_IDENTITY=-", archive)
        self.assertNotIn("-authenticationKeyPath", archive)
        export = next(command for command in commands if "-exportArchive" in command)
        options = plistlib.loads(Path(export.split("-exportOptionsPlist ")[1].split(" ")[0]).read_bytes())
        self.assertEqual(options["destination"], "upload")
        self.assertIn(f"refs/tags/ios/{VERSION}+{self.build}", self.tags())

    def test_ios_dry_run_exports_locally_and_tags_nothing(self):
        self.release("ios", dry_run=True)
        export = next(command for command in self.runner.joined() if "-exportArchive" in command)
        options = plistlib.loads(Path(export.split("-exportOptionsPlist ")[1].split(" ")[0]).read_bytes())
        self.assertEqual(options["destination"], "export")
        self.assertEqual(self.tags(), "")
        self.assertEqual(git(self.repo.path, "tag"), "")

    def test_android_checks_bundles_with_the_build_number_publishes_and_tags(self):
        self.release("android")
        commands = self.runner.joined()
        self.assertIn(":app:testDebugUnitTest", commands[0])
        self.assertIn(":app:verifyRoborazziDebug", commands[0])
        self.assertIn(
            f":app:bundleRelease -PversionCode={self.build} -PversionName={VERSION}", commands[1]
        )
        self.assertTrue(all(cwd == (self.repo.mobile / "android").resolve() for _, cwd in self.runner.commands))
        bundle, mapping, version_code, name, dry_run = self.publisher.published[0]
        self.assertEqual(bundle.name, "app-release.aab")
        self.assertEqual(mapping.name, "mapping.txt")
        self.assertEqual((version_code, name, dry_run), (self.build, f"{VERSION} ({self.build})", False))
        self.assertIn(f"refs/tags/android/{VERSION}+{self.build}", self.tags())

    def test_android_dry_run_publishes_as_dry_run_and_tags_nothing(self):
        self.release("android", dry_run=True)
        self.assertTrue(self.publisher.published[0][4])
        self.assertEqual(self.tags(), "")

    def test_android_without_upload_key_fails_before_building(self):
        (self.repo.mobile / "android/keystore.properties").unlink()
        with self.assertRaisesRegex(ReleaseError, "keystore.properties"):
            self.release("android")
        self.assertEqual(self.runner.commands, [])

    def test_android_without_maps_key_fails_before_building(self):
        self.repo.write("mobile/android/local.properties", "sdk.dir=/sdk\n")
        with self.assertRaisesRegex(ReleaseError, "MAPS_API_KEY"):
            self.release("android")
        self.assertEqual(self.runner.commands, [])

    def test_maps_key_from_the_environment_is_enough(self):
        self.repo.write("mobile/android/local.properties", "sdk.dir=/sdk\n")
        os.environ["MAPS_API_KEY"] = "maps-key"
        self.release("android", dry_run=True)
        self.assertEqual(len(self.publisher.published), 1)

    def test_failed_build_uploads_and_tags_nothing(self):
        self.runner = FakeRunner(fail_on=":app:bundleRelease")
        with self.assertRaises(ReleaseError):
            self.release("android")
        self.assertEqual(self.publisher.published, [])
        self.assertEqual(self.tags(), "")

    def test_failed_ios_tests_build_nothing(self):
        self.runner = FakeRunner(fail_on="test")
        with self.assertRaises(ReleaseError):
            self.release("ios")
        self.assertEqual(len(self.runner.commands), 1)
        self.assertEqual(self.tags(), "")

    def test_unreleasable_commit_runs_nothing(self):
        self.repo.write("mobile/ios/Darwin/EnStorStark.xcconfig", "MARKETING_VERSION = 9.9.9\n")
        with self.assertRaisesRegex(ReleaseError, "uncommitted"):
            self.release("ios")
        self.assertEqual(self.runner.commands, [])

    def test_dry_run_of_an_unreleasable_commit_warns_and_still_builds(self):
        self.repo.write("mobile/ios/Darwin/EnStorStark.xcconfig", "MARKETING_VERSION = 9.9.9\n")
        with contextlib.redirect_stderr(io.StringIO()) as stderr:
            self.release("ios", dry_run=True)
        self.assertIn("uncommitted", stderr.getvalue())
        self.assertTrue(any("-exportArchive" in command for command in self.runner.joined()))
        self.assertEqual(self.tags(), "")


class CiReleaseTests(ReleaseCase):
    """The options the release workflow uses."""

    def test_app_store_connect_key_authenticates_archive_and_export(self):
        os.environ.update(ASC_KEY_PATH="/tmp/AuthKey.p8", ASC_KEY_ID="KEY123", ASC_ISSUER_ID="issuer")
        self.release("ios")
        for command in self.runner.joined()[1:]:
            self.assertIn("-authenticationKeyPath /tmp/AuthKey.p8", command)
            self.assertIn("-authenticationKeyID KEY123", command)
            self.assertIn("-authenticationKeyIssuerID issuer", command)
        self.assertNotIn("-authenticationKeyPath", self.runner.joined()[0])

    def test_incomplete_app_store_connect_key_fails_before_running(self):
        os.environ.update(ASC_KEY_PATH="/tmp/AuthKey.p8", ASC_KEY_ID="KEY123")
        with self.assertRaisesRegex(ReleaseError, "ASC_ISSUER_ID"):
            self.release("ios")
        self.assertEqual(self.runner.commands, [])

    def test_build_number_override_reaches_build_and_tag(self):
        self.release("android", build_number="900")
        self.assertIn(":app:bundleRelease -PversionCode=900 ", self.runner.joined()[1] + " ")
        self.assertEqual(self.publisher.published[0][2], 900)
        self.assertIn(f"refs/tags/android/{VERSION}+900", self.tags())

    def test_tag_can_stay_local_for_the_workflow_to_push(self):
        self.release("ios", push_tag=False)
        self.assertEqual(git(self.repo.path, "tag", "--points-at", "HEAD"), f"ios/{VERSION}+{self.build}")
        self.assertEqual(self.tags(), "")


class ChangedTests(TempRepositoryTest):
    """`release.py changed`: the workflow's first job, which decides what to build."""

    def changed(self, *platforms):
        with contextlib.redirect_stdout(io.StringIO()):
            return release.changed_platforms(self.repo.path, platforms or ("ios", "android"))

    def released(self, platform, version="2026.10.24"):
        self.repo.tag(f"{platform}/{version}+{release.build_number(self.repo.path)}")

    def test_a_platform_never_released_has_changed(self):
        self.assertEqual(self.changed(), {"ios": True, "android": True})

    def test_only_the_changed_apps_folder_counts(self):
        self.released("ios")
        self.released("android")
        self.repo.write("src/routes/+page.svelte", "web only")
        self.repo.write("mobile/android/app/Main.kt", "android only")
        self.repo.write("mobile/scripts/notes.txt", "release tooling only")
        self.repo.commit("web, android, and tooling change")
        self.assertEqual(self.changed(), {"ios": False, "android": True})

    def test_a_contract_change_counts_for_both(self):
        self.released("ios")
        self.released("android")
        self.repo.write("openapi/v1.yaml", "openapi: 3.1.0")
        self.repo.commit("contract change")
        self.assertEqual(self.changed(), {"ios": True, "android": True})

    def test_compares_with_the_platforms_newest_release(self):
        self.released("ios", "2026.10.20")
        self.repo.write("mobile/ios/App.swift", "first change")
        self.repo.commit("ios change")
        self.released("ios", "2026.10.24")
        self.repo.commit("no app change")
        self.assertEqual(self.changed("ios"), {"ios": False})

    def test_sees_a_release_tag_that_is_only_on_origin(self):
        self.released("ios")
        git(self.repo.path, "tag", "-d", git(self.repo.path, "tag", "--list", "ios/*"))
        self.repo.commit("no app change")
        self.assertEqual(self.changed("ios"), {"ios": False})

    def test_command_writes_the_job_outputs(self):
        self.released("ios")
        outputs = self.repo.path.parent / "outputs"
        with mock.patch.dict(os.environ, {"GITHUB_OUTPUT": str(outputs)}), \
                mock.patch.object(release, "repository_root", return_value=self.repo.path), \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(release.main(["changed", "ios", "android"]), 0)
        self.assertEqual(outputs.read_text(), "ios=false\nandroid=true\n")


class PlayTokenTests(unittest.TestCase):
    def test_token_from_the_environment_skips_gcloud(self):
        with mock.patch.dict(os.environ, {"PLAY_ACCESS_TOKEN": "ci-token"}), \
                mock.patch("subprocess.run") as run:
            self.assertEqual(release.play_access_token(), "ci-token")
        run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
