# Native apps: test-driven development

How to apply the [secure-tdd](../../.agents/skills/secure-tdd/SKILL.md) workflow to the iOS app
(`mobile/ios/`, Swift) and the Android app (`mobile/android/`, Kotlin). The red, green, refactor rules are
the same as for the web; this guide covers what to test in a client, how to keep the loop fast,
and the traps in each toolchain. For building, running, and reading the screen, see
[`mobile/ios/AGENTS.md`](../../mobile/ios/AGENTS.md) and [`mobile/android/README.md`](../../mobile/android/README.md).

The native apps are best effort and no CI job builds or tests them (see [API](api.md)). Your local
run is the only evidence, so report the test commands you ran and what they printed, including the
red run.

## What gets a test

Test the model layer; check screens visually on the simulator or emulator.

- **Requests:** what goes over the wire for each action: body fields, `If-Match`, and that nothing
  is sent when validation fails. Omitting a field in a review update keeps the stored value, so a
  cleared optional field must send `null`; the generated Swift client once dropped it silently.
- **Responses:** decoding of every response type the app starts to use, including `null` in
  nullable fields. The generated clients have had nullability bugs on both platforms.
- **Errors:** problem+json codes mapped to field errors and states: 401 signs out, 412 and 409
  ask to reload without overwriting, 503 shows an error instead of empty data.
- **Rules:** form validation per step, sorting, formatting (Swedish, with non-breaking spaces in
  amounts), stamp texts, distance, and session persistence.

If a rule lives in a view, move it into the model first (`EnStorStarkModel` on iOS, `model/` on
Android), then test it there. Screen code that only lays out model state needs no test.

**Parity:** the two apps duplicate their logic on purpose. When you add or change a rule on one
platform, give the other platform the same test cases (same names and inputs) when you port it.
If the port isn't part of your change, say so in the PR. Porting works well test first: port the
tests, see them fail, then port the code.

## The loop

Run only the suite you are working on; run the whole target before committing.

|                                  | One test or suite                                                                                        | Everything                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| iOS (from `mobile/ios/`)         | `xcodebuild test … -only-testing:'EnStorStarkModelTests/BeerVolumeTests/savingWithoutAVolumeClearsIt()'` | the command in `mobile/ios/README.md#tests` |
| Android (from `mobile/android/`) | `gradle :app:testDebugUnitTest --tests '*DistanceSortTest'`                                              | `gradle :app:testDebugUnitTest`             |

The `…` stands for the arguments in `mobile/ios/README.md#tests`. Keep them, and the
`-derivedDataPath`, identical between runs: a first iOS run takes about a minute, and later runs
take a few seconds only while the arguments stay the same.

- **A compile error is not red.** Both languages are compiled, so a test of a new function first
  fails to build. Add a stub that returns an empty or default value, then run again so the test
  fails on its assertion.
- **Missing files:** for bundled assets (brand logos, images), add the mapping without the files
  first, so the catalog test fails once per missing file.
- **Make assertions safe:** use `try #require(…)` in Swift and check a list's size before
  indexing, so one wrong value fails one test instead of crashing the run.
- **Check that the test ran.**
  - iOS: the XCTest summary always says `Executed 0 tests`. Swift Testing reports on the `✔`
    and `✘` lines (`Test run with 1 test … passed`). A misspelled `-only-testing` name runs 0
    tests and still prints `TEST SUCCEEDED`.
  - Android: a `--tests` filter that matches nothing fails with "No tests found". Robolectric
    screenshot tests skip rendering in plain `test` runs; record them to see them render.
- **Prove a workaround's guard.** When a test protects a workaround (a generator patch, a request
  middleware), turn the workaround off once, see the test fail, and turn it back on. Mention it in
  the report.
- **When the expectation was wrong,** not the code, fix the test and say why in the report (for
  example, the transport sees paths without the `/api/v1` base). Don't change an expectation just
  to match new output.

## Test through the transport

Load data through the API client as the app does, with a fake network underneath. Avoid
test-only setters on models.

- **iOS:** `FakeTransport` in `Tests/EnStorStarkModelTests/Support.swift` answers by OpenAPI
  `operationId` and records each request (`transport.sent("updateReview")`, with `.json`).
  `SlowTransport` holds the first request, for out-of-order responses. Build the client with
  `APIClient.fake(transport)`.
- **Android:** `MockWebServer` with the `Routes` dispatcher (`src/test/.../TestServer.kt`) answers
  by `"METHOD /path"` without `/api/v1` and records requests. It goes through real OkHttp, so it
  catches threading bugs that a fake would hide. To wait for background work, have the model
  return its `Job` and `join()` it; don't sleep.
- Assert on the recorded request, its JSON body and headers, as well as on model state.

### Android traps

- Plain JVM tests return default values from Android APIs (`isReturnDefaultValues`), so
  `Log`, `Keystore`, and similar calls do nothing. Put that code behind an interface
  (`SecureStorage`) and test the logic with a double.
- Android forbids network reads on the main thread, and JVM tests don't enforce it. The
  `ApiClient` tests assert the thread that reads the body; keep that in place when you change
  the client.

## Fixtures

`mobile/ios/Tests/EnStorStarkModelTests/Fixtures` holds API responses for both platforms; Android adds
the folder as test resources. Capture them from the local server, don't write them by hand:

```fish
set token (curl -s -X POST localhost:5173/api/v1/sessions -H 'Content-Type: application/json' \
  -d '{"username":"test","password":"testpass123"}' | jq -r .token)
curl -s localhost:5173/api/v1/statistics -H "Authorization: Bearer $token" | jq . > statistics.json
```

The demo login counts against the local login rate limit; reuse the token for every capture.

- To vary one field, change it in the test (`Fixture.object("review")` in Swift, `Fixtures.json`
  in Kotlin) instead of adding a near-copy of a file.
- When the contract changes a response, capture it again and run both suites.
- Fixtures must stay free of real data: capture from the seeded development database only.

## Client security cases

The backend decides access and validation; the app protects the session and what it sends. Add
the cases that apply to your change:

- **Tokens:** stored only through `CredentialStore` (Keychain on iOS, an Android Keystore-encrypted
  store on Android). They must never appear in logs, fixtures, screenshots, or error messages.
  Sign-out and a 401 clear them. Changing the server (debug builds) signs out first, so a token
  is never sent to another origin.
- **Stored-format changes:** if you change how credentials or unsaved drafts are stored, read the
  old format in a test, so an app update doesn't sign reviewers out or lose a draft.
- **Writes:** updates and deletes always send the `If-Match` the app last saw. A 412 or 409 leaves
  the server untouched and asks the user to reload.
- **Debug only:** plain HTTP, the server picker, debug launch arguments, and the `.dev` package
  suffix exist only in debug builds. Release builds talk to production over HTTPS. Keep the
  switches in debug-only sources or configuration (`Info-Debug.plist`, `src/debug/`).
- **Location:** the phone's position is kept in memory only, as on the web.
