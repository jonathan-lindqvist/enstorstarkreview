# En Stor Stark (native app)

Native iOS and Android client for "En stor stark", built with [Skip Fuse](https://skip.dev)
(native Swift on both platforms, SwiftUI shown through Jetpack Compose on Android). It uses the
JSON API in `/api/v1` of this repository (see `../docs/api.md` and `../openapi/v1.yaml`).

## Layout

- `Sources/EnStorStarkAPI` — client and types generated from the server contract. Plain Swift, no
  Skip plugin. `openapi.yaml` is a symlink to `../openapi/v1.yaml`; the `OpenAPIGenerator` build
  plugin regenerates the code on every build, so a contract change needs no extra step.
- `Sources/EnStorStarkModel` — `APIClient` (bearer token, problem+json errors) and app state.
- `Sources/EnStorStark` — SwiftUI screens.
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

Launch arguments help with checks in the simulator without taps:
`-selectedTab reviews|map|statistics|about`, and (Debug builds only)
`-debugRoute review:<slug>`, `-debugRoute history:<slug>`, `-debugSignIn user:password` (or
`-debugSignIn out`), `-debugCreate YES` (new-review form), and `-debugEdit YES` (with a review
route: edit form). For example:
`xcrun simctl launch booted se.enstorstarkreview.app -debugRoute review:norrmalms-källare`.

Only Debug builds allow plain HTTP to local hosts (`Darwin/Info-Debug.plist`).

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
`Darwin/EnStorStark.xcconfig`), but does not start an emulator. Set `SKIP_ACTION = launch` to
run it on an open emulator. The build needs a JDK: it uses `JAVA_HOME`, else the JDK that
`/usr/libexec/java_home` reports (Xcode does not see shell variables). The emulator reaches the
dev server at `http://10.0.2.2:5173`, which needs a debug-only cleartext exception before it
works.
