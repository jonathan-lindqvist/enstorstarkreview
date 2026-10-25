# Reviews

Rules for ratings, the review form, publication, RSS, and review requests. Part of the agent guidance in [AGENTS.md](../../AGENTS.md).

For homepage loading, global search/nearest sorting, crawler navigation and metadata, follow
[SEO and seamless browsing](../seo.md). Keep card responses bounded to 24, reuse visibility before
pagination or ID selection, and preserve private/no-store caching. The sitemap always reads only
active public reviews, even for signed-in visitors. Visitor coordinates stay in browser memory.

## Rating system is metadata-driven

`src/lib/review-metadata.ts` (`REVIEW_RATING_METRICS`) is the single source of truth for the 8 rating aspects (each 0–5, with Swedish label/description and a weight). `utils/ratings.ts` collapses the weighted sum into an overall `rating` of 0–3. This one array drives form fields, validation, and change-log diffs — **to add or rename an aspect, edit `REVIEW_RATING_METRICS` and `ReviewRatingKey` in `src/lib/types/bar-review.ts`**, not the individual routes.

## Review form pipeline

`src/lib/server/reviews/` separates form parsing/validation (`form.ts`), authorship (`authorship.ts`), persistence mapping (`persistence.ts`), and history (`history.ts`, including `REVIEW_CHANGE_FIELD_SPECS`). `create.ts` and `edit.ts` expose workflows that return typed results; `response.ts` maps failures to SvelteKit. Shared problem types live in `src/lib/types/review-form.ts`, and text/slug primitives in `utils/review-text.ts` and `utils/slug.ts`. Both routes follow the same guarded sequence: auth check → audit `attempt` → parse `FormData` → validate → validate selected authors against the `users` collection (allowing existing credited names) → slug-collision check → image upload → insert/update → audit `success` → `throw redirect`. Duplicate slugs are caught both proactively and via Mongo error code `11000`. New form-created reviews are fully validated drafts; editing preserves their publication status and must never accept it from form data. Editing is intentionally collaborative: any authenticated user may edit any review; the form submits the full `authors` selection, with at least one required. The editor is selected by default but can opt out. A selected editor becomes the primary `author`; otherwise retain a selected existing primary, then fall back to the first selected name in checklist order (editor, existing credits, other users alphabetically). Store the remaining selections in `coAuthors`. Preserve submitted selections after validation errors, including an empty selection.

## Beer brand picker

Both review forms pick the beer with `components/review-form/BeerBrandTiles.svelte`: native
`beer-brand` radios drawn as logo tiles, sorted in Swedish order with the "other" choice last.
The normal form shows them in a popover opened from a button labelled "Öl för en stor stark":
nearly full screen on phones and a large centred panel over a dimmed page on wider screens, so it never
depends on scroll position. The wizard shows the tiles inline. In the popover, arrow keys move the selection without closing it,
while a click, Enter or Space confirms and closes. A missing choice shows a Swedish error on the
button, because closed tiles cannot show the browser's own message. `BEER_BRAND_OPTIONS` in
`beer-brands.ts` is the one list of listed brands, each with its logo in `static/beer-brands/`;
`BEER_BRANDS` is derived from it. Custom brands never get an image, and the beer icon remains a
fallback. Make new logos with `support/beer-logos` (light beige 256×256 squares);
`beer-brands.test.ts` fails on missing or unused files.

## Publication and visibility

