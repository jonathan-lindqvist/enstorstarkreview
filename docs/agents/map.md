# Map

Rules for `/karta`: geocoding, map data, distance sorting, and the browser map client.
Part of the agent guidance in [AGENTS.md](../../AGENTS.md).

## Map data and geocoding

`/karta` uses MapLibre GL JS with OpenFreeMap's keyless Liberty style, or its `dark` style while dark mode is active; the map swaps styles live on a theme change, which keeps the DOM-based review and location markers.
The server-only `server/review-map.ts` composes one process-wide service from `server/map/`: address matching, Nominatim transport, geocode storage, marker loading, and coordination.
Marker loading queries only `PUBLIC_REVIEW_FILTER` reviews, matches normalized addresses against persisted `map_geocodes`, and serializes only the fields the client needs.
Include a review's valid `beerPriceKr` and `isHappyHourPrice` in its marker, but omit invalid prices without dropping the marker.
Resolved coordinates are retained permanently; current-strategy `not_found` results retry after 30 days and temporary failures after one hour.
Geocodes use strategy version 2: older negative entries may bypass their old `retryAt` once, but resolved entries must never be reconsidered.
The 24-hour in-process marker-list cache rebuilds from MongoDB on expiry—it must never trigger a bulk Nominatim refresh.
After the map becomes interactive, a signed-in editor can POST to `/karta/next-marker`, which resolves at most one uncached public address; anonymous visitors may view cached markers but must never trigger geocoding.
The endpoint requires `locals.user` and checks the request origin.
Draft creation or draft edits must not invalidate this cache.

Every address lookup first sends the exact saved address.
Only after a zero-result response may strategy version 2 remove a supported standalone street-type word immediately before the final house number in the first comma segment.
The fallback requests at most five address-layer results with address details and accepts only a strict road, house-number, locality, and supplied-postcode match.
At most two requests are made per address attempt, and both go through the same process-wide single-flight Nominatim limiter with at least one second between requests.
Transport or API failures remain `failed` and must not trigger the relaxed fallback.
A successful lookup invalidates the map cache.

## Distance sorting and display

Home sorting defaults to `Senaste`; the web-only `sort=nearest` option orders valid Haversine distances first, with newest-first ties and unknown distances last.
Keep the API sort contract unchanged.
Home and detail loaders read saved resolved coordinates only after authorizing reviews, return them separately from review fields, and tolerate missing or failed lookups.
Reuse the read-only lookup under `server/map/` for map markers; page loads must never trigger geocoding.
Show Swedish one-decimal kilometres with the Lucide Route icon and an accessible straight-line explanation.
Request location on home and direct detail visits only when enabled in `/installningar`, dispose watchers on teardown, and keep visitor coordinates in page memory only.
Errors or disabling location clear distances, fall back to newest-first ordering without changing the selected nearest option, and remain non-blocking.
Disabled nearest sorting links to settings rather than displaying a loading message.

## Map client and location

`/karta` is a dedicated viewport-height screen below the shared navigation; the layout omits the footer only for this route.
`ReviewMap.svelte` fills its parent, accepts optional `controls` and `messages` snippets for the compact heading/filters and page status messages, and stacks map/location errors with those messages in a bounded, keyboard-focusable scroll region below the fixed controls.
`BarAttributeFilters` uses its opt-in `floating` presentation here: a native auto popover with bounded scrolling, light dismiss and Escape focus restoration.
Home retains the default inline presentation.
Keep the map size and camera unchanged when filters open, close or change.
A disposable `ResizeObserver` updates MapLibre when its container changes size.
MapLibre's attribution control sits at the top-right below the zoom buttons, with bounded width for expanded credits.
The selected preview stays one rem above the bottom safe area, independently of attribution expansion.
Preview titles are limited to two visible lines, retaining the full accessible text and a title tooltip.
On short screens, scroll preview metadata while keeping its close and review actions visible.
Escape dismisses the topmost filter/menu before the preview.
Respect safe areas and keep attribution accessible without covering the preview.
Browser regressions live in `tests/page-layout.test.ts`.

The selected review's overall rating uses `RatingGlass` without a visible number; zero renders no mug.
Keep the accessible rating value and all existing preview scrolling and focus behavior.

## Sun and shade

The web-only `Sol/skugga` mode is off by default and calculates estimated building shadows from the existing OpenFreeMap tiles, without a paid service or API key.
`review-map/SunControls.svelte` owns the native time popover and page-memory selection.
The closed control shows `Idag` or the selected day/month above the time, including the year when it differs from the current Stockholm year.
Dates and times use `Europe/Stockholm`; the five-minute slider follows the actual 23-, 24-, or 25-hour day and displays the offset to distinguish repeated autumn times.
Changing the date preserves wall time, choosing the first repeated time or the next valid spring time.
`Nu` resumes minute-by-minute live updates while the page is visible.
The shadow mode never changes the camera, filters, selected marker, or bottom preview spacing.

