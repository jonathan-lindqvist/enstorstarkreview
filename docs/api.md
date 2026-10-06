# Native client API

The JSON API for the native iOS and Android clients lives in the same SvelteKit app under
`/api/v1`. [openapi/v1.yaml](../openapi/v1.yaml) is the contract and the source of truth.

The web app is the primary client. The native apps in `mobile/` are best effort: web changes do
not need to update, build or test them. The API itself is server code and must stay correct.

## Contract workflow

1. Edit `openapi/v1.yaml`.
2. Run `npm run api:types` to regenerate `src/lib/types/api-v1.d.ts`, and `npm run api:lint`.
3. Implement the route in `src/routes/api/v1/`. Request bodies are validated at runtime
   against the contract schemas (`readJsonBody` in `server/api/http.ts`), and responses are
   typed with the generated `ApiSchemas`.

`src/lib/server/api/contract.test.ts` fails when a route and the contract disagree, or when the
generated types are stale. Native clients generate their clients from the same file.

## Rules

- **Authentication.** `POST /sessions` returns a Lucia session ID as a bearer token (30-day
  sliding expiry). `hooks.server.ts` reads only `Authorization: Bearer` for `/api/*` and never
  reads or sets the session cookie there. So browser pages cannot make credentialed API calls,
  and the SvelteKit CSRF origin check is not needed. Login uses the same workflow, rate limits
  and audit events as `/login` (`server/login/login.ts`), with `details.channel: 'api'`.
- **JSON only.** Request bodies must be `application/json`. Form content types would meet the
  SvelteKit CSRF check in production builds (not in `vite dev`).
- **Shared workflows.** Create, edit, publish, image reads and review requests call the same
  workflows as the web routes. `server/api/review-input.ts` converts a validated JSON body to the
  workflow's form fields, so sanitization, authorship, slug, image and audit rules stay in one
  place. Workflow problems carry an optional `code` that the API maps to an HTTP status.
  `toReviewFormData` sets each form field explicitly, so a new review field needs an explicit
  mapping there; otherwise an API edit resets the field. Optional request fields that an edit
  omits (`image`, `attributes`) keep their stored values.
- **Errors** are RFC 9457 `application/problem+json` with a stable `code`, a Swedish `detail`, and
  `errors[].pointer` into the request body.
- **Versions.** A review's `ETag` comes from `updatedAt`. `PUT /reviews/{slug}` requires
  `If-Match` (428 without it, 412 when stale). All edits, including the web form, use a
  conditional write on `updatedAt` and return 409 `concurrent_update` when a parallel edit wins.
- **Visibility** is the same as on the web: anonymous clients see only published reviews; drafts
  and draft images need a token. Public GET responses have an `ETag` for `If-None-Match`.
- **Images** are base64 in JSON, at most 15 MB decoded, so the body stays below production's
  30 MB `BODY_SIZE_LIMIT`. Clients convert HEIC to JPEG and downscale before upload.
- **Map.** Only signed-in clients may call `POST /map/geocoding`. Clients never send the device
  location. The marker list has no resolved/total counter.

## Local integration tests

`vite preview` can listen only on `[::1]` on some machines, while `playwright.config.ts` uses
`127.0.0.1`. If every spec gets "connection refused", start the servers on `127.0.0.1` yourself
and set `PLAYWRIGHT_TEST_BASE_URL=http://127.0.0.1:4173` (the delivery spec then skips itself).
Playwright 1.57 browser downloads hung on Node 26 during development; Node 24 works.
