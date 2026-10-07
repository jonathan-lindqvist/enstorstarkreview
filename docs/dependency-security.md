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

Versions below are the resolved lockfile versions. Direct dependency minimums were raised to
the reviewed versions; transitive packages were refreshed within their existing parent ranges.

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

## Design decisions

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
  Use `~8.55.0` to stay on that compatible minor until the Node support policy changes or
  a newer branch restores compatibility; do not force an older visitor-keys major underneath it.
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
docker compose -f docker-compose.dev.yml exec app npx --yes --package npm@11.21.0 npm install --package-lock-only --ignore-scripts <package>@<version>
docker compose -f docker-compose.dev.yml exec app npx --yes --package npm@11.21.0 npm update --package-lock-only --ignore-scripts <transitive-package>
```

Commit `package.json` and `package-lock.json` together. Avoid `audit fix --force`,
`--legacy-peer-deps`, audit exclusions, or unrelated major upgrades. Preserve optional native
packages for supported platforms. Never edit resolved versions or integrity hashes by hand.

Refresh the persistent development dependency volume after updates. From `make dev-shell`,
run `npm ci --ignore-scripts=false`, exit, and restart the app with
`docker compose -f docker-compose.dev.yml restart app`. This replaces installed dependencies
without deleting MongoDB data. `make dev-reinstall` also rebuilds the development image and
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
