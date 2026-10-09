# AGENTS.md

Guidance for AI coding agents working in this repository.

## Required development approach

For changes to runtime behavior, use the repository's [secure-tdd skill](.agents/skills/secure-tdd/SKILL.md).
These requirements apply even when an agent does not support skill discovery:

- Use TDD for bug fixes, features, and security policy changes: write a meaningful regression,
  run it and confirm it fails for the intended reason, then implement the smallest correct
  change and refactor with tests passing. Missing dependencies or a broken test harness do
  not count as a red test. Documentation-only changes need no artificial tests.
- Think about trust boundaries before implementation: who can call the route, which
  credentials are accepted, what data they may access, and what work untrusted input can
  trigger. Enforce authorization before protected work and put limits before expensive
  parsing where applicable. Deny unknown/private states by default.
- Cover failure and abuse paths as well as success: anonymous/invalid credentials,
  cross-user access under the intended collaborative policy, private data, malformed and
  oversized input, exhausted quotas, dependency failure, and concurrent writes as relevant.
  Assert status/code and the absence of unauthorized side effects. Keep secrets out of logs.
- Use a development/test database and mocked external delivery. Never run destructive
  fixtures against production or send test submissions to a real Discord webhook. Avoid
  printing resolved Compose configuration or environment dumps containing secrets.
- Update contracts, documentation, and documented design decisions with behavior changes.
  Complete the verification below and report any check that could not run.

## Project

A collaborative bar review platform ("En stor stark"). SvelteKit + TypeScript, MongoDB, Lucia sessions, Argon2 password hashing, Tailwind CSS v4, deployed as a Node server via `adapter-node`. There is no public sign-up — users are pre-created (see below) and can then create/edit reviews. **All user-facing copy and validation messages are in Swedish**; match that when touching UI or form errors.

## Commands

Everyday development runs in Docker (no Node or `.env` needed); the `Makefile` wraps `docker-compose.dev.yml`:

- `make dev` — app + seeded MongoDB at http://localhost:5173 (hot reload; demo login `test` / `testpass123`)
- `make dev-down` / `make dev-reset` — stop / stop and wipe the database volume
- `make dev-reinstall` — rebuild after a `package.json` change (the `node_modules` volume is otherwise sticky)
- `make dev-shell`, `make dev-logs`, `make dev-test`, `make dev-create-user USERNAME=<name> PASSWORD=<pass>`
- `make dev-seed [COUNT=<n>] [FRESH=1]` — seed random demo bars; development only, and fresh mode deletes all existing bars
- `make dev-api-types` — regenerate `src/lib/types/api-v1.d.ts` from `openapi/v1.yaml` and lint the spec (native: `npm run api:types`, `npm run api:lint`)

Node-native scripts (require Node `^20.19.0 || >=22.12.0` and a `.env` with `MONGO_URI`; `engine-strict` is on):

- `npm run dev` / `npm run build` / `npm run preview`
- `npm test` — integration **then** unit; `npm run test:unit` (Vitest), `npm run test:integration` (Playwright)
- `npm run lint` — `prettier --check` + `eslint`; `npm run format` — Prettier write
- `npm run check` — `svelte-check` (run this to typecheck)
- `npm run db:all` — MongoDB in Docker, seeded (see `db/Makefile`); `npm run create-user <username> <password>`
- `npm run seed-bars -- [count] [--fresh]` — native development-only seeder; refuses production and requires an existing user

Run one unit test: `npm run test:unit -- --run src/lib/utils/slug.test.ts` or filter with `-t "<name>"`. Vitest picks up `src/**/*.{test,spec}.ts`, so unit tests live **next to the code they cover**; Playwright specs live in `tests/`.

## Verification

Before considering code work complete, run the relevant unit tests, `npm run check`, and `npm run lint`. Run `npm run test:integration` when a route, UI, authentication flow, or review workflow changes. In the Docker workflow, `make dev-test` runs the full unit suite; use `make dev-shell` to run the other npm checks in the app container.

