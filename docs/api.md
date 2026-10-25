# Native client API

The JSON API introduced in `f21ba22` lives in the same SvelteKit app under `/api/v1`.
[openapi/v1.yaml](../openapi/v1.yaml) is the contract, generated from the oRPC router in
[src/lib/server/rpc](../src/lib/server/rpc/README.md): every server feature is one procedure that
the web calls server-side and the API serves over HTTP. The web app is the primary client;
`mobile/` (the iOS and Android apps) is best effort and does not need to build or change for web work. The API backend
must remain correct. [The security implementation plan](api-security-plan.md) records the
follow-up work and its acceptance criteria.

## Contract and TDD workflow

1. Add a regression for the procedure (`call(router.x.y, input, { context })` with the fakes in
   `rpc/test-fixtures.ts`) and observe it fail for the intended behavior.
2. Change the procedure, its Zod schemas in `rpc/schemas.ts` and the shared workflow. Web routes
   call the procedure through `webClient(event)`; they own only redirects and page data.
3. Run `npm run api:generate`, `npm run api:diff` and `npm run api:lint` (Docker: prefix each with
   `docker compose -f docker-compose.dev.yml exec app`). Never edit `openapi/v1.yaml` or
   `src/lib/types/api-v1.d.ts` by hand. Record client-visible changes below.
4. Run unit tests, `npm run check`, `npm run lint`, and integration tests. Update the request,
   response, and metadata mappers together when a review field changes.

`rpc/openapi.test.ts` checks that every procedure is documented and that the generated YAML and
types are fresh. Runtime request validation uses the same Zod schemas that generate the contract.
HTTP tests additionally validate representative success and problem responses against the YAML
with Ajv. Responses are not validated at runtime (`unvalidated()` output schemas only document
them). Native clients generate from the same contract.

## Authentication and access

