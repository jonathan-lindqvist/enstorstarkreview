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

For design or UI work (layout, typography, colour, motion, copy, or new pages), read
[DESIGN.md](DESIGN.md) first and follow it. For other areas, see the [topic guides](#topic-guides).

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

Before considering code work complete, run the relevant unit tests, `npm run check`, and `npm run lint`. Run `npm run test:integration` when a route, UI, authentication flow, or review workflow changes. In the Docker workflow, `make dev-test` runs the full unit suite; use `make dev-shell` to run the other npm checks in the app container. For dependency, CI, or deployment changes, also follow [Dependencies, CI, and deployment](docs/agents/dependencies-and-deployment.md).

## Architecture

**Request lifecycle.** `src/hooks.server.ts` starts the Mongo connection once, validates the Lucia session (bearer-only for `/api/*`, cookie for web routes) into `event.locals.user` / `event.locals.session`, and sets security headers (nosniff, referrer-policy, `X-Frame-Options: DENY`, permissions-policy). The permissions policy allows same-origin geolocation for home, detail, and map pages while keeping camera and microphone disabled. The CSP lives separately in `svelte.config.js` (nonce mode, allowlists Google Analytics). SvelteKit `+page.server.ts` routes own authentication, request parsing, responses, and page-load queries; write workflows accept narrow dependencies composed in the routes and `server/reviews/production.ts`; hooks and server-only authentication, audit, and rate-limit helpers also access MongoDB. Client-side code and Svelte components must not access the DB directly.

**Database.** `src/lib/db/db.ts` holds the singleton `MongoClient` and the `enstorstark` database; it **throws at import if `MONGO_URI` is unset**. `start_mongo()` (called from hooks) creates the unique `bars.slug` index, the non-unique `bars.image` authorization lookup index, the unique `map_geocodes.addressKey` index, the `audit_logs` TTL index (90d), the compound `audit_logs` lookup index on `eventType`, `outcome`, and descending `createdAt`, and the `login_rate_limits` TTL index (30d). Collections are thin typed wrappers (`bars.ts`, `users.ts`, `map-geocodes.ts`). `db/init.js` seeds demo users and creates the bar and map-geocode indexes. The shared production Mongo image currently also runs it on a fresh volume; demo application accounts must be removed or replaced before exposure (see `db/README.md`).

**Module boundaries and tests.** See [architecture and rule ownership](docs/architecture.md) for request flows and the rule-to-test index. Browser-facing contracts belong in `lib/types`, never in server modules. `server/async-cache.ts` owns cache generation, pending-read sharing, expiry, and rejection recovery; map geocoding separately returns no result while another attempt is active. `ReviewForm` composes `components/review-form` controls; `ReviewMap` delegates marker and geolocation lifetimes to `components/review-map`. Keep native form fields, error focus, object-URL cleanup, and browser-location disposal intact.

## Topic guides

Read the guide for the area you are changing before you start:

- [DESIGN.md](DESIGN.md) — design and UI work, including theming and dark mode
- [Reviews](docs/agents/reviews.md) — ratings, the review form, publication and visibility, RSS, review requests
- [Map](docs/agents/map.md) — `/karta`, geocoding, distance sorting, and the map client
- [Security](docs/agents/security.md) — audit logging, rate limits, login, and images
- [Native client API](docs/agents/api.md) — `/api/v1` and its OpenAPI contract
- [Dependencies, CI, and deployment](docs/agents/dependencies-and-deployment.md) — dependency updates, CI/deployment checks, Docker notes

## Conventions

Prettier: tabs, single quotes, no trailing commas, `printWidth` 100, LF. Follow existing Svelte 5 rune and Tailwind CSS v4 patterns. Server logic belongs in `src/lib/server/*` (unit-tested in isolation); routes stay thin orchestration.
