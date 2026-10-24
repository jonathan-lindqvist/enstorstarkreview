# Dependency security

## Audit snapshot: 2026-10-07

The baseline reported 25 affected package entries: 1 critical, 16 high, 7 moderate,
and 1 low. These counts include parents affected through transitive dependencies;
they are not counts of distinct advisories. The updated complete dependency tree reports
zero vulnerabilities. Audit results are a dated snapshot, not a guarantee against future findings.

Both `npm audit` after a clean install and `npm audit --package-lock-only` must pass.
Do not restrict the acceptance check to `--omit=dev`: the production Dockerfile copies the
complete `node_modules` tree, and SvelteKit itself is classified as a development dependency.

## Reviewed updates and exposure

Versions below are the resolved lockfile versions. Direct dependency minimums were initially
raised to the reviewed versions; transitive packages were refreshed within their existing parent ranges.
On 2026-10-13, all direct dependencies and development dependencies were pinned to their exact
existing lockfile versions. `.npmrc` sets `save-exact=true` so future saved dependencies also
use exact versions. Commit manifest and lockfile updates together; use `npm ci` for frozen installs.

| Dependency / path                                  | Before → after                 | Exposure and advisories                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maplibre-gl`                                      | 6.0.0 → 6.4.1                  | External map-style attribution reaches HTML sanitization. Adjacent event attributes could survive removal and execute without a click. [GHSA-jrc7-96c5-q579](https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579).                                                                                                                                                                     |
| `sharp` and bundled native libraries               | 0.35.3 → 0.35.5                | Untrusted uploads reach native image processing. MIME/signature checks already reject SVG and HEIC, reducing exposure to the reported librsvg/libheif paths. Update the libraries as well as preserving those checks. [GHSA-rgj7-g3m4-5g8c](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c), [GHSA-wq5f-xc86-pv6w](https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w). |
| `@sveltejs/kit`                                    | 2.70.1 → 2.70.3                | Anonymous request headers reach content negotiation. [GHSA-29g2-3rmr-qm68](https://github.com/sveltejs/kit/security/advisories/GHSA-29g2-3rmr-qm68).                                                                                                                                                                                                                                                                  |
| Kit / Svelte → `devalue`                           | 5.8.1 → 5.9.4                  | Framework serialization has shared-memory disclosure, amplification, malformed-input, and rejection-handling fixes. Application page data currently does not intentionally expose pooled binary buffers. See the complete advisory list below.                                                                                                                                                                        |
| Kit → `cookie`                                     | 0.6.0 → 0.7.2                  | Cookie names, paths, and domains must not inject extra attributes. Current application names and options are server-owned. [GHSA-pxg6-pf52-xh8x](https://github.com/advisories/GHSA-pxg6-pf52-xh8x).                                                                                                                                                                                                                  |
| `markdown-it`                                      | 14.3.0 → 14.3.1                | User review text is rendered with `linkify: false`; the reported quadratic linkification paths are disabled, but the patch is compatible. [GHSA-253c-mchw-3w2r](https://github.com/advisories/GHSA-253c-mchw-3w2r).                                                                                                                                                                                                   |
| `postcss`                                          | 8.5.15 → 8.5.29                | Build-time source-map loading could read files outside the intended source tree. The application does not accept uploaded CSS. [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849), [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp).                                                                                                                                    |
| PostCSS → `nanoid`                                 | 3.3.12 → 3.3.20                | Invalid generator sizes could loop indefinitely. [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv), [GHSA-2v37-7h3g-55p8](https://github.com/advisories/GHSA-2v37-7h3g-55p8).                                                                                                                                                                                                                  |
| PostCSS / Sass / Tailwind → `source-map-js`        | 1.2.1 → 1.2.2                  | Malformed indexed source maps could block the event loop. [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).                                                                                                                                                                                                                                                                                   |
| `typescript-eslint` and its packages               | 8.28.0 → 8.55.0                | Replaces its `fast-glob` → `micromatch` → `braces` path.                                                                                                                                                                                                                                                                                                                                                              |
| Sass → `@parcel/watcher`                           | 2.5.1 → 2.6.0                  | Replaces its `micromatch` → `braces` path; Sass itself remains at 1.86.0.                                                                                                                                                                                                                                                                                                                                             |
| `braces` / `micromatch` / `fast-glob`              | Removed                        | No patched `braces` release was available. Remove both parent paths rather than hiding or overriding an incompatible package. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).                                                                                                                                                                                                               |
| minimatch → `brace-expansion`                      | 1.1.16 → 1.1.21; 2.1.2 → 2.1.7 | Tooling expansion and recursion denial of service. Preserve the compatible major for each parent; Both remaining minimatch branches retain compatible expansion majors. See advisory list below.                                                                                                                                                                                                                      |
| `eslint-plugin-svelte` → `postcss-selector-parser` | 2.46.1 → 3.23.0; 6.1.4 → 7.1.6 | Selector parsing could amplify CPU work during linting. [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf).                                                                                                                                                                                                                                                                                     |
| ESLint → `@humanfs/node`                           | 0.16.6 → 0.16.8                | Recursive copying could follow symlinks outside the source tree. [GHSA-p498-v437-472g](https://github.com/advisories/GHSA-p498-v437-472g).                                                                                                                                                                                                                                                                            |
| `vitest` / `@vitest/mocker`                        | 4.1.8 → 4.1.11                 | Mock redirect path traversal / arbitrary file reading in test tooling. [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9).                                                                                                                                                                                                                                                                      |

The devalue fixes cover [GHSA-9rgm-9g3h-6x36](https://github.com/advisories/GHSA-9rgm-9g3h-6x36),
[GHSA-j22f-vq7h-c4qm](https://github.com/advisories/GHSA-j22f-vq7h-c4qm),
[GHSA-hx4r-w6wj-j8fg](https://github.com/advisories/GHSA-hx4r-w6wj-j8fg),
[GHSA-mcm9-63f2-9j32](https://github.com/advisories/GHSA-mcm9-63f2-9j32),
[GHSA-wf3x-273g-mvxv](https://github.com/advisories/GHSA-wf3x-273g-mvxv),
[GHSA-x5rw-q4pp-hg5g](https://github.com/advisories/GHSA-x5rw-q4pp-hg5g), and
[GHSA-4q55-j62x-fr9h](https://github.com/advisories/GHSA-4q55-j62x-fr9h).

The brace-expansion fixes cover [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg),
[GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895),
[GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr),
[GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), and
[GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p).

## Current framework baseline: 2026-10-24

The SvelteKit 3 migration supersedes the Kit 2 / Node 20 compatibility decisions below.
Direct versions are Kit 3.1.0, adapter-node 6.0.0, Svelte 5.57.2, TypeScript 6.0.3,
svelte-check 4.7.7 and typescript-eslint 8.72.0. Vite 8.3.5 and Svelte's Vite plugin
7.1.2 meet the framework requirements. Host support is `^22.17.0 || >=24.0.0`;
Docker continues to use Node 22.

- Remove Kit's cookie 0.7.2 override: Kit 3 requests cookie 2.0.1 or newer itself. The
  regression resolves Kit's actual dependency and uses `parseCookie` / `stringifySetCookie`,
  retaining attribute-injection checks, Swedish values and session attributes. Cookie names
  must now be ASCII.
- Remove the map-parser 2.0.2 override because its Node 20 compatibility requirement no
  longer applies. Keep the real style parser and bundled map/worker regressions.
- typescript-eslint 8.72.0 supports TypeScript 6.0; the previous Node 22.12 constraint is
  superseded. Keep ESLint 9 and the existing enabled rules.
- The full-tree audit also requires compatible security updates to Vite 8.3.5,
  Vitest / coverage-v8 4.1.12, markdown-it 14.3.3 and transitive fast-uri 3.1.9.
  Keep the Vitest packages aligned. The Markdown update fixes quadratic parsing of
  unterminated multi-line link references, including with default parser options.
  [Upstream advisory](https://github.com/markdown-it/markdown-it/security/advisories/GHSA-gfr2-rv44-r23c).
- openapi-typescript 7.13.0 still requires TypeScript 5. Isolate it with TypeScript 5.9.3
  in the private `tools/api-types` npm workspace, using the same root lockfile and frozen
  installs. The application uses TypeScript 6.0.3. The generator and its freshness regression
  retain the existing output. Remove the workspace when the generator supports the app's
  TypeScript version, after repeating generation, contract and audit checks.
- Declare MongoDB and Discord variables as private runtime configuration in `src/env.ts`.
  Missing MongoDB configuration fails without logging its value. Discord remains optional
  until the delivery workflow enforces its production requirement. Builds continue to use
  a non-secret MongoDB placeholder; deployment injects the real runtime value.
- Framework configuration and nonce CSP live in `vite.config.ts`. No `ORIGIN` setting
  exists in tracked deployment configuration. adapter-node 6 defaults to HTTPS for origin
  inference; local HTTP server checks configure their trusted protocol header explicitly.
- Kit 3's global CSRF check rejects bodyless native API requests before hooks run, including
  bearer-authenticated logout. Configure `csrf.trustedOrigins: ['*']` only together with the
  production origin guard at the start of `hooks.server.ts`. `server/request-origin.ts`
  rejects every mutating web request with a missing or different origin before authentication,
  cookie renewal, parsing or protected work, regardless of content type. The `/api/` prefix
  retains its bearer-only policy and never accepts cookie credentials; lookalike paths receive
  web origin checks. Unit and HTTP regressions cover both boundaries. Development keeps Kit's
  existing relaxed origin behavior. Do not remove the hook guard while this configuration is set.
- Use standard `#lib/*` subpath imports, `$app/tsconfig`, readonly URL copies and shallow
  `goto` updates that retain focus and scroll. Retain native API contracts, private upload
  routing, collaborative review access and the framework's default deployment polling.
  Remote functions, async components, service workers and OpenTelemetry remain deferred.