`review-map/sun-shadows.ts` loads only when enabled and owns the disposable calculation worker, map source, layer, and listeners.
Slider input and map movement request live frames at most ten times per second, retaining the last shadow while the next frame is calculated.
One reusable worker runs one job at a time, publishes completed frames in order, and takes only the latest pending time and viewport next.
Time-only frames reuse admitted geometry in the controller and worker; only a new revision or a replacement worker receives a full snapshot.
Camera movement, building source data, style changes, and visibility restoration invalidate the controller snapshot; disablement and teardown release both caches.
`utils/sun-shadow-buildings.ts` admits finite Polygon/MultiPolygon geometry and valid `render_height` / `render_min_height` values before expensive work.
It accepts at most 5,000 fragments and 100,000 vertices; invalid buildings make the result partial instead of inventing heights.
These quotas apply to the complete snapshot before viewport filtering.
The worker uses SunCalc 2.1.3's north-based degree angles and clipper-lib 6.4.2 to project footprint and wall faces onto flat ground, preserve courtyards, merge overlaps, and clip to the viewport.
Union and viewport clipping use local integer millimetres before converting back to map coordinates, keeping shared building edges stable during live time changes.
Before generating faces, the worker excludes footprints whose swept shadow bounds cannot reach the viewport, accounting for both building heights and the current sun direction so offscreen buildings can still cast into view.
Worker startup has a separate ten-second deadline; the two-second calculation budget begins when the worker starts its job.
The controller terminates exhausted work, discards replies from canceled jobs, ignores its own source events, and removes stale geometry on errors, zoom-out, or disablement.
Style swaps recreate the overlay with the current theme colour.
Already loaded building fragments remain usable while more map tiles arrive; new fragments trigger another frame and incomplete coverage is marked partial.

Shadows render from zoom 15; night, solar elevations below 3°, missing data, and exhausted limits have separate Swedish feedback.
Only loaded building tiles contribute, so map-edge coverage and mapped heights can be incomplete.
Terrain, trees, awnings, weather, terrace locations, and automatic sunny-bar labels are outside this model.
Coordinates, selected dates, and calculated shadows stay in page memory and workers.
The calculation scripts are bundled locally and use the existing map tiles without any additional service requests.
Unit regressions live beside the building admission, time, geometry, and controller helpers; browser coverage lives in `tests/sun-shadows.test.ts`.
The browser regression asserts zero outgoing network requests during slider changes after initial loading.

## Location privacy and markers

The shared location helper enforces the browser's `location_enabled` cookie before registering `watchPosition`: missing means enabled, `true` enables, and every other value disables.
Settings changes stop active watchers, ignore late callbacks, and clear the map location marker.
Re-enabling resumes mounted consumers without changing the map's first-fix camera rules.
Browser permission is separate.
The explicit review-form location action also respects this preference.

The map starts centered on Göteborg at zoom 12.5 and must never fit or recenter to review markers.
On mount, home, detail, and map pages use the shared `client/user-location.ts` browser `watchPosition` helper with `enableHighAccuracy: false`, `maximumAge: 15000`, and `timeout: 10000`; there is deliberately no fixed polling interval or location button.
The first valid fix may center the camera once without changing zoom, bearing, or pitch, unless the visitor interacted with the map first.
Subsequent fixes move only a pointer-transparent blue dot and accuracy circle.
Never send current coordinates to the application backend, Nominatim, logs, analytics, cookies, or browser storage; OpenFreeMap still receives normal tile requests for the viewed area.
Clear the watcher, location marker, and listeners when the component is destroyed, and keep permission and lookup errors non-blocking and in Swedish.

Review markers use a fixed 2-rem outer positioner for MapLibre's `transform`; it must not have a transform transition.
Apply hover and selected transforms only to the inner button so markers cannot lag during map movement.
A valid beer price is an always-visible, pointer-transparent label to the right of the button (`65 kr`, or `65 kr*` with a happy-hour tooltip/accessibility note).
The button remains the only clickable and focusable element.
Raise the positioner's stacking order for hover, focus, and selection, but do not let focus styling leave the price in its selected color after the preview closes.
`ReviewMap.svelte` must import `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` and call `setWorkerUrl` before constructing the map; this makes Vite bundle the worker and its MapLibre dependencies, avoiding missing worker-module assets in development and production.
Keep MapLibre CSS bundled locally and retain the OpenFreeMap and worker CSP allowances in `svelte.config.js`.
Do not restore a resolved/total map counter: an invalid or unmatched address may legitimately never receive a marker.
