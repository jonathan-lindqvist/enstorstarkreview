# En Stor Stark (iOS app)

Native iOS client for "En stor stark", in Swift and SwiftUI. It uses the JSON API in `/api/v1` of
this repository (see `../docs/api.md` and `../openapi/v1.yaml`). The Android app is a separate
native Kotlin app.

[Repository overview](../README.md#architecture) · [API contract](../openapi/README.md) ·
[Screen guide](Sources/EnStorStark/README.md) · [Model guide](Sources/EnStorStarkModel/README.md)

## Architecture

```mermaid
flowchart TD
    Darwin["Darwin: iOS app host"] -->|"launch"| UI["EnStorStark: screens and<br/>navigation"]
    UI -->|"bind state and invoke actions"| Model["EnStorStarkModel: app,<br/>session, review models"]
    Model -->|"transport facade"| Client["APIClient and middleware"]
    Client -->|"generated operations and types"| Generated["EnStorStarkAPI"]
    Contract["Root openapi/v1.yaml"] -.->|"symlink and Swift build plugin"| Generated
    Client -->|"HTTP JSON and bearer session"| Backend["SvelteKit /api/v1"]
    Model -->|"session credentials"| Credentials["CredentialStore: Keychain"]
    Model -->|"unsaved new review and photo"| Local["UnsavedReviewStore:<br/>Application Support"]
```

[Package.swift](Package.swift) defines the dependency direction: UI depends on models, and models
depend on the generated API module. The host project lives outside `Sources/`; the screen and model
guides explain the application code below that directory. The backend remains authoritative for
access and validation. The web client is primary, and native builds are best effort rather than a
prerequisite for backend work.

## Layout

- `Sources/EnStorStarkAPI` — client and types generated from the server contract. `openapi.yaml`
  is a symlink to `../openapi/v1.yaml`; the `OpenAPIGenerator` build plugin regenerates the code on
  every build, so a contract change needs no extra step.
- `Sources/EnStorStarkModel` — `APIClient` (bearer token, problem+json errors) and app state.
- `Sources/EnStorStark` — SwiftUI screens. The design (dark, amber accent, Liquid Glass) lives in
  `iOS/`; `Components.swift` has shared helpers. iOS 26 or later (Liquid Glass).
- `Tests/EnStorStarkModelTests` — Swift Testing tests for the model module.
- `Darwin/` — Xcode project for the app host. `Darwin/EnStorStark.xcconfig` has the app name,
  bundle ID, version, and build number.

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

Coding agents use [XcodeBuildMCP](https://github.com/getsentry/XcodeBuildMCP) with
`../.xcodebuildmcp/config.yaml` (workspace, scheme, and project simulator).
Create the project simulator once with the command in that file. From the repository root,
`xcodebuildmcp simulator build-and-run` builds and starts the app, and the `ui-automation`
commands read the UI. See `AGENTS.md` for how to verify the app.

Launch arguments help with checks in the simulator without taps:
`-selectedTab reviews|map|statistics|about`, and (Debug builds only)
`-debugRoute review:<slug>`, `-debugRoute history:<slug>`, `-debugSignIn user:password` (or
`-debugSignIn out`), `-debugCreate YES` (new-review form), and `-debugEdit YES` (with a review
route: edit form), and `-debugWizardStep photo|bar|beer|ratings|text|authors` (opens that wizard
step). For example:
`xcrun simctl launch booted se.enstorstarkreview.app -debugRoute review:norrmalms-källare`.

Only Debug builds allow plain HTTP to local hosts (`Darwin/Info-Debug.plist`).

## Tests

The model tests run on the project simulator (the screens need UIKit, so `swift test` on the Mac
cannot build the package):

```sh
xcodebuild test -workspace Project.xcworkspace -scheme EnStorStarkModelTests \
  -destination 'platform=iOS Simulator,name=En Stor Stark (iPhone 18 Pro)' \
  -derivedDataPath .build/xcode -skipPackagePluginValidation
```

The scheme is shared in `.swiftpm/xcode/xcshareddata/xcschemes`. The test bundle has no host app,
so it cannot use the Keychain; tests use `SecureStorage` doubles.

## Servers

`AppConfiguration.serverOrigin` selects the server. Release builds always use production
(`https://enstorstarkreview.se`). Debug builds use the local `make dev` server by default
(`localhost:5173`).

To change the server in a Debug build, shake the device (simulator: Device › Shake, ⌃⌘Z), or
tap the "Server" row at the bottom of "Om". Choose local, production, or
enter any origin, for example an ngrok URL for a real phone. Start the tunnel with
`ngrok http 5173 --host-header=rewrite`: Vite rejects requests for unknown hosts with 403. The choice
is saved; a change signs out and reloads the app. The launch argument
`-debugServerOrigin <url>` overrides the saved choice.

## Reviewer mode

The login is hidden: long-press the "Version" row at the bottom of "Om". The token is stored in the
Keychain (`CredentialStore`), with the same item attributes that the Skip build used, so an update
keeps the session. A 401 on a request
that sent the token clears it and returns the app to reader mode. Sign-out also clears
`URLCache`, so no draft data stays on the device.

## Review form

Reviewers create drafts with "+" in Recensioner and edit with "Redigera" on a review. This
opens a full-screen wizard (`Sources/EnStorStark/iOS/ReviewWizardView.swift`): photo and crop,
bar and attributes, price and brand, one card per rating aspect, overall rating and text, and
authors with a card preview. An edit starts on a list of all steps. A new review keeps a local copy
(`UnsavedReviewStore`) until it is saved or discarded; a sign-out removes it. The wizard
covers every field of the API and shows server errors next to the field that the problem pointer
names. Photos come from the system photo picker (`PhotosPicker`, no photo permission needed) or
the camera (`UIImagePickerController`); the app converts them to JPEG and scales them to at most
2560 px. Edits send the `ETag` as
`If-Match`; after a 412 or `concurrent_update` the form offers to load the latest version.

The generated client URI-encodes header parameters, so `ConditionalHeaderMiddleware` sends
`If-Match`/`If-None-Match` raw. Without it, every edit fails with 412.
