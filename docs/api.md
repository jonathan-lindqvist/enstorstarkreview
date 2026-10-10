# Native client API

The JSON API introduced in `f21ba22` lives in the same SvelteKit app under `/api/v1`.
[openapi/v1.yaml](../openapi/v1.yaml) is the contract. The web app is the primary client;
`mobile/` is best effort and does not need to build or change for web work. The API backend
must remain correct. [The security implementation plan](api-security-plan.md) records the
follow-up work and its acceptance criteria.

## Contract and TDD workflow

1. Edit `openapi/v1.yaml` first for an exposed behavior change.
2. Run `npm run api:types` and `npm run api:lint` (Docker: `make dev-api-types`). Never edit
   `src/lib/types/api-v1.d.ts` by hand.
3. Add a regression and observe it fail for the intended behavior before implementing.
4. Implement in `server/api/` or the shared workflow; keep `+server.ts` routes responsible
   for authentication/admission, parsing, and responses.
5. Run unit tests, `npm run check`, `npm run lint`, and integration tests. Update the request,
   response, and metadata mappers together when a review field changes.

`contract.test.ts` checks route coverage and generated-type freshness. Runtime request
validation uses the contract schemas. HTTP tests additionally validate representative
success and problem responses against those schemas. TypeScript response types alone do
not perform runtime response validation. Native clients generate from the same contract.

## Authentication and access

`POST /sessions` returns a Lucia session ID as a bearer token with 30-day sliding expiry.
For `/api/*`, hooks read only `Authorization: Bearer`; cookies are ignored and no web
session cookie is issued. A browser can call the API with an explicitly supplied token.
Cookie isolation removes ambient browser session authority; it does not prevent browser
requests. Use HTTPS and do not put tokens into URLs or logs. `DELETE /session` revokes the
current token.

Anonymous clients see exactly published reviews and legacy reviews with missing status.
Drafts and unknown statuses are excluded. Draft details, history, and images require a
token and return 404 to anonymous clients. Any authenticated user may view, edit, and
publish any draft: this is the intended collaborative model, without per-owner roles.
Deleted reviews are hidden from every client, signed in or not: their details, history,
images, and list entries return 404 or are omitted, and they cannot be edited or published.
Protected writes authenticate before reading JSON. `/users` exposes usernames only.
`POST /map/geocoding` requires a token; device location is never accepted or sent to the
backend. The map marker list has no resolved/total counter.

## Input, quotas, and images

Endpoints with request bodies accept `application/json`. Image GETs return image bytes;
publication, geocoding, and session deletion do not require JSON bodies. Production
SvelteKit CSRF checks still apply to form content types; they can reject those requests
before API handlers. The API has no cookie-authorized write path.

| JSON request           | Maximum body bytes  | Admission before body parsing  |
| ---------------------- | ------------------- | ------------------------------ |
| Session creation       | 16 KiB (16,384)     | Shared login IP quota          |
| Review request         | 16 KiB (16,384)     | Shared review-request IP quota |
| Review creation/update | 22 MiB (23,068,672) | Bearer authentication          |

Limits come from each request schema's `x-max-body-bytes` extension. They count streamed
UTF-8 bytes, including when `Content-Length` is absent or understated. Declared oversize
bodies are rejected without reading; streamed oversize bodies stop reading at the limit.
Both return 413 `payload_too_large`. On HTTP/1 the connection is closed after the response
so unread input is not reused. These application limits also apply during development;
production's 30 MiB `BODY_SIZE_LIMIT` remains an outer bound. Proxy/adapter rejections
can happen before the application produces a problem response.

Anonymous API attempts consume their IP quota before media-type, syntax, or schema
validation, including malformed and oversized input. Blocked IPs return 429 and
`Retry-After` without parsing. A valid login also consumes the username quota before
credential verification; a valid review request consumes the global delivery quota.
Admission is passed internally to the shared workflow so the IP attempt is charged once.

Login limits remain 8 attempts per IP and per username per 15-minute window/block, shared
with web login. Success clears only the username limit. Unknown usernames still incur
Argon2 hashing. Review requests retain their separate 5-per-IP/day and 30-deliveries/hour
policies, shared with the web form. Invalid API input never consumes the global delivery
quota or sends a webhook. A failed IP limiter fails closed: login returns 500
`internal_error`, review requests return 503 `service_unavailable`. Login audits identify
the API channel; audits exclude passwords, tokens, and request text.