For dependency changes, run both the complete `npm audit` and `npm audit --package-lock-only`,
including development dependencies (the runtime image contains the full tree). Resolve targeted
updates with `npx --yes --package npm@11.21.0 npm`; npm 10 can still install the committed
lockfile. Preserve native optional packages and refresh Docker dependencies with install
scripts enabled without deleting MongoDB data. Keep new lint rules enabled; justify any
local exceptions. See [dependency security](docs/dependency-security.md) for the scoped Kit
cookie and map-parser overrides, their removal conditions, the compatible TypeScript ESLint
minor, update workflow, and regression evidence. Check dependency engines against both
documented Node minima before selecting a new branch.

CI/deployment changes also require `npm run test:ci`, workflow syntax validation, and the disposable
Docker rehearsal `npm run test:deploy:restore`. Keep Vitest and its coverage provider aligned.
Coverage includes untested application TS/JS and must not decrease in any aggregate metric from
the exact main baseline. Do not weaken required checks, expose production secrets to PR jobs,
replace the tested deployment SHA with a newer unchecked commit, or touch production fixtures.
See [deployment automation](docs/deployment.md) for the restricted SSH helper and backup policy.

## Architecture

**Request lifecycle.** `src/hooks.server.ts` starts the Mongo connection once, validates the Lucia session (bearer-only for `/api/*`, cookie for web routes) into `event.locals.user` / `event.locals.session`, and sets security headers (nosniff, referrer-policy, `X-Frame-Options: DENY`, permissions-policy). The permissions policy allows same-origin geolocation for `/karta` while keeping camera and microphone disabled. The CSP lives separately in `svelte.config.js` (nonce mode, allowlists Google Analytics). SvelteKit `+page.server.ts` routes own authentication, request parsing, responses, and page-load queries; write workflows accept narrow dependencies composed in the routes and `server/reviews/production.ts`; hooks and server-only authentication, audit, and rate-limit helpers also access MongoDB. Client-side code and Svelte components must not access the DB directly.

**Database.** `src/lib/db/db.ts` holds the singleton `MongoClient` and the `enstorstark` database; it **throws at import if `MONGO_URI` is unset**. `start_mongo()` (called from hooks) creates the unique `bars.slug` index, the non-unique `bars.image` authorization lookup index, the unique `map_geocodes.addressKey` index, the `audit_logs` TTL index (90d), the compound `audit_logs` lookup index on `eventType`, `outcome`, and descending `createdAt`, and the `login_rate_limits` TTL index (30d). Collections are thin typed wrappers (`bars.ts`, `users.ts`, `map-geocodes.ts`). `db/init.js` seeds demo users and creates the bar and map-geocode indexes. The shared production Mongo image currently also runs it on a fresh volume; demo application accounts must be removed or replaced before exposure (see `db/README.md`).

**Rating system is metadata-driven.** `src/lib/review-metadata.ts` (`REVIEW_RATING_METRICS`) is the single source of truth for the 8 rating aspects (each 0–5, with Swedish label/description and a weight). `utils/ratings.ts` collapses the weighted sum into an overall `rating` of 0–3. This one array drives form fields, validation, and change-log diffs — **to add or rename an aspect, edit `REVIEW_RATING_METRICS` and `ReviewRatingKey` in `src/lib/types/bar-review.ts`**, not the individual routes.

**Review form pipeline.** `src/lib/server/reviews/` separates form parsing/validation (`form.ts`), authorship (`authorship.ts`), persistence mapping (`persistence.ts`), and history (`history.ts`, including `REVIEW_CHANGE_FIELD_SPECS`). `create.ts` and `edit.ts` expose workflows that return typed results; `response.ts` maps failures to SvelteKit. Shared problem types live in `src/lib/types/review-form.ts`, and text/slug primitives in `utils/review-text.ts` and `utils/slug.ts`. Both routes follow the same guarded sequence: auth check → audit `attempt` → parse `FormData` → validate → validate selected authors against the `users` collection (allowing existing credited names) → slug-collision check → image upload → insert/update → audit `success` → `throw redirect`. Duplicate slugs are caught both proactively and via Mongo error code `11000`. New form-created reviews are fully validated drafts; editing preserves their publication status and must never accept it from form data. Editing is intentionally collaborative: any authenticated user may edit any review; the form submits the full `authors` selection, with at least one required. The editor is selected by default but can opt out. A selected editor becomes the primary `author`; otherwise retain a selected existing primary, then fall back to the first selected name in checklist order (editor, existing credits, other users alphabetically). Store the remaining selections in `coAuthors`. Preserve submitted selections after validation errors, including an empty selection.

