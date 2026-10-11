# Design: native on each platform

The app must feel native on each platform. Share the model and the rules
(`Sources/EnStorStarkModel`), not the look:

- **iOS** (`Sources/EnStorStark/iOS/`): Apple components and conventions — SwiftUI, Liquid Glass,
  SF Symbols, MapKit (Apple Maps).
- **Android** (`Sources/EnStorStark/Android/`): Material 3 and Google components — Material
  Symbols, Material buttons, chips, snackbars, and dialogs, and Google Maps
  (`Skip/ReviewGoogleMap.kt`). Use Jetpack Compose through `ComposeView` where SkipUI has no
  Material equivalent.

Do not copy an iOS control to Android, or the other way round, when the platform has its own
pattern. The Android designs are in the Studio board `StorStarkApp` (Droid01–27).

# Verifying the iOS app

The local server must run (`make dev` in the repository root).

- **Build and run:** XcodeBuildMCP `build_run_sim` (about 20 s). Defaults come from
  `../.xcodebuildmcp/config.yaml`. Do not also build with your own `xcodebuild` arguments: each
  change of arguments starts the next build from the beginning.
- **Simulator:** "En Stor Stark (iPhone 18 Pro)". If it is missing, create it with the command in
  the config. Most other simulator names exist once per runtime, so they select the wrong device.
- **Read the screen:** XcodeBuildMCP `snapshot_ui` or `wait_for_ui`, or `scripts/axui` (one line per
  element, with the tap point in screen points).
- **Tap, type, swipe, long press:** use the `axe` CLI. XcodeBuildMCP `tap` uses AXe too. It maps
  tabs to `Tab`, but iOS 26 tabs are `RadioButton`, so it cannot tap tabs. Its other failed taps
  were possibly the input problem below, not a fault in XcodeBuildMCP.
  - `axe tap --label "Om" --element-type RadioButton --udid <id>`
  - `axe tap -x 201 -y 401 --udid <id>` (points from `axui`, not screenshot pixels)
  - `axe type "text" --udid <id>` (tap the field first)
  - `axe swipe --start-x 200 --start-y 700 --end-x 200 --end-y 150 --udid <id>`
  - `axe touch -x <x> -y <y> --down --up --delay 1.2 --udid <id>` (long press: hidden login on the
    version row in Om)
- **Known problem (not solved):** sometimes `axe` taps, swipes, and even `axe button home` report
  success but have no effect on any screen, also after a simulator reboot. The UI tree still reads
  correctly. The cause is in the simulator input or in AXe, not in XcodeBuildMCP. If this happens,
  ask the user to check the flow by hand.
- **Wizard identifiers:** controls in the review wizard have `wizard.*` accessibility identifiers
  (for example `wizard.next`, `wizard.rating.value.3`), so `axe tap --id` can find them.
- **Screenshots:** XcodeBuildMCP `screenshot`. Use it only to check the look; use the UI tree to check
  state.
- **Launch arguments:** see `README.md` (`-debugSignIn`, `-debugRoute`, …). Demo login:
  `test` / `testpass123`.
- **Android:** `SKIP_ACTION=none` skips it. To check that Android still compiles, build once in Xcode
  or with `SKIP_ACTION=build`.

# Verifying the Android app

- **Emulator:** start it with the host GPU:
  `~/Library/Android/sdk/emulator/emulator -avd <name> -gpu host`. With software rendering
  (the default from the command line on some hosts), the window goes white after Google Maps opens.
- **Build and launch:** the terminal build with `SKIP_ACTION=launch` (see `README.md`). The app
  shows "Updating…" for about a minute after each install.
- **Input:** `adb shell input tap|swipe|text`. `input text` fails on non-ASCII characters such as
  "ö"; type `%s` for a space. The emulator is slow: wait some seconds after each tap.
- **Read the screen:** `adb exec-out screencap -p` for the look, `adb shell uiautomator dump` for
  the element tree.
- **Map:** without `GOOGLE_MAPS_API_KEY`, "Karta" shows the place list (see `README.md`). With a
  placeholder key, the map, markers, and preview work, but there are no tiles and the camera does
  not move. The emulator location does not change with only the approximate location permission.
