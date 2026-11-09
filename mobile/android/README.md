# En Stor Stark (Android app)

Native Android client for "En stor stark", in Kotlin and Jetpack Compose.
It uses the JSON API in `/api/v1` of this repository (see `../../docs/api.md` and `../../openapi/v1.yaml`) and follows the iOS app in `../ios`, with a Material 3 layout.
User-facing text is in Swedish.

[Native TDD guide](../../docs/agents/mobile.md) · [API contract](../../openapi/README.md)

## Architecture

- `model/` holds everything that has rules: the API client, sessions, the review list, detail, form, and wizard rules.
  Plain classes keep their state in Compose `mutableStateOf`; there are no ViewModels.
  `AppModel` is created once in `EnStorStarkApp` and reaches screens through `LocalApp`.
- `ui/` lays out model state.
  The four tabs live in `HomeRoute`; the review page, history, login, and the wizard (`WizardRoute`) are pushed routes (Navigation Compose with serializable routes).
- Only the API models are generated from `../../openapi/v1.yaml` on every build (OpenAPI Generator, kotlinx.serialization).
  The HTTP calls are written by hand in `ApiClient` and read responses on the IO dispatcher.
  `app/build.gradle.kts` patches the generator's output for nullable inline objects and fails the build if a patch stops matching.
- The theme, icons, and layout come from the Android design kit on the StorStarkApp board in Studio (`Kit.kt`); stamps, volume, and logos follow the iOS app.

## Commands

Run them from this folder.
Tools come from `mise.toml`.

```sh
mise install
gradle :app:testDebugUnitTest           # model tests on the JVM (MockWebServer, shared fixtures)
gradle :app:installDebug                # build and install (set ANDROID_SERIAL with several devices)
gradle :app:verifyRoborazziDebug        # compare the screenshot tests with src/test/screenshots
gradle :app:recordRoborazziDebug        # re-record them after an intended change
gradle :app:lintDebug
```

Debug builds install as `se.enstorstarkreview.app.dev` next to the Play build and use `http://10.0.2.2:5173`, the local `make dev` server seen from the emulator (plain HTTP is allowed in debug builds only).
The reviewer login is hidden: long-press the "Version" row at the bottom of "Om".

Agents can read and drive the screen with the Android CLI (`$ANDROID_HOME/cmdline-tools/latest/bin/android`): `android layout --flat`, `android input tap 'text:Äldsta'`, `android screen`, `android preview`.

## Google Maps

The map needs `MAPS_API_KEY`, from the environment or the gitignored `local.properties` (`MAPS_API_KEY=…`).
Without it the app builds and the map stays empty.
The key (Google Cloud project `enstorstarkreview`) is restricted to the Maps SDK for Android and to these packages with their signing-certificate SHA-1s: `.dev` with the debug key, and `se.enstorstarkreview.app` with the upload and Play app-signing keys.
A new debug machine needs its debug key's SHA-1 added (`keytool -list -v -keystore ~/.android/debug.keystore -storepass android`).

## Notifications

The app can notify about newly published reviews through Firebase Cloud Messaging (FCM).
There is no `google-services.json` and no google-services plugin: `FirebasePushDevice` starts Firebase from BuildConfig values, and the manifest removes Firebase's automatic start.
Without the values the app builds and runs, and hides the setting and the prompt.

The values come from the environment or the gitignored `local.properties`, like the map key:

```properties
FIREBASE_PROJECT_ID=…
FIREBASE_API_KEY=…
FIREBASE_SENDER_ID=…
# The Firebase app ID of se.enstorstarkreview.app (release builds)
FIREBASE_APP_ID=…
# The Firebase app ID of se.enstorstarkreview.app.dev (debug builds)
FIREBASE_DEBUG_APP_ID=…
```

Add two Android apps to the Firebase project, `se.enstorstarkreview.app` and `se.enstorstarkreview.app.dev`, and copy the values from each app's `google-services.json` (`project_id`, `current_key`, `project_number`, and `mobilesdk_app_id`) without committing the file.
Release builds read the same keys, so set them in the environment of the release task or in its `local.properties`; without them the Play build has no notifications.
The server sends through a service account of the same project (`FCM_SERVICE_ACCOUNT_JSON`, see the [notifications guide](../../docs/agents/notifications.md)).

- `PushRegistrationModel` registers the device (`PUT /api/v1/push-devices`) when notifications are on, the system allows them, and Firebase has a token.
- It registers again only when the token, the signed-in reviewer, or the server changed, or after 7 days, so the server, which forgets devices after 60 days, keeps it; a 429, a 503, or a network error is retried on the next launch.
- Signing out registers the device again without a token, so it is anonymous; a 401 signs out as anywhere else.
- Turning the setting off calls `POST /api/v1/push-devices/removal` and deletes the FCM token.
- The question "Vill du få en notis när en ny recension publiceras?" appears once, on the second launch or after the first review page, unless the switch on Om was already used.
- Messages use the channel `new_reviews` ("Nya recensioner") and carry the review's `slug`; a tap opens the review.
  In the background the system shows them; in the foreground `PushService` posts them.

To test, run the debug build with the values set, turn on "Notiser om nya recensioner" on Om, and publish a review on the local server with FCM configured, or send a test message from the Firebase console (Messaging, "Send test message") to the device's token.
The app never logs the token; read it from the `push_devices` collection in the development database.
A test message needs the custom data key `slug` to open a review.
FCM needs a device or an emulator image with Google Play.

## Review rules

`ApiClient.reviewWrite` sends `"volumeCl": null` and `"brand": null` for an unknown volume or brand, because `ApiJson` leaves out null fields and the contract keeps an omitted volume and rejects an omitted brand.
"Okänt märke" is the default brand tile, as on the web and iOS.
`model/PriceValue.kt` copies the Prisvärdhet gates from the web's `src/lib/utils/price-value.ts`, and `PriceValueTest` ports its test cases, so change all three together.
`StatisticsScreenshotTest` renders the gates chart and the beer step (`gradle :app:recordRoborazziDebug`).

## Release

`mise run release:android` from `mobile/` tests, bundles, and uploads to Play's internal testing track; see [the release guide](../README.md#releases).
It sets `versionCode` to the commit count and `versionName` to the release date (`-PversionCode=…`, `-PversionName=2026.10.25`); local builds use 1 and `0.0.0`.

The task needs the Play upload key's details in the gitignored `keystore.properties` in this folder:

```properties
storeFile=/path/to/upload.jks
storePassword=…
keyAlias=…
keyPassword=…
```

Without the file, release builds are signed with the debug key and Gradle warns; such a build runs on a device but Play rejects it, so the release task refuses to start.

Release builds use `https://enstorstark.se` and are shrunk with R8 (`proguard-rules.pro`).
The brand logos are looked up by name, so `res/raw/keep.xml` keeps them from resource shrinking.

The native app replaced the Skip build with the same application ID and a higher version code, so it installs as an update.
The Skip build's session lives in a format the native app does not read: testers sign in once after the update, and `LegacySession` deletes the old file at start.