**Publication and visibility.** `src/lib/server/review-publication.ts` owns status normalization, the public Mongo filter, and the atomic draft-to-published update. `publicationStatus: 'draft'` is private; `'published'` and a missing status are public so legacy reviews need no migration. Public queries must match **exactly** published or missing status—never use a fail-open `$ne: 'draft'` filter. Anonymous home/search, detail, history, image access, `/karta`, and `/statistik` apply that filter before loading a document. Any authenticated user may view, edit, and publish any draft. Publication is a named detail-page POST action, uses only the sanitized route slug, is one-way, and preserves credited authors. It records the status change and publisher in `changeLog` and emits `review_publish` audit events identifying the publisher. Do not add separate publication timestamp/user fields: the change log and audit log provide that history. `server/review-statistics.ts` and `server/review-map.ts` cache public-only data in-process for 24 hours; invalidate the relevant cache after a successful publication or edit to a published review. Do not include drafts in either cache, even for authenticated visitors.

**Map data and geocoding.** `/karta` uses MapLibre GL JS with OpenFreeMap's keyless Liberty style, or its `dark` style while dark mode is active; the map swaps styles live on a theme change, which keeps the DOM-based review and location markers. The server-only `server/review-map.ts` composes one process-wide service from `server/map/`: address matching, Nominatim transport, geocode storage, marker loading, and coordination. Marker loading queries only `PUBLIC_REVIEW_FILTER` reviews, matches normalized addresses against persisted `map_geocodes`, and serializes only the fields the client needs. Include a review's valid `beerPriceKr` and `isHappyHourPrice` in its marker, but omit invalid prices without dropping the marker. Resolved coordinates are retained permanently; current-strategy `not_found` results retry after 30 days and temporary failures after one hour. Geocodes use strategy version 2: older negative entries may bypass their old `retryAt` once, but resolved entries must never be reconsidered. The 24-hour in-process marker-list cache rebuilds from MongoDB on expiry—it must never trigger a bulk Nominatim refresh. After the map becomes interactive, a signed-in editor can POST to `/karta/next-marker`, which resolves at most one uncached public address; anonymous visitors may view cached markers but must never trigger geocoding. The endpoint requires `locals.user` and checks the request origin. Draft creation or draft edits must not invalidate this cache.

Every address lookup first sends the exact saved address. Only after a zero-result response may strategy version 2 remove a supported standalone street-type word immediately before the final house number in the first comma segment. The fallback requests at most five address-layer results with address details and accepts only a strict road, house-number, locality, and supplied-postcode match. At most two requests are made per address attempt, and both go through the same process-wide single-flight Nominatim limiter with at least one second between requests. Transport or API failures remain `failed` and must not trigger the relaxed fallback. A successful lookup invalidates the map cache.

**Map client and location.** The map starts centered on Göteborg at zoom 12.5 and must never fit or recenter to review markers. On mount, `ReviewMap.svelte` starts browser `watchPosition` with `enableHighAccuracy: false`, `maximumAge: 15000`, and `timeout: 10000`; there is deliberately no fixed polling interval or location button. The first valid fix may center the camera once without changing zoom, bearing, or pitch, unless the visitor interacted with the map first. Subsequent fixes move only a pointer-transparent blue dot and accuracy circle. Never send current coordinates to the application backend, Nominatim, logs, analytics, cookies, or browser storage; OpenFreeMap still receives normal tile requests for the viewed area. Clear the watcher, location marker, and listeners when the component is destroyed, and keep permission and lookup errors non-blocking and in Swedish.

