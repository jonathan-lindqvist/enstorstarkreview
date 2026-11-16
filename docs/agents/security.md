# Security

Rules for security-sensitive helpers and image handling.
The general trust-boundary requirements live in AGENTS.md.
Part of the agent guidance in [AGENTS.md](../../AGENTS.md).

## Security-sensitive helpers

`server/audit.ts` records every sensitive action (outcomes: attempt/success/failure/denied/rate_limited) and **never throws** — audit failures are swallowed so they can't break a request.
`server/rate-limit.ts` throttles logins per-IP and per-username using an atomic MongoDB aggregation-pipeline upsert (8 attempts / 15 min window/block).
`server/request.ts` only trusts `x-forwarded-for` / `x-real-ip` when `TRUST_PROXY=true`.
Login (`/login`) hashes even for unknown usernames to avoid timing leaks; credential verification lives in `server/login/credentials.ts`.
Login and `scripts/create-user.js` share `server/login/policy.js`; the Docker runtime copies this dependency-free ESM module for the standalone script.

## Response caching and sessions

`server/cache-policy.ts` applies the central response policy in `hooks.server.ts` after SvelteKit resolves the request, including session and action cookies.
Any response setting or clearing a cookie is `private, no-store`.
Web requests containing a session cookie are also `private, no-store`, even when the cookie is empty, invalid, expired, or revoked, or the session does not need renewal.
Authenticated web responses and other dynamic web responses default to `private, no-store`, including HTML, page data, actions, and redirects.
Existing non-storable errors keep their policy.

Anonymous GET/HEAD responses may retain an explicit public policy only on RSS, sitemap, and image routes, for successful responses and conditional 304s without cookies.
Their existing resource lifetimes remain unchanged, and adapter-served static assets and internal public map/statistics caches are unaffected.
The API retains its bearer-only authentication, `Vary: Authorization`, and authorized revalidation policy; a response that unexpectedly sets a cookie is still made non-storable.
HTTP regressions in `tests/cache-security.test.ts` exercise the production build, cookie renewal, private pages, independent anonymous clients, and API validators.

Before deploying this policy, inspect the actual Caddy/CDN configuration for shared response caching, cache keys, and header overrides.
Shared caches must honor `private`, `no-store`, and `Vary: Authorization`, and distinguish the complete URL including image preview queries.
If shared caching was enabled for affected responses, purge those entries and revoke existing Lucia sessions once to invalidate potentially cached session cookies.
Otherwise, retain existing sessions.
Verify deployed anonymous headers and controlled-account renewal before declaring the rollout complete; new headers cannot purge previously stored responses by themselves.

## Images

`src/lib/server/review-images.ts` accepts JPEG/PNG/WebP, verifying both MIME type and magic-byte signature, then re-encodes through `sharp` (strips EXIF, auto-rotates) and writes an `<ObjectId>.<ext>` file.
Storage dir resolves to `REVIEW_IMAGE_DIR`, else `/app/uploads/images` in production, else `uploads/images` in dev (gitignored).
The encoder's rotated output supplies trusted photo dimensions; shared writes save them with the new filename and never accept client-supplied dimensions.
Development uploads must stay outside `static`, or Vite can bypass route authorization.
Files are served back through the `/images/[filename]` route, which re-validates the filename and authorizes it through its referencing review before reading from disk.
Published and legacy images use public immutable caching; authenticated draft images use `private, no-store`; unreferenced, unauthorized, and deleted-review filenames return 404.
Web image responses also follow the [central session cache restrictions](#response-caching-and-sessions).
Because of the immutable caching, deleting a review does not remove copies that browsers or shared caches already hold.

The browser route and `/api/v1/images/[filename]` also accept `?preview=card-v1` (768 pixels wide) and `?preview=detail-v1` (1,280 pixels wide).
These legacy presets remain WebP at quality 80, without enlargement or cropping, and leave original files unchanged.
Both routes also accept the bounded `photo-480-v2`, `photo-768-v2`, `photo-1280-v2`, `photo-1920-v2` and `photo-2560-v2` presets at quality 90 and the named maximum width.
New presets share the same authorization and capacity limits, while retaining separate version-2 cache files so existing immutable responses never change encoding.
Unknown or repeated presets return `400` before protected work (`bad_request` problem on the API).
Authorization runs before reading even a cached preview; the same publication and deletion filters and cache headers apply.
Only published or legacy missing-status images receive public cache headers; authenticated reads of unrecognized publication states are private and cannot populate a shared cache.

`server/review-image-previews.ts` generates derivatives on demand under `REVIEW_IMAGE_DIR/previews/v1` or `previews/v2`, outside public static storage.
Atomic writes prevent partial cache entries, pending reads share generation, and failed work is not cached.
Generation admits two active jobs and sixteen waiting jobs; excess requests receive `503` with `Retry-After: 1`.
Sharp rejects inputs over 64 million decoded pixels.
Image-route failures have `no-store`; the browser can fall back to an authorized original when a preview is unavailable.
Disk caches are disposable derivatives and can rebuild after restoration without a database migration.
