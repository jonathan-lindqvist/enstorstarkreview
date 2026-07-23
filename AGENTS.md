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

Node-native scripts (require Node `^20.19.0 || >=22.12.0` and a `.env` with `MONGO_URI`; `engine-strict` is on):

- `npm run dev` / `npm run build` / `npm run preview`
- `npm test` — integration **then** unit; `npm run test:unit` (Vitest), `npm run test:integration` (Playwright)
- `npm run lint` — `prettier --check` + `eslint`; `npm run format` — Prettier write
- `npm run check` — `svelte-check` (run this to typecheck)
- `npm run db:all` — MongoDB in Docker, seeded (see `db/Makefile`); `npm run create-user <username> <password>`

Run one unit test: `npm run test:unit -- --run src/lib/utils/slug.test.ts` or filter with `-t "<name>"`. Vitest picks up `src/**/*.{test,spec}.ts`, so unit tests live **next to the code they cover**; Playwright specs live in `tests/`.

## Verification

Before considering code work complete, run the relevant unit tests, `npm run check`, and `npm run lint`. Run `npm run test:integration` when a route, UI, authentication flow, or review workflow changes. In the Docker workflow, `make dev-test` runs the full unit suite; use `make dev-shell` to run the other npm checks in the app container.

## Architecture

**Request lifecycle.** `src/hooks.server.ts` starts the Mongo connection once, validates the Lucia session cookie on every request into `event.locals.user` / `event.locals.session`, and sets security headers (nosniff, referrer-policy, `X-Frame-Options: DENY`, permissions-policy). The CSP lives separately in `svelte.config.js` (nonce mode, allowlists Google Analytics). SvelteKit `+page.server.ts` `load`/`actions` own route-level DB access; hooks and server-only authentication, audit, and rate-limit helpers also access MongoDB. Client-side code and Svelte components must not access the DB directly.

**Database.** `src/lib/db/db.ts` holds the singleton `MongoClient` and the `enstorstark` database; it **throws at import if `MONGO_URI` is unset**. `start_mongo()` (called from hooks) creates the unique `bars.slug` index, the `audit_logs` TTL index (90d), the compound `audit_logs` lookup index on `eventType`, `outcome`, and descending `createdAt`, and the `login_rate_limits` TTL index (30d). Collections are thin typed wrappers (`bars.ts`, `users.ts`). `db/init.js` seeds demo users and the slug index for the **dev** container only.

**Rating system is metadata-driven.** `src/lib/review-metadata.ts` (`REVIEW_RATING_METRICS`) is the single source of truth for the 8 rating aspects (each 0–5, with Swedish label/description and a weight). `utils/ratings.ts` collapses the weighted sum into an overall `rating` of 0–3. This one array drives form fields, validation, and change-log diffs — **to add or rename an aspect, edit `REVIEW_RATING_METRICS` and the `BarReview` / `BarReviewFormData` types in `src/lib/types/bar-review.ts`**, not the individual routes.

**Review form pipeline.** `src/lib/server/review-form.ts` is shared by the create route (`/admin/reviews/create`) and edit route (`/[slug]/edit`). It sanitizes input (strips control chars; plain/long/slug variants), validates via composable validator arrays (`base` → `detail` → `rating`, order configurable per route), maps form fields to persistence fields, and computes the `changeLog` diff on edits (`REVIEW_CHANGE_FIELD_SPECS`). Both routes follow the same guarded sequence: auth check → audit `attempt` → parse `FormData` → validate → validate co-authors against the `users` collection → slug-collision check → image upload → insert/update → audit `success` → `throw redirect`. Duplicate slugs are caught both proactively and via Mongo error code `11000`. Editing is intentionally collaborative: any authenticated user may edit any review; the editor becomes the primary `author`, and the previous primary author is retained in `coAuthors`.

**Images.** `src/lib/server/review-images.ts` accepts JPEG/PNG/WebP, verifying both MIME type and magic-byte signature, then re-encodes through `sharp` (strips EXIF, auto-rotates) and writes an `<ObjectId>.<ext>` file. Storage dir resolves to `REVIEW_IMAGE_DIR`, else `/app/uploads/images` in production, else `static/images` in dev (gitignored). Files are served back through the `/images/[filename]` route, which re-validates the filename against a strict pattern before reading from disk.

**Security-sensitive helpers.** `server/audit.ts` records every sensitive action (outcomes: attempt/success/failure/denied/rate_limited) and **never throws** — audit failures are swallowed so they can't break a request. `server/rate-limit.ts` throttles logins per-IP and per-username using an atomic MongoDB aggregation-pipeline upsert (8 attempts / 15 min window/block). `server/request.ts` only trusts `x-forwarded-for` / `x-real-ip` when `TRUST_PROXY=true`. Login (`/login`) hashes even for unknown usernames to avoid timing leaks; Argon2 parameters must stay in sync between `login/+page.server.ts` and `scripts/create-user.js`.

## Deployment notes

- `docker-compose.yml` is **deployment only**: authenticated Mongo, no published ports, app on port 3000, attaches to an external `caddy_net` network. Local work uses `make dev`.
- The production `Dockerfile` build needs `MONGO_URI` present at build time (module-load side effect) but passes a non-secret placeholder build arg; real credentials arrive only as runtime env.
- `.npmrc` sets `ignore-scripts=true`. `argon2` and `sharp` are **native** modules — the Dockerfile re-enables install scripts (`npm config set ignore-scripts false`), and the dev compose file keeps a separate Linux-built `node_modules` volume shadowing the bind mount.

## Conventions

Prettier: tabs, single quotes, no trailing commas, `printWidth` 100, LF. Follow existing Svelte 5 rune and Tailwind CSS v4 patterns. Server logic belongs in `src/lib/server/*` (unit-tested in isolation); routes stay thin orchestration.