Review markers use a fixed 2-rem outer positioner for MapLibre's `transform`; it must not have a transform transition. Apply hover and selected transforms only to the inner button so markers cannot lag during map movement. A valid beer price is an always-visible, pointer-transparent label to the right of the button (`65 kr`, or `65 kr*` with a happy-hour tooltip/accessibility note). The button remains the only clickable and focusable element. Raise the positioner's stacking order for hover, focus, and selection, but do not let focus styling leave the price in its selected color after the preview closes. `ReviewMap.svelte` must import `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` and call `setWorkerUrl` before constructing the map; this makes Vite bundle the worker and its MapLibre dependencies, avoiding missing worker-module assets in development and production. Keep MapLibre CSS bundled locally and retain the OpenFreeMap and worker CSP allowances in `svelte.config.js`. Do not restore a resolved/total map counter: an invalid or unmatched address may legitimately never receive a marker.

**Images.** `src/lib/server/review-images.ts` accepts JPEG/PNG/WebP, verifying both MIME type and magic-byte signature, then re-encodes through `sharp` (strips EXIF, auto-rotates) and writes an `<ObjectId>.<ext>` file. Storage dir resolves to `REVIEW_IMAGE_DIR`, else `/app/uploads/images` in production, else `uploads/images` in dev (gitignored). Development uploads must stay outside `static`, or Vite can bypass route authorization. Files are served back through the `/images/[filename]` route, which re-validates the filename and authorizes it through its referencing review before reading from disk. Published and legacy images use public immutable caching; authenticated draft images use `private, no-store`; unreferenced and unauthorized filenames return 404.

**Security-sensitive helpers.** `server/audit.ts` records every sensitive action (outcomes: attempt/success/failure/denied/rate_limited) and **never throws** — audit failures are swallowed so they can't break a request. `server/rate-limit.ts` throttles logins per-IP and per-username using an atomic MongoDB aggregation-pipeline upsert (8 attempts / 15 min window/block). `server/request.ts` only trusts `x-forwarded-for` / `x-real-ip` when `TRUST_PROXY=true`. Login (`/login`) hashes even for unknown usernames to avoid timing leaks; credential verification lives in `server/login/credentials.ts`. Login and `scripts/create-user.js` share `server/login/policy.js`; the Docker runtime copies this dependency-free ESM module for the standalone script.

**RSS subscriptions.** `/feed.xml` is a public RSS 2.0 endpoint. `server/review-feed.ts` loads projected reviews using `PUBLIC_REVIEW_FILTER` for every visitor and builds the 50 latest announcements. Use the earliest `Utkast` → `Publicerad` change-log entry for the publication date; fall back to `createdAt` only when no publication history exists, and omit reviews without a valid date. Sort by publication date and then `_id`, both descending. GUIDs use the review's `_id` and must stay stable across edits and slug changes. XML must be escaped, and description text must also be encoded for readers that render HTML. The route owns five-minute HTTP caching, content-based ETags, conditional 304 responses, and Swedish `503` failures with `no-store`; do not add a process cache, subscriber storage, or publication fields. RSS anchors must use `data-sveltekit-reload` to bypass client routing and hover preloading through `[slug]`. Discovery lives in the global layout head and the Swedish FAQ. Feed rules have adjacent unit tests, HTTP behavior is tested beside the endpoint, and browser navigation/publication coverage uses the shared review fixtures.

**Theming.** Light/dark mode is driven entirely by CSS variables in `src/app.css`. Light is always the default; dark mode is opt-in through the navbar toggle (never the OS preference) and is remembered in the `theme` cookie. `hooks.server.ts` renders `<html data-theme="light|dark">` from that cookie (parsed by `src/lib/theme.ts`, which also owns the toggle and theme-change events) so the first paint never flashes. `color-scheme` selects the branch of each `light-dark()` palette override in `@theme static`. Keep using ordinary palette utilities (`bg-white/70`, `text-slate-600`, `bg-amber-100 text-amber-950`); `white` is the glass surface colour and the used palette families are remapped for dark mode. Do not hard-code colours in `<style>` blocks or arbitrary values. Use `var(--color-*)`, and `--color-glass-highlight` / `--color-glass-shadow` for glass shadows. Reach for the `dark:` variant only when markup must differ per theme. Adding a new palette family means adding its dark mapping in `app.css`.

