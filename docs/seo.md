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
Archivo and IBM Plex Sans are served locally from the licensed Latin and Latin Extended WOFF2 subsets in `src/lib/fonts/`.
The layout preloads the two Latin font resources, with `font-display: swap` and the original weight ranges.
Font CSS and files are fingerprinted by Vite; no external font stylesheet is needed to render text.

Rating mugs use transparent lossless WebP derivatives at 128, 256, 512 and 768 pixels, generated from the PNG masters with `node scripts/generate-rating-glass.js`.
Each usage supplies its displayed size so the browser can select a sharp source for the device density.
The 128-pixel card artwork is below 15 KB per state; a pixel regression compares every derivative with the resized master on light and dark backgrounds.
The wizard still decodes all three mounted states before enabling cycling.

Review photos use bounded quality-90 WebP presets at 480, 768, 1280, 1920 and 2560 pixels without enlarging originals.
`ReviewImage` emits responsive candidates and layout sizes in the initial HTML.
The browser helper corrects the effective slot width for landscape photos enlarged to cover a square, observing later layout changes without restarting unchanged loads.
Image focus, reserved square space, the eager/high-priority first card and lazy subsequent cards are preserved.
The detail photo is a keyboard-accessible link opening its original in a new tab, with a Swedish accessible label and visible focus.
Originals are fetched on that explicit action or once as a fallback after a derivative fails; successful derivatives never automatically upgrade to originals.
No original photo is rewritten.
The legacy preview encodings retain their immutable URLs and bytes; version-2 derivatives use separate disk cache entries under `previews/v2`.
The [image security guide](agents/security.md#images) owns authorization and processing limits for both web and API requests.

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

### Mobile asset comparison (2026-11-16)

Compared baseline `baabf19` with the responsive-photo, lossless-mug and local-font changes using the same snapshot of 24 public reviews and unchanged original photos in an isolated development database.
Lighthouse 13.0.0 used Chromium 143.0.7499.4, its default Moto G Power mobile emulation (412×823, density 1.75), simulated slow 4G and 4× CPU slowdown.
Three runs alternated between the two production builds with fresh browser storage, unset analytics consent and the default location preference.
Google Analytics collection requests were blocked in both builds, while the Google tag script remained enabled.
Both builds ran behind the same temporary HTTPS/HTTP2 proxy with gzip text compression to match production delivery; direct uncompressed adapter-node measurements are not comparable with production.
Image responses were verified as successful before measurement.
The recorded values are medians, not the earlier diagnostic substitution timings or the supplied PageSpeed screenshot.

<!-- prettier-ignore -->
| Metric | Before | After | Target |
| --- | ---: | ---: | ---: |
| Performance score | 75 | 94 | ≥90 |
| First contentful paint | 1.80 s | 1.31 s | ≤1.8 s |
| Largest contentful paint | 5.91 s | 3.03 s | ≤2.5 s |
| Total blocking time | 161 ms | 93 ms | ≤200 ms |
| Cumulative layout shift | 0.0303 | 0.0302 | ≤0.01 |
| Transferred bytes | 6,884,437 | 984,392 | — |

LCP and layout shift remain above their targets in this fixture.
The shift report attributes movement to the review grid when the browser's denied-location message appears, an existing behavior retained by this asset change.
The two small rating artworks now transfer about 17 KB together instead of approximately 756 KB, with identical visible pixels after resizing the masters.
The browser regressions cover photo selection at densities 1, 2 and 3, landscape cover magnification, JavaScript-disabled rendering, original links and derivative failure recovery.
Phone and desktop checks retain both themes, font families, crop positions and rating transparency.
Repeat the three-run public mobile audit after the normal production deployment; local results do not guarantee a PageSpeed score or real-user Core Web Vitals.

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
