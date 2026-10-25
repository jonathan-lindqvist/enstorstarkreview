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

A collaborative bar review platform ("En stor stark"). SvelteKit + TypeScript, Effect 4 on the server, MongoDB, Lucia sessions, Argon2 password hashing, Tailwind CSS v4, deployed as a Node server via `adapter-node`. There is no public sign-up — users are pre-created (see below) and can then create/edit reviews. **All user-facing copy and validation messages are in Swedish**; match that when touching UI or form errors.

## Commands

Everyday development runs in Docker (no Node or `.env` needed); the `Makefile` wraps `docker-compose.dev.yml`, and `docker-compose.ci.yml` for `make check` and `make ci`:

- `make dev` — app + seeded MongoDB at http://localhost:5173 (hot reload; demo login `test` / `testpass123`)
- `make dev-down` / `make dev-reset` — stop / stop and wipe the database volume
- `make dev-rebuild` — rebuild the images and dependencies after a `package.json`, `Dockerfile.dev`, or `db/` change; `make dev` reuses existing images, and the `node_modules` volume is otherwise sticky
- `docker compose -f docker-compose.dev.yml exec app <command>` — run any npm script below in the running app container, e.g. `npm run test:unit -- --run`, `npm run create-user <username> <password>`, `npm run seed-bars -- [count] [--fresh]`, or `npm run api:generate && npm run api:lint`; `bash` opens a shell
- `make check` — the fast CI checks in a disposable container, in about a minute: formatting, lint, types, OpenAPI lint, CI/deploy script tests, shellcheck, and unit tests with the coverage floor
- `make ci` — every CI check, exactly as GitHub Actions runs it: `make check` plus the backup/restore rehearsal and Playwright against a seeded MongoDB. Both check the working tree as Git sees it, write reports to `ci-output/`, and end with a pass/fail summary per check

Node-native scripts (require Node `^20.19.0 || >=22.12.0` and a `.env` with `MONGO_URI`; `engine-strict` is on):

- `npm run dev` / `npm run build` / `npm run preview`
- `npm test` — integration **then** unit; `npm run test:unit` (Vitest), `npm run test:integration` (Playwright)
- `npm run lint` — `prettier --check` + `eslint`; `npm run format` — Prettier write
- `npm run check` — `svelte-check` (run this to typecheck)
- `npm run db:all` — MongoDB in Docker, seeded (see `db/Makefile`); `npm run create-user <username> <password>`
- `npm run seed-bars -- [count] [--fresh]` — native development-only seeder; refuses production and requires an existing user

Run one unit test: `npm run test:unit -- --run src/lib/utils/slug.test.ts` or filter with `-t "<name>"`. Vitest picks up `src/**/*.{test,spec}.ts`, so unit tests live **next to the code they cover**; Playwright specs live in `tests/`.

## Verification

Before considering code work complete, run the relevant unit tests, `npm run check`, and `npm run lint`. Run `npm run test:integration` when a route, UI, authentication flow, or review workflow changes. In the Docker workflow, run the npm checks in the app container with `docker compose -f docker-compose.dev.yml exec app <command>`. `make check` runs the fast CI checks at once and `make ci` all of them. For dependency, CI, or deployment changes, also follow [Dependencies, CI, and deployment](docs/agents/dependencies-and-deployment.md).

## Architecture

**Request lifecycle.** `src/hooks.server.ts` builds the shared Effect runtime at boot (which connects to MongoDB), validates the Lucia cookie session for web routes into `event.locals.user` / `event.locals.session`, and sets security headers (nosniff, referrer-policy, `X-Frame-Options: DENY`, permissions-policy). It skips `/api/*`: the API authenticates bearer tokens only, in the `HttpApi` middlewares. The permissions policy allows same-origin geolocation for home, detail, and map pages while keeping camera and microphone disabled. The CSP lives separately in `svelte.config.js` (nonce mode, allowlists Google Analytics). SvelteKit `+page.server.ts` routes own authentication, request parsing, and responses; they run Effect workflows and reads through `runWeb` / `runWebAsUser` (`server/web.ts`) on the shared runtime. Client-side code and Svelte components must not access the server or the DB directly.

**Effect services and layers.** Server code is written with Effect 4 (`effect` pinned exactly). Workflows are `Effect.fn` programs that read `CurrentUser` / `RequestContext` / `Viewer` and services (`ReviewStore`, `UserStore`, `ReviewImages`, `AuditLog`, `PublicReviewViews`, quotas, `Sessions`, `ReviewMap`, `ReviewStatistics`, `Geocoder`, `ReviewRequestDelivery`), and fail with `Schema.TaggedError`s from `server/errors.ts` that carry `httpApiStatus` and a Swedish message. Every service has a production `layer`; `server/platform/layers.ts` composes them and `server/platform/runtime.ts` makes the one `ManagedRuntime`, shared with the API through a memo map. Environment variables are read once through `Config` in `server/platform/config.ts` (secrets stay `Redacted`). Routes map typed errors with `failWith` / `failReviewFormWith` (to `fail()`, 422 becomes 400 on forms) and `runWeb` (to `error()`). Tests use test layers from `server/testing.ts` (`runWorkflow`, `useTestApp`, `makeTestAppLayer`, `Mongo.layerTest`), not large `vi.mock` setups. Use `Cache` (`server/cache.ts`) for process caches, `acquireRelease`/scopes for cleanup, and timeouts on external calls.