## Deployment notes

- `docker-compose.yml` is **deployment only**: authenticated Mongo, no published ports, app on port 3000, attaches to an external `caddy_net` network. Local work uses `make dev`.
- The production `Dockerfile` build needs `MONGO_URI` present at build time (module-load side effect) but passes a non-secret placeholder build arg; real credentials arrive only as runtime env.
- `.npmrc` sets `ignore-scripts=true`. `argon2` and `sharp` are **native** modules — the Dockerfile re-enables install scripts (`npm config set ignore-scripts false`), and the dev compose file keeps a separate Linux-built `node_modules` volume shadowing the bind mount.

**Module boundaries and tests.** See [architecture and rule ownership](docs/architecture.md) for request flows and the rule-to-test index. Browser-facing contracts belong in `lib/types`, never in server modules. `server/async-cache.ts` owns cache generation, pending-read sharing, expiry, and rejection recovery; map geocoding separately returns no result while another attempt is active. `ReviewForm` composes `components/review-form` controls; `ReviewMap` delegates marker and geolocation lifetimes to `components/review-map`. Keep native form fields, error focus, object-URL cleanup, and browser-location disposal intact.

**Native client API.** `/api/v1` serves the Skip (iOS/Android) client. The web app is the primary client. `mobile/` is best effort: do not update, build, or fix it for web changes, and a broken mobile app never blocks work (it needs Xcode/Android tooling that most contributors do not have). The `/api/v1` server code is part of the web backend and must stay correct: when you add, rename, or remove a review field, or change a workflow or rule that the API exposes, update `openapi/v1.yaml`, the API mappers (`server/api/reviews.ts` for responses, `server/api/review-input.ts` for requests, `server/api/metadata.ts` for form options), and the API tests in the same change. An unmapped field is silently reset by API edits. Breaking API changes are permitted; record them in `docs/api.md`. `openapi/v1.yaml` is the contract: update it first, run `npm run api:types` (generated `src/lib/types/api-v1.d.ts`, never edit by hand) and `npm run api:lint`. `contract.test.ts` checks routes against the contract. API routes authenticate only with bearer tokens (never the cookie), accept only JSON, reuse the web workflows, and return `application/problem+json` with a stable `code`. Review PUTs require an explicit current strong `If-Match` tag: missing is 428, stale/weak-only/wildcard is 412; GET `If-None-Match` retains weak/wildcard matching. Web and API persistence use atomic `updatedAt` checks and return 409 if a parallel write wins, but web forms do not yet carry the originally displayed version. Request body budgets live in OpenAPI `x-max-body-bytes`: 16 KiB sessions/review requests, 22 MiB authenticated review writes; count actual streamed bytes and return 413 before JSON parsing. Structural schema validation stops at the first error. Anonymous API routes consume the shared IP quota before parsing; pass server-owned IP admission into workflows to avoid double charging, and never accept it from request input. Base64 validation must use constant stack space and preserve the 15 MiB decoded limit. See `docs/api.md` for design decisions and compatibility.

**Review requests.** `server/review-requests` separates validation, delivery, policy, and submission. The `/about` route checks origin and parses input before invoking the workflow, then maps its result and retry delay to HTTP. Login and review-request rate limiters deliberately retain different policies. Playwright runs with one worker; publication, authorship, and map specs share `tests/fixtures/reviews.ts`, with browser helpers in `tests/fixtures/browser.ts`. Unit image coverage lives beside `review-images.ts`.

## Conventions

Prettier: tabs, single quotes, no trailing commas, `printWidth` 100, LF. Follow existing Svelte 5 rune and Tailwind CSS v4 patterns. Server logic belongs in `src/lib/server/*` (unit-tested in isolation); routes stay thin orchestration.
