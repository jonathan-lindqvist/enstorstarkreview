# Verifying the iOS app

The local server must run (`make dev` in the repository root).

- **Build and run:** XcodeBuildMCP `build_run_sim` (about 20 s). Defaults come from
  `../.xcodebuildmcp/config.yaml`. Do not also build with your own `xcodebuild` arguments: each
  change of arguments starts the next build from the beginning.
- **Simulator:** "En Stor Stark (iPhone 18 Pro)". If it is missing, create it with the command in
  the config. Most other simulator names exist once per runtime, so they select the wrong device.
- **Read the screen:** XcodeBuildMCP `snapshot_ui` or `wait_for_ui`, or `scripts/axui` (one line per
  element, with the tap point in screen points).
- **Tap, type, swipe, long press:** use the `axe` CLI. XcodeBuildMCP `tap` reports success but does
  nothing (tabs, buttons, and alerts), and it maps tabs to `Tab` but iOS 26 tabs are `RadioButton`.
  - `axe tap --label "Om" --element-type RadioButton --udid <id>`
  - `axe tap -x 201 -y 401 --udid <id>` (points from `axui`, not screenshot pixels)
  - `axe type "text" --udid <id>` (tap the field first)
  - `axe swipe --start-x 200 --start-y 700 --end-x 200 --end-y 150 --udid <id>`
  - `axe touch -x <x> -y <y> --down --up --delay 1.2 --udid <id>` (long press: hidden login on the
    version row in Om)
- **Screenshots:** XcodeBuildMCP `screenshot`. Use it only to check the look; use the UI tree to check
  state.
- **Launch arguments:** see `README.md` (`-debugSignIn`, `-debugRoute`, …). Demo login:
  `test` / `testpass123`.
- **Android:** `SKIP_ACTION=none` skips it. To check that Android still compiles, build once in Xcode
  or with `SKIP_ACTION=build`.
