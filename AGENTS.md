# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

A collaborative bar review platform ("En stor stark"). SvelteKit + TypeScript, MongoDB, Lucia sessions, Argon2 password hashing, Tailwind CSS v4, deployed as a Node server via `adapter-node`. There is no public sign-up — users are pre-created (see below) and can then create/edit reviews. **All user-facing copy and validation messages are in Swedish**; match that when touching UI or form errors.

## Commands

Everyday development runs in Docker (no Node or `.env` needed); the `Makefile` wraps `docker-compose.dev.yml`:

- `make dev` — app + seeded MongoDB at http://localhost:5173 (hot reload; demo login `test` / `testpass123`)
- `make dev-down` / `make dev-reset` — stop / stop and wipe the database volume
- `make dev-reinstall` — rebuild after a `package.json` change (the `node_modules` volume is otherwise sticky)
- `make dev-shell`, `make dev-logs`, `make dev-test`, `make dev-create-user USERNAME=<name> PASSWORD=<pass>`
- `make dev-seed [COUNT=<n>] [FRESH=1]` — seed random demo bars; development only, and fresh mode deletes all existing bars

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

## Architecture

**Request lifecycle.** `src/hooks.server.ts` starts the Mongo connection once, validates the Lucia session cookie on every request into `event.locals.user` / `event.locals.session`, and sets security headers (nosniff, referrer-policy, `X-Frame-Options: DENY`, permissions-policy). The permissions policy allows same-origin geolocation for `/karta` while keeping camera and microphone disabled. The CSP lives separately in `svelte.config.js` (nonce mode, allowlists Google Analytics). SvelteKit `+page.server.ts` `load`/`actions` own route-level DB access; hooks and server-only authentication, audit, and rate-limit helpers also access MongoDB. Client-side code and Svelte components must not access the DB directly.

**Database.** `src/lib/db/db.ts` holds the singleton `MongoClient` and the `enstorstark` database; it **throws at import if `MONGO_URI` is unset**. `start_mongo()` (called from hooks) creates the unique `bars.slug` index, the non-unique `bars.image` authorization lookup index, the unique `map_geocodes.addressKey` index, the `audit_logs` TTL index (90d), the compound `audit_logs` lookup index on `eventType`, `outcome`, and descending `createdAt`, and the `login_rate_limits` TTL index (30d). Collections are thin typed wrappers (`bars.ts`, `users.ts`, `map-geocodes.ts`). `db/init.js` seeds demo users and creates the bar and map-geocode indexes for the **dev** container too.

**Rating system is metadata-driven.** `src/lib/review-metadata.ts` (`REVIEW_RATING_METRICS`) is the single source of truth for the 8 rating aspects (each 0–5, with Swedish label/description and a weight). `utils/ratings.ts` collapses the weighted sum into an overall `rating` of 0–3. This one array drives form fields, validation, and change-log diffs — **to add or rename an aspect, edit `REVIEW_RATING_METRICS` and the `BarReview` / `BarReviewFormData` types in `src/lib/types/bar-review.ts`**, not the individual routes.

**Review form pipeline.** `src/lib/server/review-form.ts` is shared by the create route (`/admin/reviews/create`) and edit route (`/[slug]/edit`). It sanitizes input (strips control chars; plain/long/slug variants), validates via composable validator arrays (`base` → `detail` → `rating`, order configurable per route), maps form fields to persistence fields, and computes the `changeLog` diff on edits (`REVIEW_CHANGE_FIELD_SPECS`). Both routes follow the same guarded sequence: auth check → audit `attempt` → parse `FormData` → validate → validate co-authors against the `users` collection → slug-collision check → image upload → insert/update → audit `success` → `throw redirect`. Duplicate slugs are caught both proactively and via Mongo error code `11000`. New form-created reviews are fully validated drafts; editing preserves their publication status and must never accept it from form data. Editing is intentionally collaborative: any authenticated user may edit any review; the editor becomes the primary `author`, and the previous primary author is retained in `coAuthors`.

**Publication and visibility.** `src/lib/server/review-publication.ts` owns status normalization, the public Mongo filter, authorship transitions, and the atomic draft-to-published update. `publicationStatus: 'draft'` is private; `'published'` and a missing status are public so legacy reviews need no migration. Public queries must match **exactly** published or missing status—never use a fail-open `$ne: 'draft'` filter. Anonymous home/search, detail, history, image access, `/karta`, and `/statistik` apply that filter before loading a document. Any authenticated user may view, edit, and publish any draft. Publication is a named detail-page POST action, uses only the sanitized route slug, is one-way, and makes the publisher primary author while retaining the prior author as a co-author. It records status/authorship changes in `changeLog` and emits `review_publish` audit events. Do not add separate publication timestamp/user fields: the change log and audit log provide that history. `server/review-statistics.ts` and `server/review-map.ts` cache public-only data in-process for 24 hours; invalidate the relevant cache after a successful publication or edit to a published review. Do not include drafts in either cache, even for authenticated visitors.

