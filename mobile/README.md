# Mobile apps

Two native clients of the `/api/v1` JSON API: [iOS](ios/README.md) (Swift and SwiftUI) and
[Android](android/README.md) (Kotlin and Jetpack Compose). This page covers what they share: the
checks in CI and the releases.

## Checks in CI

[`.github/workflows/mobile.yml`](../.github/workflows/mobile.yml) runs on ready PRs to `main` and
on `main` when `mobile/`, `openapi/`, or the workflow changes:

- **Android** (Ubuntu): `gradle :app:testDebugUnitTest :app:verifyRoborazziDebug :app:lintDebug`,
  with Java and Gradle from `android/mise.toml`. On failure the reports and screenshot
  comparisons are uploaded as an artifact.
- **iOS** (`macos-26`, with the Xcode in [`ios/.xcode-version`](ios/.xcode-version)): the model
  tests on an available iPhone simulator. Bump the file in a PR when the runner image gets a newer
  Xcode; that PR's checks build with it first.

The jobs read no secrets and are not required checks; the web's `CI passed` stays the only
required one. `scripts/ci/mobile-workflow.test.js` (in `make check`) keeps the triggers, the draft
guard, the read-only token, and the pinned actions in place.

## Releases

Both apps go to internal testing for the "The Boys" testers: TestFlight on iOS, the internal
testing track on Play. Release from `mobile/` or a folder below it:

```sh
mise run release:ios        # test, archive, upload to App Store Connect, tag
mise run release:android    # test, bundle, upload to Play, tag
mise run release            # iOS, then Android
mise run release --dry-run  # build and check everything; upload and tag nothing
```

The tasks run [`scripts/release.py`](scripts/release.py). Each release:

1. **Checks the commit.** It refuses uncommitted changes, a commit that is not on `origin/main`
   (it fetches `main` first), and a build number at or below an earlier release of the platform.
   A dry run only warns, so a branch can be tried before it lands.
2. **Runs the app's tests:** the iOS model tests on the project simulator, or the Android unit
   tests, screenshot tests, and lint.
3. **Builds with the build number,** which is the commit count (`git rev-list --count HEAD`): the
   same on both platforms, rising with every commit on `main`, and pointing back to one commit.
   iOS gets it as `CURRENT_PROJECT_VERSION`, Android as `-PversionCode`. Local builds use 1.
4. **Uploads.** iOS: `xcodebuild -exportArchive` with [`ios/ExportOptions.plist`](ios/ExportOptions.plist)
   (destination `upload`). Android: one edit through the Android Publisher API with the bundle,
   the R8 mapping file (readable crash stack traces), and a release on the internal track. A
   failed step discards the edit, so nothing half-done reaches Play.
5. **Tags the commit** `ios/<version>+<build>` or `android/<version>+<build>` and pushes the tag.

The marketing version stays a deliberate edit: `MARKETING_VERSION` in
`ios/Darwin/EnStorStark.xcconfig`, `versionName` in `android/app/build.gradle.kts`. Land the change
on `main`, then release.

### One-time setup

- **iOS:** Xcode signed in to the personal team (`FF8JDK3FMJ`). Automatic signing creates the
  certificates and profiles. Turn on automatic distribution for "The Boys" in TestFlight so each
  processed build reaches them.
- **Android:**
  - The Play upload key in the gitignored `android/keystore.properties`, and `MAPS_API_KEY` in
    `android/local.properties` or the environment; see the [Android README](android/README.md#release).
    The task refuses to build without either: the build would be signed with the debug key or
    have an empty map.
  - Uploads use the service account `play-publisher@enstorstarkreview.iam.gserviceaccount.com`
    (Google Cloud project `enstorstarkreview`). It has no key file: the task impersonates it with
    your gcloud login, from the gcloud configuration in `PLAY_GCLOUD_CONFIGURATION` (`mise.toml`
    sets `enstorstark`). That account needs "Service Account Token Creator" on the service account.
    In Play Console the service account is a user with access to this app only, allowed to release
    to testing tracks.
  - Production releases and the store listing stay in Play Console.