Structural schema validation stops at its first error to bound work and response size.
Shared business validation can still return multiple field errors. Images use standard
padded base64 with no whitespace, at most 15 MiB decoded. The 22 MiB review budget covers
base64 expansion plus metadata. Clients convert HEIC to JPEG and downscale before upload.
After decoding, the shared workflow checks JPEG/PNG/WebP MIME and signatures and re-encodes
with `sharp`, removing metadata. Malformed base64 returns 422; decoded oversize returns 413.

## Shared writes and version checks

Create, edit, publish, image reads, and review requests reuse the web workflows.
`server/api/review-input.ts` explicitly maps fields to `FormData`: an unmapped new field
can be silently reset by an API edit. Omitted optional `image` and `attributes` preserve
their stored values. Publication status is never writable through create/edit input;
publication uses its own one-way action and preserves credited authors.

Read a review's `ETag`, then send that exact strong tag in `If-Match` on PUT. Missing
headers return 428 `precondition_required`; stale tags, weak-only tags, and any wildcard
return 412 `precondition_failed`. A list is allowed if it contains the current strong
tag and no wildcard. After a successful edit, use the returned new tag. A race after
loading is detected by the atomic MongoDB `updatedAt` condition and returns 409
`concurrent_update`; a new replacement image is cleaned up on this conflict.

Web edits also use a conditional database write against the version loaded during the
POST. The web form currently does not submit its originally displayed version, so this
does not protect an old open form submitted after another edit has already completed.
That separate issue is outside this API hardening change.

GET cache validation intentionally retains weak matching and wildcard support through
`If-None-Match`. Matching authorized reads return bodyless 304s. Review visibility is
checked before cache validation. JSON reads vary on `Authorization`; authenticated reads
are `private, no-cache`. Draft image responses are `private, no-store`; public images
retain immutable caching. Successful writes and problem responses use `no-store`.

API handlers produce RFC 9457 `application/problem+json` with a stable `code`, Swedish
`detail`, and field `errors[].pointer`. Their wrapper also converts unexpected handler
errors to generic 500 problems. Hook failures, framework method/origin checks, and outer
proxy/body limits can run before that wrapper and need not have the same response format.

## Design decisions and compatibility

- **Reuse quotas with early admission.** One server-owned result, bound to the request IP,
  connects pre-parser admission to the existing workflow. This keeps web/API quotas shared
  and avoids double charging or adding a second limiter. Username/global limits stay at
  the point where valid input supplies their keys and delivery intent.
- **Bound input at the application boundary.** Endpoint budgets are in OpenAPI, not only
  deployment configuration. The reader counts actual bytes and schema validation fails
  fast. This closes the malformed-input path without reducing authenticated image support.
  Slow connection handling and aggregate traffic limits still belong to deployment.
- **Use linear base64 validation.** An ASCII scan checks length, alphabet, and terminal
  padding with constant stack use. It replaces the repeated-group regex that overflowed
  on valid multi-megabyte images. The decoded limit is checked before allocating decoded
  bytes; existing image signature and re-encoding defenses remain authoritative.
- **Separate cache and edit validators.** Weak comparison is useful for caches. Writes
  require an explicit strong version. HTTP permits `If-Match: *` to mean existence, but
  this API deliberately rejects it because its edit policy requires a known version.

These are intentional v1 behavior changes: malformed anonymous attempts now count toward
IP quotas, request bodies have endpoint limits, structural validation reports only the
first error, and wildcard/weak-only updates are rejected. Clients should send the strong
review ETag and handle 413/429. Paths, fields, and collaborative permissions are unchanged;
no database migration is required.

## Verification

Adjacent unit tests cover streaming byte limits, fail-fast schemas, large and malformed
base64, quota ordering and failures, bearer parsing, cache/edit validator separation, and
conditional-write image cleanup. `tests/api.test.ts` exercises HTTP contracts, bearer/cookie
isolation, denied writes without mutations, draft visibility, expiry/revocation, malformed
input quotas, stale/weak/wildcard edits, invalid authors/ratings/images, large image upload,
and one-way publication.

Playwright's managed preview binds explicitly to `127.0.0.1` and overrides delivery with
the local mock webhook. Use a development/test MongoDB: fixtures temporarily reset quota
collections and restore them afterward. Do not point these tests at production or use
an external server configured with a real Discord webhook.