**Database.** `server/platform/mongo.ts` is the `Mongo` service: the singleton `MongoClient` (closed with the runtime), the `enstorstark` database, and typed collections. A missing `MONGO_URI` fails the runtime build. At boot it creates the unique `bars.slug` index, the non-unique `bars.image` authorization lookup index, the unique `map_geocodes.addressKey` index, the `audit_logs` TTL index (90d), the compound `audit_logs` lookup index on `eventType`, `outcome`, and descending `createdAt`, the `login_rate_limits` TTL index (30d), and the `review_request_rate_limits` TTL index (48h). Driver calls go through `tryMongo`, which turns failures into `MongoError` (log the cause, never return it). `db/init.js` creates only the bar and map-geocode indexes. The default/production Mongo image creates no application users; provision them with `docker compose exec app npm run create-user <username> <password>`. Development and CI explicitly use the `development` image target, which adds `db/seed-dev-users.js` for demo accounts. Existing volumes and accounts remain unchanged (see `db/README.md`). Initialization regressions live in `db/init.test.js` and run with `npm run test:ci`.

**Module boundaries and tests.** See [architecture and rule ownership](docs/architecture.md) for request flows and the rule-to-test index. Browser-facing contracts belong in `lib/types`, never in server modules. `server/cache.ts` owns pending-read sharing, expiry, invalidation, and failure recovery for process caches; map geocoding separately returns no result while another attempt is active. `ReviewForm` composes `components/review-form` controls; `ReviewMap` delegates marker and geolocation lifetimes to `components/review-map`. Keep native form fields, error focus, object-URL cleanup, and browser-location disposal intact.

**Visitor settings.** `/installningar` is public and saves browser preferences immediately.
`lib/preferences.ts` owns location/analytics cookies and browser notifications; `lib/theme.ts`
owns theme changes. Enforce location preferences in `client/user-location.ts`, including explicit
review-form requests. Keep coordinates in memory only. Analytics consent is shared by the banner
and settings, with limited Consent Mode measurement when declined and advertising always denied.

## Every server feature ships with its API endpoint

The web app and the native apps must be able to do the same things. When you add or change a server
feature (a workflow, a read, a rule), add or change its `/api/v1` endpoint in the same change:

1. Write the domain logic once, as an Effect workflow or read in `src/lib/server/**`, failing with
   tagged errors from `server/errors.ts`.
2. Declare the endpoint in `server/api/contract/api.ts` (schemas in `contract/schemas.ts`) and
   implement it in `server/api/handlers.ts` by running that workflow. Do not add per-endpoint
   `+server.ts` files; `src/routes/api/[...path]/+server.ts` serves the whole `HttpApi`.
3. Call the same workflow from the web load or action through `runWeb` / `runWebAsUser`.
4. Run `npm run api:generate` and `npm run api:lint`, and review the `openapi/v1.yaml` diff.
5. Test the workflow with `runWorkflow`, the endpoint with `makeApiHandler(makeTestAppLayer(...))`,
   and the web door with `useTestApp`, including denied, invalid, and failure paths.

Web-only presentation (HTML pages, RSS, sitemap, the homepage batch endpoint) needs no API
endpoint. Say so in the change description when a feature is deliberately web-only.

## Topic guides

Read the guide for the area you are changing before you start:

- [DESIGN.md](DESIGN.md) — design and UI work, including theming and dark mode
- [Reviews](docs/agents/reviews.md) — ratings, the review form, publication and visibility, RSS, review requests
- [Map](docs/agents/map.md) — `/karta`, geocoding, distance sorting, and the map client
- [Security](docs/agents/security.md) — audit logging, rate limits, login, and images
- [Native client API](docs/agents/api.md) — `/api/v1`, the Effect `HttpApi`, and the generated OpenAPI contract
- [Native apps: TDD](docs/agents/mobile.md) — what to test in the iOS and Android apps, the fast test loop, fixtures, and client security cases
- [Dependencies, CI, and deployment](docs/agents/dependencies-and-deployment.md) — dependency updates, CI/deployment checks, Docker notes

## Conventions

Use the [code-consistency skill](.agents/skills/code-consistency/SKILL.md) when implementing or
reviewing application changes. Match the dominant function style in each module, use named
Svelte handlers and short arrow callbacks, and limit normalization to touched code.

Prettier: tabs, single quotes, no trailing commas, `printWidth` 100, LF. Follow existing Svelte 5 rune and Tailwind CSS v4 patterns. Server logic belongs in `src/lib/server/*` as Effect programs and services (unit-tested with test layers); routes and API handlers stay thin orchestration.
