# API security implementation plan

This change hardens the API introduced by `f21ba22` against unbounded anonymous input,
large-base64 validation failures, and update preconditions that permit lost edits.

| Review finding                                                 | Fix                                                                     | Design rationale                                                       |
| -------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 2: anonymous parsing before quotas and excessive schema errors | Pre-parser shared IP admission, endpoint byte limits, fail-fast schemas | Reject abuse before expensive work; keep quotas shared and charge once |
| 3: base64 regex stack overflow below the image limit           | Linear ASCII and padding validation                                     | Constant stack space while preserving supported image sizes            |
| 4: weak/wildcard edit preconditions                            | Separate strong PUT and weak GET matching                               | Require an explicit version for writes while preserving cache behavior |

See [API design decisions and compatibility](api.md#design-decisions-and-compatibility)
for the implementation tradeoffs and client-visible changes.

## Implementation

1. Write failing tests for streaming body limits, anonymous admission before parsing,
   bounded schema errors, multi-megabyte base64, and strong update preconditions.
2. Reuse the existing login and review-request IP quotas before reading API request bodies.
   Pass the server-owned admission result into the shared workflow so an attempt counts once.
   Keep username and global delivery limits in their existing workflows.
3. Enforce 16 KiB JSON bodies for sessions and review requests, and 22 MiB for authenticated
   review creation/updates. Count actual streamed bytes even when Content-Length is absent
   or misleading. Stop schema validation at the first structural failure.
4. Validate base64 with a linear character scan and explicit length/padding checks. Retain
   the 15 MiB decoded limit and the shared image signature/re-encoding workflow.
5. Split ETag matching: weak matching and wildcard for If-None-Match; strong explicit tags
   for If-Match. Reject wildcard updates with 412; retain 428 for a missing header.
6. Expand HTTP coverage for bearer/cookie isolation, denied writes, draft visibility,
   session expiry/revocation, input failures, caching, and publication conflicts. Add
   deterministic workflow tests for conditional-write conflicts and new-image cleanup.
7. Reconcile README, API notes, OpenAPI, architecture/rule ownership, and agent guidance.
   Record the design decisions in the API notes and add a repository-local TDD/security skill.

## Acceptance and compatibility

Run the failing regressions before production edits, then the unit suite, Svelte typecheck,
lint, OpenAPI lint/type freshness, and the full Playwright suite against a Docker development
database and a production build. Tests must assert status, error code, contract shape,
side-effect absence, and quota counts where relevant.

The API intentionally tightens compatibility: malformed anonymous attempts count against
the existing IP quota, bodies have endpoint-specific limits, schema errors report the first
structural failure, and wildcard/weak update tags return 412. Routes, review fields, and
collaborative permissions remain compatible; no database migration is required.

Production demo-account seeding and stale web-form submissions are separate findings from
the review and are outside these three fixes. Documentation must describe those limitations
accurately without claiming they have been repaired.

## Completion and verification

Implemented and verified in Docker. The initial regressions reproduced schema error
amplification, missing endpoint limits, malformed-input quota bypass, multi-megabyte regex
stack overflow, and acceptance of weak/wildcard update tags before the fixes.

- Full unit suite: **286 passed** across 44 files, including base64 decoding at 15 MiB.
- Full Playwright suite: **36 passed**, including 14 API HTTP cases and an unfinished
  chunked upload that receives 413 before the client finishes sending.
- `npm run check`: zero errors and warnings.
- `npm run lint`: passed; `npm run api:lint`: valid with 12 existing advisory warnings.
- Generated API type freshness and route coverage: passed in the contract unit tests.
- Repository skill validation: passed. Root `AGENTS.md` also requires its TDD/security
  workflow for agents without skill discovery support.

Playwright's managed production build/preview and local delivery mock were used; no test
submission was sent to Discord. Preview now binds explicitly to IPv4. API login/quota
tests restore limiter state to avoid exhausting the real shared quota for later browser
specs. README, API notes, architecture, OpenAPI, database notes, and agent guidance were
reconciled with the API introduction and these fixes; the existing RSS documentation
was checked against the retained feed behavior and passing feed tests.
