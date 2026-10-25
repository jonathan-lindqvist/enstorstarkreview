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
testing track on Play. The [release workflow](#the-release-workflow) does this every morning;
locally, release from `mobile/` or a folder below it:

```sh
mise run release:ios        # test, archive, upload to App Store Connect, tag
mise run release:android    # test, bundle, upload to Play, tag
mise run release            # iOS, then Android
mise run release --dry-run  # build and check everything; upload and tag nothing
mise run release:ios --build-number 400  # override the build number
```

The tasks and the workflow run [`scripts/release.py`](scripts/release.py). Each release:

1. **Checks the commit.** It refuses uncommitted changes and a commit that is on no branch of
   `origin` (it fetches first), so every release tag points at a commit others can see. Any
   pushed branch works, `main` or a feature branch. A dry run only warns.
2. **Runs the app's tests:** the iOS model tests on the project simulator, or the Android unit
   tests, screenshot tests, and lint.
3. **Builds with the version and build number,** both set at build time; nothing is edited or
   committed. Local builds use the placeholders `0.0.0` and 1.
   - The **version** is the release date in Stockholm, without zero padding: `2026.10.25`. iOS
     gets it as `MARKETING_VERSION`, Android as `-PversionName`.
   - The **build number** is the commit count (`git rev-list --count HEAD`), which rises with
     every commit on `main` and tells two releases on one day apart. A feature branch has more
     commits than `main`, and a squash merge collapses them, so after a branch release `main`
     can be behind: then the build number is one above the highest release of either platform
     instead. The stores reject a number they have seen. `--build-number` (or the workflow's
     "build number" input) overrides it; it must be above every earlier release. iOS gets it
     as `CURRENT_PROJECT_VERSION`, Android as `-PversionCode`.
4. **Uploads.** iOS: an ad-hoc signed archive, then `xcodebuild -exportArchive` with
   [`ios/ExportOptions.plist`](ios/ExportOptions.plist) (destination `upload`), which signs it for
   distribution. Android: one edit through the Android Publisher API with the bundle, the R8
   mapping file (readable crash stack traces), and a release on the internal track. A failed step
   discards the edit, so nothing half-done reaches Play.
5. **Tags the commit** `ios/<version>+<build>` or `android/<version>+<build>` and pushes the tag.

### The release workflow

[`.github/workflows/mobile-release.yml`](../.github/workflows/mobile-release.yml) runs at 09:00
Stockholm time every day on `main`. Run it by hand from the Actions tab ("Mobile release"), on
`main` or a feature branch, to release the chosen apps, optionally with a set build number.

1. A first job on Ubuntu decides which apps to build. On the daily run, `release.py changed ios
android` checks whether each app's folder or `openapi/` changed since that platform's newest
   release tag; a change elsewhere (the web, `mobile/scripts`) releases nothing, and an unchanged
   day starts no macOS runner at all. A manual run always releases the chosen apps.
2. The iOS job (macOS, with the Xcode in [`ios/.xcode-version`](ios/.xcode-version)) and the
   Android job (Ubuntu) run only for those apps. Each pushes its tag in a last step that alone gets
   the job's write token.

Its secrets are repository secrets and variables (Settings › Secrets and variables › Actions):

| Name                                                                     | Kind     | Value                                                      |
| ------------------------------------------------------------------------ | -------- | ---------------------------------------------------------- |
| `APP_STORE_CONNECT_KEY`                                                  | Secret   | Contents of the App Store Connect API key (`AuthKey_….p8`) |
| `APP_STORE_CONNECT_KEY_ID`                                               | Variable | Its key ID                                                 |
| `APP_STORE_CONNECT_ISSUER_ID`                                            | Variable | The issuer ID shown above the keys                         |
| `ANDROID_UPLOAD_KEYSTORE_BASE64`                                         | Secret   | The Play upload keystore, `base64 -i keystore.jks`         |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | Secrets  | From `android/keystore.properties`                         |
| `MAPS_API_KEY`                                                           | Secret   | The Google Maps key from `android/local.properties`        |

- **iOS signs in the cloud.** The archive is ad-hoc signed and the export signs it with an Apple
  Distribution certificate that Apple keeps, so no certificate or profile is stored in GitHub.
  Cloud signing for distribution needs an API key with the **Admin** role (App Store Connect ›
  Users and Access › Integrations › Team Keys).
- **Android has no Google key file.** `google-github-actions/auth` trades the job's GitHub OIDC
  token for a short-lived token of the Play service account (Workload Identity Federation: pool
  `github`, provider `enstorstarkreview` in the Google Cloud project). Google accepts only tokens
  from this repository (by its numeric ID) and its `mobile-release.yml` workflow, on any branch.
- **Who can use them.** Repository secrets reach any workflow run in this repository, on any
  branch, so every collaborator with write access can release, and could read the secrets with a
  workflow of their own. Pull requests from forks get no secrets. A GitHub environment limited to
  `main` would close that, but it would also block releases from feature branches, and only the
  repository owner can manage environment secrets.

### One-time setup

- **iOS:** Xcode signed in to the personal team (`FF8JDK3FMJ`). Automatic signing creates the
  certificates and profiles. "The Boys" has automatic distribution in TestFlight, so each
  processed build reaches them.
- **Android:**
  - The Play upload key in the gitignored `android/keystore.properties`, and `MAPS_API_KEY` in
    `android/local.properties` or the environment; see the [Android README](android/README.md#release).
    The task refuses to build without either: the build would be signed with the debug key or
    have an empty map.
  - Uploads use the service account `play-publisher@enstorstarkreview.iam.gserviceaccount.com`
    (Google Cloud project `enstorstarkreview`). It has no key file: locally the task impersonates
    it with your gcloud login, from the gcloud configuration in `PLAY_GCLOUD_CONFIGURATION`
    (`mise.toml` sets `enstorstark`). That account needs "Service Account Token Creator" on the
    service account. In Play Console the service account is a user with access to this app only,
    allowed to release to testing tracks.
  - Production releases and the store listing stay in Play Console.