`src/lib/server/review-publication.ts` owns status normalization, the public Mongo filter, and the atomic draft-to-published update. `publicationStatus: 'draft'` is private; `'published'` and a missing status are public so legacy reviews need no migration. Public queries must match **exactly** published or missing status—never use a fail-open `$ne: 'draft'` filter. Anonymous home/search, detail, history, image access, `/karta`, and `/statistik` apply that filter before loading a document. Deletion is soft: a deleted review keeps its document with `deletedAt` and `deletedBy`, and `ACTIVE_REVIEW_FILTER` hides it from every reader, signed in or not. `PUBLIC_REVIEW_FILTER` and `withReviewVisibility` include it, and queries that skip them (admin list, edit, publication) add it themselves; the review form's price comparison uses `PUBLIC_REVIEW_FILTER`, so drafts never appear in its chart. Slug-collision checks deliberately still see deleted reviews, because the slug index is unique. Like publication, deletion is a named detail-page POST action (and `DELETE /api/v1/reviews/{slug}`, which also requires `If-Match`) that any authenticated user may run on any review; its only UI is a confirmation at the bottom of the edit page, deliberately kept off the detail page so it cannot be tapped by accident: `server/review-deletion.ts` sets `deletedAt` and `deletedBy` only on the version it read, appends a `Status` → `Borttagen` change-log entry, and never removes the document or image. Deletion is not a takedown: the image route returns 404 afterwards, but published images were served `public, max-age=31536000, immutable`, so browsers and shared caches can keep serving copies for up to a year. Removing content from those caches would need a purge or a shorter image cache policy. `reviews/delete.ts` audits `review_delete` events and invalidates the public caches. There is no restore in the UI; clear `deletedAt` in the database to bring a review back. Any authenticated user may view, edit, and publish any draft. Publication is a named detail-page POST action, uses only the sanitized route slug, is one-way, and preserves credited authors. It records the status change and publisher in `changeLog` and emits `review_publish` audit events identifying the publisher. Do not add separate publication timestamp/user fields: the change log and audit log provide that history. `server/review-statistics.ts` and `server/review-map.ts` cache public-only data in-process for 24 hours; invalidate the relevant cache after a successful publication or edit to a published review. Do not include drafts in either cache, even for authenticated visitors.

## Serving volume and value

`beerVolumeCl` is optional and nullable: missing/null means unknown, never an assumed 50 cl.
Both review forms accept whole centilitres from 1–200; a blank field clears the size. Shared
validation rejects invalid sizes before image work or persistence and preserves the submitted
size (including a clear) after other validation errors. Volume changes belong in review history.
`utils/beer-value.ts` owns validation, `volume / price` and Swedish cl/kr formatting. The detail
page shows volume and cl/kr only when valid; cards, map labels, ratings and price guidance keep
their existing behavior.

Public value statistics require a valid whole-krona price and valid volume. Each review has equal
weight in overall and per-brand averages; never divide summed volumes by summed prices. Guard
aggregation arithmetic locally against malformed persisted data. Best/worst lists contain at
most five bars, sorted on unrounded cl/kr then title and slug. Trimmed nonblank brands have
separate value counts. Exclude happy-hour prices from all price/value averages, eligible counts,
rankings and brand aggregates. Count valid public happy-hour findings separately; they still
contribute to review totals, Göteborg counts and ratings. The API keeps its existing response
shape: per-brand happy-hour counts are zero, and the global percentage uses all valid prices.
Price-only sample counts remain separate. Reuse public visibility, caching and write invalidation;
drafts, deleted reviews and unknown statuses cannot affect public metrics.

The overview's **Totalt spenderat** is `totalReviewerSpendKr`: sum each public active review's
valid whole-krona price (1–999) times its distinct primary/co-author credits, including happy hour.
Support legacy string co-authors and deleted-account credits without joining users. Ignore blank
or malformed credits and invalid prices, guarding types before Mongo arithmetic/string operators.
This estimates one beer per reviewer at the current saved price; no eligible spending returns zero.
Reuse the statistics cache and its publication, edit and deletion invalidation.

## Rating guidance and brand averages

The normal form and wizard share `NearbyReviewGuidance` beside `barhopPotential`.
Authenticated form loaders read minimal active-review data, drafts included (unlike the price
comparison, which is public-only), and reuse resolved saved coordinates. The edited review is excluded from counts
but its saved address can still supply the center. Shared browser-safe address normalization
lives in `utils/map-address.ts`; no form load or helper calls Nominatim. Native clients get the
same comparison from `GET /api/v1/nearby-reviews` (`server/api/nearby-reviews.ts`), with the
saved-address center only.

