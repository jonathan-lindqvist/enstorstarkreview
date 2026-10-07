---
name: secure-tdd
description: Apply security-minded TDD to runtime changes in this SvelteKit repository. Use for bug fixes, features, API/authentication changes, review workflows, and input or access-control policies; AGENTS.md requires this workflow for behavioral changes.
---

# Secure TDD

Read the root `AGENTS.md` and the relevant rule owner in `docs/architecture.md`.
Use existing Docker commands and adjacent test conventions. Keep user-facing text Swedish.

## Before changing behavior

Identify the observable rule and its trust boundary: caller identity, credential transport,
resource visibility, allowed fields, expensive work, and failure behavior. Follow the existing
collaborative access policy: all authenticated users may edit and publish any review.
Do not introduce per-owner restrictions unless requested.

For exposed API changes, edit `openapi/v1.yaml` first and regenerate types; never hand-edit
generated declarations. Record consequential policy choices and compatibility in `docs/api.md`.

## Red, green, refactor

1. Write the smallest test that reproduces the bug or specifies the new behavior. Prefer
   observable results and side effects over assertions mirroring implementation structure.
   Place unit tests beside the owning module; put HTTP/browser cases in `tests/`.
2. Run that test against the unchanged implementation. Confirm it fails for the intended
   reason. Fix dependency or harness failures separately; they do not prove the regression.
3. Implement the smallest correct change in the rule owner, keeping routes thin and shared
   web/API rules in server workflows. Run the test until green.
4. Refactor while green. Add relevant negative cases before expanding behavior. Documentation
   and generated-only changes do not require contrived failing tests.

## Security cases to select

Use the cases relevant to the changed boundary, without adding unrelated test scaffolding:

- Missing, invalid, expired, and revoked credentials; cookie/bearer isolation.
- Draft and unknown-status visibility across detail, history, images, lists, and caches.
- Malformed types, extra fields, injection attempts, byte limits, missing/misleading length,
  and input that can amplify CPU, memory, error output, or external calls.
- Blocked quotas before expensive work, one charge per attempt, retry headers, and failed
  dependencies that deny work rather than bypass protection.
- Stale and concurrent writes, publication conflicts, cleanup of replacement images, and
  absence of database, delivery, or cache side effects after rejection.

For rejected requests assert status, stable problem code, and relevant side-effect absence.
Validate representative HTTP bodies against OpenAPI. Test accepted boundary-size input too,
so abuse protections do not break supported uploads or ordinary Swedish text.

## Verify and document

Run relevant unit tests, then `npm run check` and `npm run lint`. For routes, authentication,
UI, or workflows also run `npm run test:integration`; for API changes run `api:types` and
`api:lint`. Use Docker if host dependencies are unavailable. Broaden testing when shared
rules change, and finish required checks without repeatedly running already settled suites.

Use only development/test MongoDB and local mocked delivery. Inspect config selectively:
do not print `.env`, secrets, tokens, full resolved Compose config, or credentialed URIs.
Update the README, API notes, architecture rule index, and agent guidance where affected.
Report the change, red-test evidence, final verification, and actual remaining limitations.
