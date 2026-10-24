# Toolchain

`mise.toml` in this folder declares the tools for Android builds: the Skip CLI, Gradle, a JDK,
`ANDROID_HOME`, and swiftly. iOS builds need only Xcode. Set up once, from `mobile/`:

```sh
mise trust
mise install                       # skip, gradle, java
mise bootstrap packages apply      # swiftly (Homebrew)
skip android sdk install           # Swift Android SDK, if `skip checkup` reports it missing
```

- Keep the `skip` version in `mise.toml` equal to the skip package version in `Package.resolved`.
  Xcode builds use the CLI that the package plugin downloads; `skip export` and the Gradle prebuild
  use the mise one.
- Xcode builds do not load mise. The Gradle prebuild there finds `gradle` and `skip` through
  `/opt/homebrew/bin` (see `Android/settings.gradle.kts`).
- Release export for Google Play: `skip export --release --no-ios` writes
  `.build/skip-export/EnStorStark-release.aab`. Signing needs `Android/app/keystore.jks` and
  `Android/app/keystore.properties` (not in Git; without them the bundle gets the debug key, which
  Play rejects). Increase `CURRENT_PROJECT_VERSION` in `Skip.env` for every upload.

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