Counts are cumulative within 250, 500 and 1,000 metres, with the five nearest reviews within
1,000 metres ordered by distance then Swedish title. Missing coordinates are disclosed and
must not become a reliable zero. If the address has no saved position, the reviewer can
explicitly use their browser position. Keep it in memory only, stop after the first result,
reset on address changes, and dispose on teardown. The helper never changes a rating.

Public statistics group valid regular prices by trimmed stored beer brand, including custom brands.
Blank/unknown brands and brands with only happy-hour prices are omitted. `beerBrandPrices` carries
the average, sample count and legacy zero happy-hour count; sort by average then Swedish brand name.
The web combines price and value averages in one brand table, with separate sample counts and `–`
for unavailable value data. Its headings sort the loaded rows locally: names use Swedish order,
prices start ascending, and counts and cl/kr start descending. Repeated selection reverses the
direction; numeric ties use ascending Swedish brand names and missing cl/kr always stays last.
Comparisons use unrounded numbers and reload restores ascending price order. The existing public
filter, cache lifetime and write invalidation apply to these results too.
Keep the four-column table and header sorting at every screen size. Below 640px, narrower outer
gutters, fixed numeric column widths and more row padding keep all columns visible without sideways
scrolling. Brand names may wrap, prices stay on one line, and resizing preserves the selected sort.

The bottom of `/statistik` reuses the form's scatter plot (`PriceComparisonPlot`) for every public
review with a valid price, happy hour included as hollow points, and no current bar. Its
`priceComparison` points come from the statistics aggregation, so they share the public filter,
cache and write invalidation. Each point is a keyboard-focusable link to the bar's page with a
larger invisible hit area for touch. The field is web-only: `/api/v1/statistics` strips it.

## Development demo reviews

`npm run seed-bars` runs `scripts/seed-bars.js`. Each ten-record cycle has six complete beer records
(one draft), one explicit null volume, and three older public legacy records with genuinely missing
optional fields. Preserve both missing and null coverage, regular/happy-hour prices, listed/custom
brands and valid ratings. Legacy publication status stays absent so the public fallback is exercised.
The script must refuse production and require an existing author before fresh-mode deletion.
`server/seed-bars.test.ts` tests generated records and mocked database/filesystem failure paths.

## RSS subscriptions

`/feed.xml` is a public RSS 2.0 endpoint. `server/review-feed.ts` loads projected reviews using `PUBLIC_REVIEW_FILTER` for every visitor and builds the 50 latest announcements. Use the earliest `Utkast` → `Publicerad` change-log entry for the publication date; fall back to `createdAt` only when no publication history exists, and omit reviews without a valid date. Sort by publication date and then `_id`, both descending. GUIDs use the review's `_id` and must stay stable across edits and slug changes. XML must be escaped, and description text must also be encoded for readers that render HTML. The route owns five-minute HTTP caching, content-based ETags, conditional 304 responses, and Swedish `503` failures with `no-store`; do not add a process cache, subscriber storage, or publication fields. RSS anchors must use `data-sveltekit-reload` to bypass client routing and hover preloading through `[slug]`. Discovery lives in the global layout head and the Swedish FAQ. Feed rules have adjacent unit tests, HTTP behavior is tested beside the endpoint, and browser navigation/publication coverage uses the shared review fixtures.

## Review requests

`server/review-requests` separates validation, delivery, policy, and submission. The `/about` route checks origin and parses input before invoking the workflow, then maps its result and retry delay to HTTP. Login and review-request rate limiters deliberately retain different policies. Playwright runs with one worker; publication, authorship, and map specs share `tests/fixtures/reviews.ts`, with browser helpers in `tests/fixtures/browser.ts`. Unit image coverage lives beside `review-images.ts`.
