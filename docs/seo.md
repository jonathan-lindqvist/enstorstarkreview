# Search discovery and seamless browsing

The homepage opens with a compact Göteborg heading, a short first-hand introduction and a **Så recenserar vi** link to the FAQ's review-method section.
The introduction sits directly on the page canvas so photos, bar names, ratings and prices appear sooner on phones.
The method describes actual visits, photos and observed prices without adding promotional claims or lengthening the reviews.
Keep original review wording and the existing cream/amber palette, typography and square photo grid.
The phone/desktop regression checks the first card's name, rating and price without scrolling, with consent settled and location disabled, in both themes.

The homepage server-renders 24 matching review cards.
With JavaScript, an intersection observer requests the next batch 600 pixels before the end and appends it automatically.
There are no normal pagination controls.
Search waits 250 ms, searches the entire authorized collection, and replaces the list in place.
Sorting and attribute filters also run before pagination.
Superseded requests are aborted and ignored; duplicate cards are merged by ID.
A failed request keeps the cards readable and offers **Försök igen**.
SvelteKit snapshots restore the query, loaded cards and scroll position after returning from a review, guarded by the current signed-in username and query.
Visitor location never enters the snapshot or a request.

Without JavaScript, ordinary previous/next links connect server-rendered batches, including `/?page=2`.
The links disappear once automatic loading starts.
The search form also works without JavaScript.
Every public review has a normal anchor and is included in the sitemap.
No JavaScript is required to read a review or traverse the listing.
The analytics banner appears only after JavaScript starts, so its inactive buttons cannot cover fallback navigation.

## Web data contract

`GET /recensioner/data` is an internal web endpoint using the same cookie session and visibility rules as the homepage, separate from the bearer-only native `/api/v1` contract.
All successful and dependency-failure responses use `Cache-Control: private, no-store` and `X-Robots-Tag: noindex`; homepage and detail HTML also use private, no-store caching.
Hooks resolve authentication first.

- `search`: existing literal, case-insensitive review search, normalized to 80 characters.
- `attributes`: repeated known keys, matching any selected attribute.
- `sort`: `latest` (default), `oldest`, `score`, or `nearest`.
- `page`: positive integer, at most 10,000.
  Missing means 1; an empty later page returns 404.
- `ids`: at most 24 distinct lowercase ObjectIds, in the desired order.
  Visibility and all query filters still apply.
  Card responses include no history, authorship, or unused rating aspects.
- `view=index`: instead of cards, returns only matching review IDs, creation dates and saved bar coordinates.
  Cannot be combined with `ids`.

URLs over 2,048 characters and malformed pagination/ID/view input return 400 before database work.
Dependency failure returns a generic Swedish 503 without database details.
There are no writes, geocoder requests or shared authenticated caches.
The on-demand nearest index covers the whole matching collection; the browser calculates distances and requests missing cards in batches of 24.
It reuses newest-first tie breaking and places bars without coordinates last.

## Metadata and indexing

