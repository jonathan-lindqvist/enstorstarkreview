# En Stor Stark (Android app)

Native Android client for "En stor stark", in Kotlin and Jetpack Compose. It uses the JSON API in
`/api/v1` of this repository (see `../docs/api.md` and `../openapi/v1.yaml`) and follows the iOS
app in `../mobile`, with a Material 3 layout. User-facing text is in Swedish.

[Native TDD guide](../docs/agents/mobile.md) · [API contract](../openapi/README.md)

## Architecture

- `model/` holds everything that has rules: the API client, sessions, the review list, detail,
  form, and wizard rules. Plain classes keep their state in Compose `mutableStateOf`; there are no
  ViewModels. `AppModel` is created once in `EnStorStarkApp` and reaches screens through
  `LocalApp`.
- `ui/` lays out model state. The four tabs live in `HomeRoute`; the review page, history, login,
  and the wizard (`WizardRoute`) are pushed routes (Navigation Compose with serializable routes).
- Only the API models are generated from `../openapi/v1.yaml` on every build (OpenAPI Generator,
  kotlinx.serialization). The HTTP calls are written by hand in `ApiClient` and read responses on
  the IO dispatcher. `app/build.gradle.kts` patches the generator's output for nullable inline
  objects and fails the build if a patch stops matching.
- The theme, icons, and layout come from the Android design kit on the StorStarkApp board in
  Studio (`Kit.kt`); stamps, volume, and logos follow the iOS app.

## Commands

Run them from this folder. Tools come from `mise.toml`.

```sh
mise install
gradle :app:testDebugUnitTest           # model tests on the JVM (MockWebServer, shared fixtures)
gradle :app:installDebug                # build and install (set ANDROID_SERIAL with several devices)
gradle :app:verifyRoborazziDebug        # compare the screenshot tests with src/test/screenshots
gradle :app:recordRoborazziDebug        # re-record them after an intended change
gradle :app:lintDebug
```

Debug builds install as `se.enstorstarkreview.app.dev` next to the Play build and use
`http://10.0.2.2:5173`, the local `make dev` server seen from the emulator (plain HTTP is allowed in
debug builds only). The reviewer login is hidden: long-press the "Version" row at the bottom of
"Om".

Agents can read and drive the screen with the Android CLI (`$ANDROID_HOME/cmdline-tools/latest/bin/android`):
`android layout --flat`, `android input tap 'text:Äldsta'`, `android screen`, `android preview`.

## Google Maps

The map needs `MAPS_API_KEY`, from the environment or the gitignored `local.properties`
(`MAPS_API_KEY=…`). Without it the app builds and the map stays empty. The key (Google Cloud
project `enstorstarkreview`) is restricted to the Maps SDK for Android and to these packages with
their signing-certificate SHA-1s: `.dev` with the debug key, and `se.enstorstarkreview.app` with
the upload and Play app-signing keys. A new debug machine needs its debug key's SHA-1 added
(`keytool -list -v -keystore ~/.android/debug.keystore -storepass android`).

## Release

1. Increase `versionCode` in `app/build.gradle.kts` (and `versionName` when it should change).
   Play rejects a code it has seen.
2. Put the Play upload key's details in the gitignored `keystore.properties` in this folder:

   ```properties
   storeFile=/path/to/upload.jks
   storePassword=…
   keyAlias=…
   keyPassword=…
   ```

   Without the file, release builds are signed with the debug key and Gradle warns; such a build
   runs on a device but Play rejects it.

3. `gradle :app:bundleRelease` and upload `app/build/outputs/bundle/release/app-release.aab` to the
   internal testing track.

Release builds use `https://enstorstarkreview.se` and are shrunk with R8 (`proguard-rules.pro`).
The brand logos are looked up by name, so `res/raw/keep.xml` keeps them from resource shrinking.

The native app replaced the Skip build with the same application ID and a higher version code, so
it installs as an update. The Skip build's session lives in a format the native app does not read:
testers sign in once after the update, and `LegacySession` deletes the old file at start.
