# En Stor Stark (native app)

Native iOS and Android client for "En stor stark", built with [Skip Fuse](https://skip.dev)
(native Swift on both platforms, SwiftUI shown through Jetpack Compose on Android). It uses the
JSON API in `/api/v1` of this repository (see `../docs/api.md` and `../openapi/v1.yaml`).

## Layout

- `Sources/EnStorStarkAPI` — client and types generated from the server contract. Plain Swift, no
  Skip plugin. `openapi.yaml` is a symlink to `../openapi/v1.yaml`; the `OpenAPIGenerator` build
  plugin regenerates the code on every build, so a contract change needs no extra step.
- `Sources/EnStorStarkModel` — `APIClient` (bearer token, problem+json errors) and app state.
- `Sources/EnStorStark` — SwiftUI screens. The iOS app has its own design (dark, amber accent,
  Liquid Glass) in `iOS/`; those files compile only when `!os(Android)`. Android keeps the plain
  system screens in `Android/` (`os(Android)` only) until it gets its own design. A screen has the
  same type name on both platforms, so `ContentView` and the shared files (`Components.swift`,
  `ReviewFormView.swift`) use either one. File names must be unique in the module, so the
  Android files have the `Android` prefix.
- iOS needs iOS 26 or later (Liquid Glass).
- `Darwin/` — Xcode project for the iOS app. `Android/` — Gradle project for the Android app.
- `Skip.env` — shared app name, bundle ID, and version.

## Running (iOS)

1. Start the server from the repository root: `make dev` (http://localhost:5173, login
   `test` / `testpass123`).
2. Open `Project.xcworkspace` in Xcode and run the "EnStorStark App" scheme on a simulator.

Or from the terminal:

```sh
xcodebuild -workspace Project.xcworkspace -scheme "EnStorStark App" \
  -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath .build/xcode \
  -skipPackagePluginValidation build
```

For a quick host build without Xcode, use `swift build --build-system native` (Skip needs the
native build system; the new default fails with duplicate-library errors).

Coding agents use [XcodeBuildMCP](https://github.com/getsentry/XcodeBuildMCP) with
`../.xcodebuildmcp/config.yaml` (workspace, scheme, project simulator, and `SKIP_ACTION=none`).
Create the project simulator once with the command in that file. From the repository root,
`xcodebuildmcp simulator build-and-run` builds and starts the app, and the `ui-automation`
commands tap, type, and read the UI. Use one build path only: other `xcodebuild` arguments make
the next build start from the beginning.

Launch arguments help with checks in the simulator without taps:
`-selectedTab reviews|map|statistics|about`, and (Debug builds only)
`-debugRoute review:<slug>`, `-debugRoute history:<slug>`, `-debugSignIn user:password` (or
`-debugSignIn out`), `-debugCreate YES` (new-review form), and `-debugEdit YES` (with a review
route: edit form). For example:
`xcrun simctl launch booted se.enstorstarkreview.app -debugRoute review:norrmalms-källare`.

Only Debug builds allow plain HTTP to local hosts (`Darwin/Info-Debug.plist`).

## Servers

`AppConfiguration.serverOrigin` selects the server. Release builds always use production
(`https://enstorstarkreview.se`). Debug builds use the local `make dev` server by default
(`localhost:5173` on iOS, `10.0.2.2:5173` in the Android emulator).

To change the server in a Debug build, shake the device (simulator: Device › Shake, ⌃⌘Z), or
tap the "Server" row at the bottom of "Om" (also on Android). Choose local, production, or
enter any origin, for example an ngrok URL for a real phone. Start the tunnel with
`ngrok http 5173 --host-header=rewrite`: Vite rejects requests for unknown hosts with 403. The choice
is saved; a change signs out and reloads the app. The launch argument
`-debugServerOrigin <url>` overrides the saved choice.

## Reviewer mode

The login is hidden: long-press the "Version" row at the bottom of "Om". The token is stored with
`skip-keychain` (Keychain on iOS, EncryptedSharedPreferences on Android). A 401 on a request
that sent the token clears it and returns the app to reader mode. Sign-out also clears
`URLCache`, so no draft data stays on the device.

## Review form

Reviewers create drafts with "+" in Recensioner and edit with "Redigera" on a review. The form
covers every field of the API and shows server errors next to the field that the problem pointer
names. Photos come from the library or the camera (`skip-kit`); iOS converts them to JPEG and
scales them to at most 2560 px, Android only re-encodes them to JPEG. Edits send the `ETag` as
`If-Match`; after a 412 or `concurrent_update` the form offers to load the latest version.

The generated client URI-encodes header parameters, so `ConditionalHeaderMiddleware` sends
`If-Match`/`If-None-Match` raw. Without it, every edit fails with 412.

## Android

Every Xcode build also compiles the Android app (`SKIP_ACTION = build` in
`Darwin/EnStorStark.xcconfig`), but does not start an emulator. The build needs a JDK: it uses
`JAVA_HOME`, else the JDK that `/usr/libexec/java_home` reports (Xcode does not see shell
variables). To install and start the app on the first running emulator, pass
`SKIP_ACTION=launch` to the terminal build above:

```sh
xcodebuild -workspace Project.xcworkspace -scheme "EnStorStark App" \
  -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath .build/xcode \
  -skipPackagePluginValidation SKIP_ACTION=launch build
```

Do not use `skip app launch`: it builds with `-sdk iphonesimulator` and no destination, so Xcode
also compiles the OpenAPI generator plugin for iOS, which fails.

The emulator reaches the dev server at `http://10.0.2.2:5173`. Requests go through Swift
Foundation (libcurl), not the Android network stack, so no cleartext exception is necessary.

SkipUI on Android has some limits that the code works around:

- `Image(systemName:)` knows only a fixed set of SF Symbol names and shows a warning triangle
  for the others. Use `Symbol` in `Components.swift` for icons outside that set.
- `ForEach` over a `ClosedRange` (`0...5`) crashes the app. Use `Array(0...5)` or a `Range`.
- A `LazyVGrid` must be the only child of its `ScrollView`, or the content is cut off.
  `StatisticsView` uses plain stacks.
