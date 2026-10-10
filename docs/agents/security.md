# Security

Rules for security-sensitive helpers and image handling. The general trust-boundary requirements live in AGENTS.md. Part of the agent guidance in [AGENTS.md](../../AGENTS.md).

## Security-sensitive helpers

`server/audit.ts` records every sensitive action (outcomes: attempt/success/failure/denied/rate_limited) and **never throws** — audit failures are swallowed so they can't break a request. `server/rate-limit.ts` throttles logins per-IP and per-username using an atomic MongoDB aggregation-pipeline upsert (8 attempts / 15 min window/block). `server/request.ts` only trusts `x-forwarded-for` / `x-real-ip` when `TRUST_PROXY=true`. Login (`/login`) hashes even for unknown usernames to avoid timing leaks; credential verification lives in `server/login/credentials.ts`. Login and `scripts/create-user.js` share `server/login/policy.js`; the Docker runtime copies this dependency-free ESM module for the standalone script.

## Images

`src/lib/server/review-images.ts` accepts JPEG/PNG/WebP, verifying both MIME type and magic-byte signature, then re-encodes through `sharp` (strips EXIF, auto-rotates) and writes an `<ObjectId>.<ext>` file. Storage dir resolves to `REVIEW_IMAGE_DIR`, else `/app/uploads/images` in production, else `uploads/images` in dev (gitignored). Development uploads must stay outside `static`, or Vite can bypass route authorization. Files are served back through the `/images/[filename]` route, which re-validates the filename and authorizes it through its referencing review before reading from disk. Published and legacy images use public immutable caching; authenticated draft images use `private, no-store`; unreferenced, unauthorized, and deleted-review filenames return 404. Because of the immutable caching, deleting a review does not remove copies that browsers or shared caches already hold.
