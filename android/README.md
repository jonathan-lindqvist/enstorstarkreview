# En Stor Stark (native Android, spike)

A Kotlin and Jetpack Compose client, to replace the Skip build in `../mobile/Android`. This spike
has only the review feed. It uses the same API contract as iOS.

- The API client is generated from `../openapi/v1.yaml` on every build (OpenAPI Generator,
  `kotlin` with `jvm-okhttp4` and kotlinx.serialization). The task in `app/build.gradle.kts`
  patches one generator bug, an unqualified enum default.
- The theme, icons and feed card come straight from the Android design kit on the StorStarkApp
  board in Studio (`Kit.kt`).
- Debug builds install as `se.enstorstarkreview.app.dev` and use `http://10.0.2.2:5173` (the
  local `make dev` server, seen from the emulator).

## Commands

Run them from this folder. Tools come from `mise.toml`.

```sh
mise install
gradle :app:installDebug                # build and install (set ANDROID_SERIAL with several devices)
gradle :app:recordRoborazziDebug        # render the screenshot tests on the JVM, without a device
gradle :app:verifyRoborazziDebug        # compare against src/test/screenshots
```

Agents can read and drive the screen with the Android CLI (`$ANDROID_HOME/cmdline-tools/latest/bin/android`):
`android layout --flat`, `android input tap 'text:Äldsta'`, `android screen`, `android preview`.

## Spike timings (M-series Mac, emulator)

- First build, including downloading dependencies: about 1 min.
- Change a line, then build and install: about 7 s.
- Screenshot test on the JVM: about 5 s.