**Map data and geocoding.** `/karta` uses MapLibre GL JS with OpenFreeMap's keyless Liberty style. The server-only `server/review-map.ts` loads only `PUBLIC_REVIEW_FILTER` reviews, matches normalized addresses against persisted `map_geocodes`, and serializes only the fields the client needs. Include a review's valid `beerPriceKr` and `isHappyHourPrice` in its marker, but omit invalid prices without dropping the marker. Resolved coordinates are retained permanently; current-strategy `not_found` results retry after 30 days and temporary failures after one hour. Geocodes use strategy version 2: older negative entries may bypass their old `retryAt` once, but resolved entries must never be reconsidered. The 24-hour in-process marker-list cache rebuilds from MongoDB on expiry—it must never trigger a bulk Nominatim refresh. After the map becomes interactive, a signed-in editor can POST to `/karta/next-marker`, which resolves at most one uncached public address; anonymous visitors may view cached markers but must never trigger geocoding. The endpoint requires `locals.user` and checks the request origin. Draft creation or draft edits must not invalidate this cache.

Every address lookup first sends the exact saved address. Only after a zero-result response may strategy version 2 remove a supported standalone street-type word immediately before the final house number in the first comma segment. The fallback requests at most five address-layer results with address details and accepts only a strict road, house-number, locality, and supplied-postcode match. At most two requests are made per address attempt, and both go through the same process-wide single-flight Nominatim limiter with at least one second between requests. Transport or API failures remain `failed` and must not trigger the relaxed fallback. A successful lookup invalidates the map cache.

**Map client and location.** The map starts centered on Göteborg at zoom 12.5 and must never fit or recenter to review markers. On mount, `ReviewMap.svelte` starts browser `watchPosition` with `enableHighAccuracy: false`, `maximumAge: 15000`, and `timeout: 10000`; there is deliberately no fixed polling interval or location button. The first valid fix may center the camera once without changing zoom, bearing, or pitch, unless the visitor interacted with the map first. Subsequent fixes move only a pointer-transparent blue dot and accuracy circle. Never send current coordinates to the application backend, Nominatim, logs, analytics, cookies, or browser storage; OpenFreeMap still receives normal tile requests for the viewed area. Clear the watcher, location marker, and listeners when the component is destroyed, and keep permission and lookup errors non-blocking and in Swedish.

Review markers use a fixed 2-rem outer positioner for MapLibre's `transform`; it must not have a transform transition. Apply hover and selected transforms only to the inner button so markers cannot lag during map movement. A valid beer price is an always-visible, pointer-transparent label to the right of the button (`65 kr`, or `65 kr*` with a happy-hour tooltip/accessibility note). The button remains the only clickable and focusable element. Raise the positioner's stacking order for hover, focus, and selection, but do not let focus styling leave the price in its selected color after the preview closes. `ReviewMap.svelte` must import `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` and call `setWorkerUrl` before constructing the map; this makes Vite bundle the worker and its MapLibre dependencies, avoiding missing worker-module assets in development and production. Keep MapLibre CSS bundled locally and retain the OpenFreeMap and worker CSP allowances in `svelte.config.js`. Do not restore a resolved/total map counter: an invalid or unmatched address may legitimately never receive a marker.

**Images.** `src/lib/server/review-images.ts` accepts JPEG/PNG/WebP, verifying both MIME type and magic-byte signature, then re-encodes through `sharp` (strips EXIF, auto-rotates) and writes an `<ObjectId>.<ext>` file. Storage dir resolves to `REVIEW_IMAGE_DIR`, else `/app/uploads/images` in production, else `uploads/images` in dev (gitignored). Development uploads must stay outside `static`, or Vite can bypass route authorization. Files are served back through the `/images/[filename]` route, which re-validates the filename and authorizes it through its referencing review before reading from disk. Published and legacy images use public immutable caching; authenticated draft images use `private, no-store`; unreferenced and unauthorized filenames return 404.

**Security-sensitive helpers.** `server/audit.ts` records every sensitive action (outcomes: attempt/success/failure/denied/rate_limited) and **never throws** — audit failures are swallowed so they can't break a request. `server/rate-limit.ts` throttles logins per-IP and per-username using an atomic MongoDB aggregation-pipeline upsert (8 attempts / 15 min window/block). `server/request.ts` only trusts `x-forwarded-for` / `x-real-ip` when `TRUST_PROXY=true`. Login (`/login`) hashes even for unknown usernames to avoid timing leaks; Argon2 parameters must stay in sync between `login/+page.server.ts` and `scripts/create-user.js`.

## Deployment notes

- `docker-compose.yml` is **deployment only**: authenticated Mongo, no published ports, app on port 3000, attaches to an external `caddy_net` network. Local work uses `make dev`.
- The production `Dockerfile` build needs `MONGO_URI` present at build time (module-load side effect) but passes a non-secret placeholder build arg; real credentials arrive only as runtime env.
- `.npmrc` sets `ignore-scripts=true`. `argon2` and `sharp` are **native** modules — the Dockerfile re-enables install scripts (`npm config set ignore-scripts false`), and the dev compose file keeps a separate Linux-built `node_modules` volume shadowing the bind mount.

## Conventions

Prettier: tabs, single quotes, no trailing commas, `printWidth` 100, LF. Follow existing Svelte 5 rune and Tailwind CSS v4 patterns. Server logic belongs in `src/lib/server/*` (unit-tested in isolation); routes stay thin orchestration.