`static/llms.txt` serves a small Swedish Markdown guide at `/llms.txt`, following the [llms.txt proposal](https://llmstxt.org/).
It describes the review method, rating scales and price context, and links to public pages, the sitemap and RSS feed.
Keep these descriptions aligned with the FAQ and use production URLs.
Discover individual reviews through the public sitemap rather than maintaining a second list of review URLs in this static file.

`lib/seo.ts` owns the fixed production origin, page metadata and safe JSON-LD serialization; `Seo.svelte` emits it during server rendering and navigation.
The document language is Swedish.
Public review metadata includes credited authors, the actual 0–3 rating scale and the stored publication date selected by the RSS publication-date helper.
HTML delimiters in JSON-LD are escaped.
The homepage emits `WebSite` and a public-only `ItemList` matching its visible cards.

Unfiltered latest-first batches have their own canonical URLs.
Search, attribute and alternative-sort listings are `noindex, follow`, as are settings, login, administration, history, editing and drafts.
Unknown/error pages are also noindex.
Canonicals, Open Graph and Twitter previews use `https://enstorstark.se`, never the request host.
Public detail previews use the existing compressed detail photo, with a small social logo as fallback.

Detail-page GET/HEAD aliases redirect with HTTP 308 to the encoded stored review slug, preserving the query string.
Visibility is checked before returning a redirect, and redirects happen before coordinate loading.
Canonical detail URLs remain HTTP 200, and POST action-result loads retain their existing behavior.
This is a web-only navigation policy; the native API continues returning its existing JSON responses.

`/sitemap.xml` reads only active public reviews, even for authenticated requests.
It includes the homepage batches, FAQ, map, statistics and review URLs, and uses valid stored modification dates.
Drafts, deleted reviews and unknown publication states are excluded.
It has five-minute public caching and returns no-store on failure.
`robots.txt` advertises the sitemap; robots restrictions are not an access-control mechanism.
Only an absent publication status receives the legacy published fallback.
Persisted null/unknown states remain unknown when serialized and cannot become public structured data in signed-in views.

## Assets, photos and CSP

`static/logo.png` remains the master.
Navigation/footer use `logo-128.webp` (128 pixels, lossless, under 20 KB); `favicon.png` is 32 pixels and `logo-social.png` is a 512-pixel social fallback.
Regenerate these derivatives with the installed Sharp dependency, retaining alpha, using `resize(128).webp({ lossless: true })`, `resize(32).png()`, and `resize(512).png()` respectively.
Font preconnects cover Google Fonts CSS and its anonymous font origin.

Image layout space, eager/high-priority first card, lazy subsequent cards and the sequential preview-to-original upgrade queue are preserved.
Large original photos still download after the previews; this work does not rewrite originals or eliminate that transfer cost.

The nonce-based CSP and consent policy remain intact.
Focused Chromium and Firefox tests cover fresh nonces, hydration, navigation and unset/denied/granted analytics consent with mocked Google delivery.
An error confined to a normal Firefox profile should be investigated in that profile; do not allow unsafe inline scripts or add an unexplained hash to hide it.

## Verification and rollout

Regressions live in the homepage/controller/metadata/sitemap unit suites, `src/routes/review-canonical.test.ts`, and `tests/seo-listing.test.ts` / `tests/seo-csp.test.ts`.
CI installs Chromium and Firefox and runs the focused Firefox checks with the rest of Playwright.
Run `make ci` for the checks and Playwright; `make ci FULL=1` also includes the backup/restore rehearsal.
Inspect phone/desktop layouts in both themes.

Deploy the app through the [normal deployment helper](deployment.md).
No Mongo migration, Mongo recreation, or modification of stored photos is required.
After deployment:

1. Check public HTTP responses, review/photo access and `/recensioner/data` private caching.
2. Inspect raw homepage, `/?page=2` and review HTML for Swedish language, metadata, self canonicals and escaped JSON-LD.
   Check a draft while signed in and confirm noindex.
3. Fetch `/sitemap.xml` and `/robots.txt`; confirm public review links and no private/deleted entries.
4. Scroll through several batches, search for an older review, try nearest sorting and use Back.
   Repeat a clean Firefox check without extensions.
5. In the verified production property in Google Search Console, submit `https://enstorstark.se/sitemap.xml` under **Sitemaps**.
   Inspect the homepage, page 2 and a public review URL.
   Monitor indexing and real-user Core Web Vitals after rollout; submission requires the site owner's Search Console account and does not guarantee indexing or rich results.

### Search Console baseline (2026-11-16)

The three Search Console exports received on 16 November report 27 indexed URLs and 84 excluded URLs, with chart data ending on 13 November.
Their findings are preserved here so the source ZIP files can be removed.

<!-- prettier-ignore -->
| Exclusion | URLs | Assessment |
| --- | ---: | --- |
| Excluded by `noindex` | 20 | Every supplied example is a history page, intentionally excluded by the indexing policy above. |
| Discovered, currently not indexed | 52 | Only the count was supplied; URL examples are needed for diagnosis. |
| Crawled, currently not indexed | 8 | Only the count was supplied; URL examples are needed for diagnosis. |
| Google selected another canonical | 4 | Current public HTML has distinct review content and correct self-canonicals; Google's selected URLs were not supplied. |

<!-- prettier-ignore -->
| Canonical example | Last crawl in export |
| --- | --- |
| `https://enstorstark.se/tyrolen-biergarten` | 2026-11-14 |
| `https://enstorstark.se/paradiset-mariaplan` | 2026-11-14 |
| `https://enstorstark.se/clarion-hotel-post` | 2026-11-06 |
| `https://enstorstark.se/ego-distillers-vastra-hamngatan` | 2026-11-06 |

Public HTTP checks on 16 November found all four canonical examples returning HTTP 200 with `index, follow`, one self-canonical, and distinct review content in the initial HTML.
The sitemap contained 95 URLs, including 88 public reviews reachable through four server-rendered listing pages.
Old HTTPS URLs on `enstorstarkreview.se`, including the four examples and the tested `www` variant, redirected to their matching `enstorstark.se` paths with HTTP 301.
The repository records the canonical-origin migration on 6 November in commit `4c601dc`.
Migration processing is a plausible explanation for some exclusions, but requires confirmation from the site's Search Console account.
[Google's migration guidance](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes) describes processing over several weeks and keeping permanent redirects for at least one year.

A separate confirmed defect served `/tyrolen--biergarten` as HTTP 200 with its own canonical and `noindex` despite loading the Tyrolen review.
The detail-alias redirect policy above fixes that defect; its contribution to the four reported canonical exclusions is unconfirmed.
Keep the original review wording and intentional history exclusions while gathering the missing evidence.

The following owner actions remain pending because no Search Console access or inspection data was supplied:

1. Inspect each of the four canonical examples in the indexed URL Inspection report.
   Record the Google-selected canonical, user-declared canonical, last crawl, page-fetch/indexability results, and fetched/rendered content.
   Compare the original URL and Google's selected URL, including the title, review body and photo.
   Use the indexed report for Google's selected canonical; a live test cannot predict canonical selection, as explained in the [URL Inspection documentation](https://support.google.com/webmasters/answer/9012289?hl=en).
2. Obtain the URL examples for the 52 discovered and 8 crawled exclusions.
   Check their HTTP status, indexability, canonical, sitemap membership, and rendered content.
   Record newly demonstrated defects separately before expanding the code change.
3. Verify both domain properties and confirm that the domain Change of Address was submitted.
   Submit it if outstanding, confirm the new sitemap submission, and retain the old-domain redirects for at least one year.
4. After deployment, repeat the public HTTP and metadata checks, including an alias redirect and its final canonical page.
   Request indexing for the four affected reviews after verification, then recheck weekly for four weeks.
   Track coverage of public reviews separately from the expected history exclusions; Google's final indexing decisions remain external outcomes.

For repeatable performance comparisons, use identical seeded data, viewports, consent, location settings, cache state, image files and network/CPU conditions.
Compare initial HTML bytes, initial card/DOM counts, transferred bytes, FCP/LCP and layout shift.
Local timing measurements describe the fixture and machine, not production field performance.

### Local comparison (2026-10-20)

Compared baseline `5ad51d7` with this change using the same 72 public fixtures, one shared original photo, empty histories, a 1280×844 viewport, Chromium, five alternating runs per build and fresh browser contexts.
Both builds used the same disposable MongoDB and photo directory, disabled location, denied analytics consent, mocked font/analytics delivery and no network/CPU throttling.
Measurements were taken one second after network idle; photo responses were checked for success.
Values below are medians.
Bytes include the enabled original-photo upgrade; repeated photo URLs share browser caching in this fixture, so production transfer will vary with the actual photos.

<!-- prettier-ignore -->
| Metric | Before | After |
| --- | ---: | ---: |
| Initial HTML (decoded bytes) | 240,492 | 95,547 |
| Initial cards | 72 | 24 |
| DOM elements after hydration | 1,817 | 735 |
| Initial transferred bytes | 3,012,989 | 1,815,991 |
| DOMContentLoaded | 308 ms | 252 ms |
| First contentful paint | 904 ms | 516 ms |
| Largest contentful paint | 992 ms | 728 ms |
| Cumulative layout shift | 0 | 0 |

These are local regression measurements, not mobile benchmarks or real-user Core Web Vitals.