See the [Kit 3 migration guide](https://svelte.dev/docs/kit/migrating-to-sveltekit-3),
[private environment variables](https://svelte.dev/docs/kit/environment-variables), and
[Node adapter documentation](https://svelte.dev/docs/kit/adapter-node).

### Upgrade verification

- The enhanced-login regression failed on Kit 2 with HTTP 200 instead of 400, after
  confirming Swedish feedback and no new session. It passes on Kit 3. The bodyless
  logout regression also exposed the framework's pre-hook CSRF rejection before the
  route-aware compatibility fix.
- `make ci` passes all eleven checks: 625 unit tests, 108 browser/API cases, formatting,
  lint, type checking, OpenAPI lint, automation tests, shellcheck and the real disposable
  backup/restore rehearsal. Chromium and Firefox cover nonce CSP and navigation.
- Coverage floors are raised to lines 79.56%, branches 78.66%, functions 84.3%, and
  statements 78.88%. Added hook tests assert rejection before credential handling,
  session renewal/revocation, native bearer isolation and local development behavior.
- Installed-tree and lockfile audits, including development and optional dependencies,
  both report zero vulnerabilities. Engine metadata is compatible with Linux x64/glibc
  at Node 22.17.0 and 24.0.0. The application and generator use their supported compilers.
- A build using a non-secret MongoDB placeholder was exercised directly with `node build`
  and runtime configuration: missing database failure, optional webhook startup, mocked
  delivery, proxy HTTPS origins, web CSRF, static GET/HEAD/304/405, Argon2 login, Sharp
  uploads/previews, private draft images, bodyless publication requests and empty logout responses.
- The production Docker image builds and imports the generator workspace as the non-root
  user; Argon2 hashing/verification and Sharp encoding pass inside that image on Node 22.23.4.
  The development image and dependency volume were refreshed without starting or resetting
  its MongoDB service.

## Historical Kit 2 design decisions

- Keep SvelteKit 2, Vitest 4, ESLint 9, and Node `^20.19.0 || >=22.12.0` support.
  ESLint is updated from 9.39.2 to 9.39.5; npm marks this major unsupported. That
  maintenance limitation remains, but there is no reported audit finding. A future ESLint
  major migration is separate work.
- Use npm 11.21.0 through `npx` for dependency resolution. npm 10.9.9 failed with
  `Cannot read properties of null (reading 'edgesOut')` during resolution dry runs.
  npm 11's engine range (`^20.17.0 || >=22.9.0`) fits the documented Node versions.
  Existing Docker npm 10 can still perform a clean `npm ci` from the resolved lockfile.
- Compatibility checks changed the planned TypeScript ESLint target from 8.71.1 to 8.55.0.
  The newer visitor-keys dependency requires Node 22.13, excluding the documented 22.12
  minimum. Version 8.55.0 also removes the vulnerable glob chain and passes the full audit.
  Pin `8.55.0`; review later releases on that compatible minor until the Node support policy
  changes or a newer branch restores compatibility. Do not force an older visitor-keys major underneath it.
- A pre-existing map parser dependency also excluded Node 20: style-spec 26.2.1 requests
  jsonlint 2.0.3, whose engine is `>=22`. Scope a compatibility override to
  `@maplibre/maplibre-gl-style-spec` → `@mapbox/jsonlint-lines-primitives: 2.0.2`.
  Both versions expose the same CommonJS parser interface. Review of the package diff found
  parser regeneration / strict-mode changes and packaging changes, rather than a reported
  security fix; 2.0.2 has no finding in the full audit. Test the actual resolved CommonJS parser
  with valid Swedish style data and malformed JSON, and retain the real bundled map/worker
  browser regression. Remove this pin once the parser supports Node 20 again, or a separately
  agreed Node policy drops Node 20, after repeating parser, map, build, and audit checks.
- The cookie security override is scoped to `@sveltejs/kit` → `cookie: 0.7.2`. Kit 2.70.3 requests
  `^0.6.0`, so an ordinary compatible refresh cannot fix it. The replacement retains the
  CommonJS `parse`/`serialize` interface and has rejection and session lifecycle tests.
  Remove the override once Kit's own range selects a patched cookie release; rerun those
  tests and the full audit before removal. Do not replace it with a global cookie override.
- Migrate to the Svelte plugin v3 flat `recommended` / `prettier` presets, retaining
  TypeScript parsing and unused-variable checks. Keep the new rules enabled. Internal links
  use Kit's typed `resolve` with existing slug encoding; repeated items have keys. Mark the
  Google Maps link external. Two documented local reactivity exceptions cover temporary
  grouping / URL-construction objects that are rebuilt, not retained as reactive state.
  Exclude generated Playwright output from lint traversal to avoid racing its cleanup.
- Preserve bundled MapLibre CSS, worker setup, CSP, and location privacy behavior. Fix the
  upstream sanitizer rather than adding a second application sanitizer.
- Set `NODE_ENV=production` explicitly for Playwright's managed build/preview. Docker's
  inherited development mode otherwise compiles development cookie settings into that build.
  The application cookie policy and API bearer-only transport are unchanged.
- No API schema, database, mobile, or deployment-policy changes are needed.

## Repeatable maintenance

Start with the full audit and dependency paths, then select patched compatible versions:

```bash
docker compose -f docker-compose.dev.yml exec app npm audit
docker compose -f docker-compose.dev.yml exec app npm audit --package-lock-only
docker compose -f docker-compose.dev.yml exec app npm explain <package>
```

For a direct update, substitute the reviewed package/version; for a transitive update,
refresh it within the parent's range. These commands update repository files:

```bash
docker compose -f docker-compose.dev.yml exec app npx --yes --package npm@11.21.0 npm install --save-exact --package-lock-only --ignore-scripts <package>@<version>
docker compose -f docker-compose.dev.yml exec app npx --yes --package npm@11.21.0 npm update --package-lock-only --ignore-scripts <transitive-package>
```

Commit `package.json` and `package-lock.json` together. Avoid `audit fix --force`,
`--legacy-peer-deps`, audit exclusions, or unrelated major upgrades. Preserve optional native
packages for supported platforms. Never edit resolved versions or integrity hashes by hand.

Refresh the persistent development dependency volume after updates. Run
`docker compose -f docker-compose.dev.yml exec app npm ci --ignore-scripts=false`, then restart the app with
`docker compose -f docker-compose.dev.yml restart app`. This replaces installed dependencies
without deleting MongoDB data. `make dev-rebuild` also rebuilds the development image and
recreates only the dependency volume; do not use `make dev-reset` for an update. Rebuild the
production image before deployment so old bundled native libraries are replaced too.

Run the full unit and integration suites, `npm run check`, `npm run lint`, and
`npm run api:lint`, then repeat both audit commands. Contract/type freshness is covered by
the unit suite; unchanged OpenAPI does not require regenerating types. Browser tests require
the development MongoDB and local mock webhook described in the README.

If a later advisory has no fix, document its ID, dependency chain, exposure, mitigation,
and remaining limitation. Never report a restricted or ignored audit as a clean full audit.

## Regression evidence

- The attribution browser test failed on MapLibre 6.0.0 because `ontoggle` remained on
  malicious external-style attribution, and passed on 6.4.1. A local style fixture exercises
  the real map and bundled worker without depending on external style/tile data. It checks
  all event attributes, absence of execution, and preservation of safe attribution links/text.
- All three cookie injection tests failed on Kit's actual cookie 0.6.0 and passed on 0.7.2.
  Resolution starts from Kit so a future nested copy cannot evade the test. Swedish value
  encoding and security attributes also round-trip correctly.
- Eight SVG/HEIC rejection cases cover original MIME types and false JPEG/PNG/WebP labels,
  asserting a Swedish validation error and no files written. Existing accepted-format,
  native upload, and EXIF-stripping coverage remains in place.
- The browser session test covers login attributes, database-backed renewal, bearer API
  logout without a cookie response, and clearing the revoked cookie on the next web request.
  It uses native forms with JavaScript disabled so client preloads cannot renew the session
  before the document request. Login quotas use the shared snapshot/restore helper; adding
  coverage must not exhaust or relax the application's real IP limit for other specs.
- Map parser compatibility tests accept Swedish style JSON and reject trailing commas and
  unquoted keys through the dependency actually resolved by style-spec.

## Verification results

Verification ran in the development Docker stack with Node 22.23.3 and a local mock webhook.
The MongoDB data volume was preserved; the dependency volume received a clean
`npm ci --ignore-scripts=false` installation.

- Full unit suite: 301 tests in 46 files passed, including OpenAPI contract and generated-type
  freshness checks.
- Full integration suite: all 38 tests passed, including API negative paths, attribution
  sanitization, native cookie renewal/revocation, publication, authorship, map, and RSS behavior.
- `npm run check`: zero errors and zero warnings.
- `npm run lint`: formatting and enabled ESLint rules passed.
- `npm run api:lint`: passed with the existing 12 advisory warnings (license, tag descriptions,
  and missing 4xx documentation on public reads); no API contract changed.
- Full installed-tree and lockfile audits: zero vulnerabilities. The production image's
  `npm audit --include=dev --include=optional` also reported zero.
- Lockfile engine checks passed for both documented minima, Node 20.19.0 and 22.12.0.
  Runtime tests were executed on Node 22.23.3.
- A clean production Docker build passed using only the non-secret build-time MongoDB
  placeholder. Native smoke checks in the runtime image passed Argon2 hashing/verification
  and Sharp re-encoding/EXIF removal. The image contains Sharp 0.35.5, libvips 8.18.7,
  librsvg 2.63.2, and libheif 1.23.5.
