# Dependencies, CI, and deployment

Extra checks and rules for dependency, CI, and deployment changes. Part of the agent guidance in [AGENTS.md](../../AGENTS.md).

## Dependency changes

Keep direct dependencies and development dependencies pinned to exact reviewed versions;
`.npmrc` sets `save-exact=true`. Update `package.json` and `package-lock.json` together and
use `npm ci` for frozen installs. Review and audit explicit updates rather than adding ranges.

For dependency changes, run both the complete `npm audit` and `npm audit --package-lock-only`,
including development dependencies (the runtime image contains the full tree). Resolve targeted
updates with `npx --yes --package npm@11.21.0 npm`; npm 10 can still install the committed
lockfile. Preserve native optional packages and refresh Docker dependencies with install
scripts enabled without deleting MongoDB data. Keep new lint rules enabled; justify any
local exceptions. See [dependency security](../dependency-security.md) for the scoped Kit
cookie and map-parser overrides, their removal conditions, the compatible TypeScript ESLint
minor, update workflow, and regression evidence. Check dependency engines against both
documented Node minima before selecting a new branch.

## CI and deployment changes

CI/deployment changes also require `npm run test:ci`, workflow syntax validation, and the disposable
Docker rehearsal `npm run test:deploy:restore`; `make ci FULL=1` runs both with every other CI check (plain `make ci` skips the rehearsal).
Keep Vitest and its coverage provider aligned.
The CI image installs Chromium and Firefox; focused CSP/SEO coverage in both browsers runs as part
of the ordinary Playwright suite. See [SEO rollout](../seo.md#verification-and-rollout) for sitemap
checks and Search Console submission after an app-only deployment.
Coverage includes untested application TS/JS and must not fall below the floor committed in
`vite.config.ts` in any aggregate metric. Raise the floor with `npm run test:coverage:update`
when coverage improves; never lower it to make a change pass. Do not weaken required checks,
expose production secrets to PR jobs, replace the tested deployment SHA with a newer unchecked
commit, or touch production fixtures.
See [deployment automation](../deployment.md) for the restricted SSH helper and backup policy.
Preserve the persistent five-minute admission cooldown before Git/Docker work and skip healthy
already-running revisions without another backup or replacement. Only temporary admission
failures may be retried automatically; backup, build, and rollback failures must fail the run.

## Deployment notes

- `docker-compose.yml` is **deployment only**: authenticated Mongo, no published ports, app on port 3000, attaches to an external `caddy_net` network. Local work uses `make dev`.
- Production app/Mongo logs use bounded, compressed Docker `local` retention. Apply Mongo logging or health-check changes in the [separate maintenance procedure](../deployment.md#container-logging-and-mongo-maintenance); automated app deployments must not recreate Mongo.
- The Mongo image defaults to `production`, with indexes and no application users. Keep demo seeding confined to the explicit `development` target used by local and CI database builds. See [database setup](../../db/README.md) for account provisioning and existing-volume behavior.
- The production `Dockerfile` build needs `MONGO_URI` present at build time (module-load side effect) but passes a non-secret placeholder build arg; real credentials arrive only as runtime env.
- `.npmrc` sets `ignore-scripts=true`. `argon2` and `sharp` are **native** modules — the Dockerfile re-enables install scripts (`npm config set ignore-scripts false`), and the dev compose file keeps a separate Linux-built `node_modules` volume shadowing the bind mount.