The homepage uses the separate cookie-authenticated web endpoint `GET /recensioner/data` for
bounded card batches and the on-demand nearest index. Its parameters, visibility, private caching
and limits are documented in [the web data contract](seo.md#web-data-contract). It does not change
the bearer-only `/api/v1` contract or native generated clients.

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
A published image was served with a one-year immutable cache, so clients and shared caches
that already hold it may keep showing it after deletion.
`DELETE /reviews/{slug}` lets any authenticated user delete any review, draft or published, with
the web's workflow, audit events and cache invalidation. It returns 204. Unlike the web action,
it requires a current strong `If-Match`, with the same 428/412 rules as PUT, so a client never
deletes a version it has not seen; the stored version is checked again inside the deletion, and
a race returns 409 `concurrent_update`. Unknown and already deleted reviews return 404. The web
delete action calls the same procedure and now carries the version the edit page showed.

`GET /nearby-reviews?address=…&exclude=<slug>` gives the native wizard the web form's nearby
comparison beside the barhop rating: cumulative counts within 250, 500 and 1,000 metres and the
five nearest reviews within 1,000 metres. It reuses `loadNearbyReviewComparison` and
`getNearbyReviewSummary`, so the numbers match the web. The center is the saved position of a
review with the same normalized address; the server never geocodes and never accepts a device
location, so unlike the web there is no position fallback. Counts include drafts, so a token is
required. `exclude` leaves the edited review out of the counts while its address can still be
the center. A repeated, blank or overlong `address` (over 300 characters) or an invalid
`exclude` is 400, an unknown `exclude` 404, and a failed comparison load 503, never empty counts.
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

Create, edit, publish, delete, image reads, and review requests are the same procedures for the
web and the API. `rpc/review-input.ts` explicitly maps fields to `FormData`: an unmapped new field
can be silently reset by an API edit. Omitted optional `image` and `attributes` preserve
their stored values. Optional `beer.volumeCl` accepts a whole number from 1–200 or null.
Omitting it on creation means unknown; omitting it on PUT preserves the stored size, while null
explicitly clears it. Review responses always include nullable `beer.volumeCl`; malformed legacy
sizes return null. Metadata exposes `beerVolumeMinCl` and `beerVolumeMaxCl`.
The review representation ETag prefix is now `v2`, so cached older responses refresh.
Publication status is never writable through create/edit input;
publication uses its own one-way action and preserves credited authors.

Public statistics also expose `valueReviewCount`, nullable `averageClPerKr`, `bestValueBars`,
`worstValueBars`, and `beerBrandValues`. Only public active reviews with valid whole-centilitre
volume and whole-krona price are eligible. Overall and brand averages give each review equal
weight. Rankings contain at most five entries ordered by unrounded cl/kr, then title and slug.
Happy-hour entries are excluded from all price/value averages, eligible sample counts, rankings
and brand aggregates. Price-only and volume-qualified sample counts remain separate.

`GET /api/v1/statistics` adds required nonnegative integer `totalReviewerSpendKr`, defaulting to
zero. It estimates one beer per distinct credited reviewer per public active bar at the current
saved whole-krona price (1–999), including happy-hour prices. Primary authors and co-authors count
once per bar, including legacy string co-authors and credits for deleted accounts. Blank/malformed
credits and invalid prices contribute zero. This is an additive response field; existing review
writes and native UI are unchanged. It shares the public statistics cache and write invalidation.

Read a review's `ETag`, then send that exact strong tag in `If-Match` on PUT. Missing
headers return 428 `precondition_required`; stale tags, weak-only tags, and any wildcard
return 412 `precondition_failed`. A list is allowed if it contains the current strong
tag and no wildcard. After a successful edit, use the returned new tag. A race after
loading is detected by the atomic MongoDB `updatedAt` condition and returns 409
`concurrent_update`; a new replacement image is cleaned up on this conflict.

Web edits and deletions go through the same procedures with the same rules: the edit page puts
the version it showed into the edit and delete form actions (`?version=…`), and the procedure
treats it like `If-Match`. An old open form submitted after another edit has completed now gets
412 and a Swedish request to reload, instead of overwriting the newer version.

GET cache validation intentionally retains weak matching and wildcard support through
`If-None-Match`. Matching authorized reads return bodyless 304s. Review visibility is
checked before cache validation. JSON reads vary on `Authorization`; authenticated reads
are `private, no-cache`. Draft image responses are `private, no-store`; public images
retain immutable caching. Successful writes and problem responses use `no-store`.

`GET /images/{filename}?preview=card-v1|detail-v1` returns the same WebP previews (at most
768 or 1280 pixels wide) as the web `/images` route, through the same preview store and
generation limit. Visibility is checked before any preview is read or generated, also when
the preview is already on disk, and previews get the same cache headers as the original.
An unknown or repeated `preview` is `400 bad_request`; a full generation queue is
`503 service_unavailable` with `Retry-After: 1`. Originals stay available without the
parameter. Clients should not decode originals for lists: uploads from the web and Android
are not scaled down and reach tens of megapixels, which crashed the Android app.

The API door (`rpc/http.ts`) produces RFC 9457 `application/problem+json` with a stable `code`,
Swedish `detail`, and field `errors[].pointer`. It converts unexpected errors to generic 500
problems and unknown paths or methods below `/api` to 404 problems. Hook failures, framework
origin checks, and outer proxy/body limits can run before it and need not have the same format.

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

## oRPC procedures (spike)

The handlers in `src/routes/api/v1/**` were replaced by one oRPC router. The API door uses oRPC's
`OpenAPIHandler` (routing, path/query decoding, response encoding); the generator writes the YAML.
Custom code, each documented where it lives:

- **Lazy bodies** (`rpc/input.ts`). oRPC decodes the body before middleware; the contract needs
  authentication, IP admission and `If-Match` first. The door passes an unread `RequestBody` and
  the input schema reads it within the byte budget during input validation.
- **Problems, ETags, 304s** (`rpc/http.ts`). oRPC's error body has a different shape; the door
  renders problems and adds conditional-read headers for procedures marked `cache: 'revalidate'`.
- **Contract shaping** (`rpc/openapi.ts`, `rpc/schema-docs.ts`). Keeps component names, shared
  responses, nullable `type` arrays and the `allOf` wrappers that the Swift generator maps to
  `value1`/`value2`, so generated native code is unchanged.

`npm run api:diff` against `main` before this change reports, apart from 8 reworded descriptions,
only additive differences:

- `GET /reviews/{slug}/history` now has an `ETag` and answers `If-None-Match` with 304, like the
  other reads.

Other deliberate behavior changes, not visible in the YAML:

- The web edit and delete forms carry the displayed version (see above). A web POST without it
  gets 428 and a request to reload; a stale one 412.
- Unknown `/api/*` paths and unsupported methods return a 404 problem instead of SvelteKit's
  error page or 405; `HEAD` is answered for every `GET`.
- The web login form validates field lengths with the API schema (username at most 256 and
  password at most 1,024 characters); longer input is rejected with 400 before the quotas.

## Verification

Procedure tests (`rpc/procedures/*.test.ts`), the API door tests (`rpc/http.test.ts`) and the
input tests (`rpc/input.test.ts`) cover streaming byte limits, fail-fast schemas, large and malformed
base64, quota ordering and failures, bearer parsing, cache/edit validator separation, and
conditional-write image cleanup. `tests/api.test.ts` exercises HTTP contracts, bearer/cookie
isolation, denied writes without mutations, draft visibility, expiry/revocation, malformed
input quotas, stale/weak/wildcard edits, invalid authors/ratings/images, large image upload,
image previews and their access rules, and one-way publication.

Playwright's managed preview binds explicitly to `127.0.0.1` and overrides delivery with
the local mock webhook. Use a development/test MongoDB: fixtures temporarily reset quota
collections and restore them afterward. Do not point these tests at production or use
an external server configured with a real Discord webhook.

## Beer-brand price statistics

`GET /api/v1/statistics` also returns `beerBrandPrices`, an array of
`{ brand, averagePriceKr, reviewCount, happyHourReviewCount }`. Empty data returns `[]`.
It groups valid whole-kronor numeric prices (1–999) from active published/legacy reviews by the trimmed stored
brand, includes custom brands, excludes happy-hour prices, and omits blank brands. Entries are
ordered by average price, then Swedish brand name. Averages remain unrounded in the API;
the web page formats one decimal. Existing statistics cache invalidation and bearer/cache
policies remain in force. The web combines these results with `beerBrandValues` in one table,
showing separate price and volume-qualified sample counts and `–` when volume is unavailable.

The response shape is unchanged, but averages, sample counts and rankings now use only regular
prices. Reviews marked `isHappyHourPrice: true` still contribute to total reviews, Göteborg counts
and average ratings. `happyHourReviewCount` independently counts public active reviews with a valid
happy-hour price. The retained `happyHourPercentage` divides that count by all valid price entries
(regular plus happy hour), or returns null when no prices exist. Both brand arrays retain
`happyHourReviewCount` as zero for compatibility. A brand with only happy-hour prices has no brand
aggregate. Native screen layouts are unchanged and receive the updated calculations automatically.
