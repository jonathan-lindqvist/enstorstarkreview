---
target: 'Homepage interface: SEO without generic AI design'
total_score: 27
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
target_identity: 'file:/home/jonathan/repos/enstorstarkreview/src/routes/+page.svelte'
target_fingerprint: 'sha256:2cbdff10b989a2845d68cdc781b422cab56b745a83ba7755ad8c2ae1357056c9'
target_path: /home/jonathan/repos/enstorstarkreview/src/routes/+page.svelte
timestamp: 2026-10-21T18-56-41Z
slug: src-routes-page-svelte
---

Method: dual-agent (A: /root/design_review · B: /root/browser_evidence)

**The strongest direction is a local beer journal with useful prices. The opening currently feels more generic than the reviews.** Prioritize getting the existing SEO implementation live, then make the first phone screen show an identifiable bar.

Reviewed the local homepage, review detail and FAQ at phone and desktop sizes in both themes, plus raw production homepage HTML. Development fixture titles and photos were excluded from editorial judgments.

**What works:** the cream/amber palette and typography are coherent; photography and practical beer facts suit the product; the reviews' personal observations give the site a voice worth preserving. The review-card grid serves a real comparison task. Keep these strengths.

**Fix in this order:**

1. **[P1] Get the existing SEO work into production.** The public homepage still declares `lang="en"`, uses the title “En Stor Stark Review”, and lacks canonical, Open Graph and JSON-LD markup. Its sitemap returns HTTP 404. The local branch already supplies Swedish language metadata, descriptive titles, canonicals, structured data and a working sitemap. Complete the normal release checks and deploy that implementation before building more SEO features. Then validate public URLs and submit the sitemap in Search Console. Missing robots metadata alone does not prevent indexing. See [SEO implementation](/home/jonathan/repos/enstorstarkreview/src/lib/seo.ts:57). Suggested follow-up: `$impeccable audit` against the deployed result.

2. **[P1] Shorten the opening and make it specific.** At 390 × 844, the first bar name starts around y935, below the initial screen even after consent is dismissed. The oversized introduction and square photo postpone every useful comparison. The introduction also omits Göteborg and first-hand visits, while “bäst … bäst … kallast” and “snabbt att skumma” sound interchangeable. Replace them with a compact subject heading and one factual sentence, for example:

   > **Barrecensioner och ölpriser – främst i Göteborg**  
   > Vi besöker barer, beställer en stor stark och skriver vad vi tycker.

   Keep search prominent, tighten the surrounding spacing, and retain square photos. Acceptance target: after consent is resolved, show one bar's name, score and price in the first phone screen. See [homepage introduction](/home/jonathan/repos/enstorstarkreview/src/routes/+page.svelte:156). Suggested follow-up: `$impeccable distill` and `$impeccable clarify`.

3. **[P2] Give prices enough context to compare honestly.** Cards show kronor but omit the serving volume already available on detail pages. They also omit when the price was observed; detail dates say “Skapad” and “Uppdaterad”, which describe the record rather than a verified visit. Show known volume beside price, preserve happy-hour qualifications, and collect an actual visit/price-observation date. Never turn a record timestamp into a claimed visit date. Keep unknown information visibly unknown. See [card price row](/home/jonathan/repos/enstorstarkreview/src/lib/components/Card.svelte:112) and [detail dates](/home/jonathan/repos/enstorstarkreview/src/routes/[slug]/+page.svelte:176). Suggested follow-up: `$impeccable clarify` and `$impeccable harden`.

4. **[P2] Request location when it becomes useful.** Location watching starts on arrival; denial text appears even when “Senaste” is selected. This introduces a permissions decision before the visitor has a reason to make it. Request it when they select “Närmast” or “Visa avstånd”, and keep unrelated browsing free of location-error text. Preserve the existing preference and in-memory privacy handling. Suggested follow-up: `$impeccable onboard`.

5. **[P2] Make filter recovery immediate.** Empty results say to clear filters but provide no direct reset action. Selected attributes disappear behind an icon when the panel closes. Give the trigger a visible “Filter” label, summarize active selections, and add “Rensa sökning och filter” to the empty state. Eight familiar, progressively disclosed activity chips are reasonable; recovery and visibility are the problems. See [empty state](/home/jonathan/repos/enstorstarkreview/src/routes/+page.svelte:223). Suggested follow-up: `$impeccable harden`.

**SEO without generic filler:** original observations, photographs, real measurements and clear review methods are the material to emphasize. Google specifically recommends first-hand evidence and useful comparisons in reviews. Preserve the short, funny writing instead of expanding every review into a templated article. Stable pseudonyms and an honest methodology can respect the site's anonymity policy. Sources: [Google's review guidance](https://developers.google.com/search/docs/specialty/ecommerce/write-high-quality-reviews), [content and authorship guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content).

The visual cues that weaken specificity are the superlative headline, self-promotional supporting copy and oversized introductory wrapper. The established cream, amber and restrained glass treatment can remain. These are design judgments; no search penalty was assessed.

**Design health: 27/40 — acceptable, with focused work needed.** Scores cover the inspected public UI, not authenticated editing or production search performance.

| Heuristic        |  /4 | Main finding                                 |
| ---------------- | --: | -------------------------------------------- |
| System status    |   3 | Useful loading/retry states; no result count |
| Real-world match |   3 | Relevant beer facts; unfamiliar /3 scale     |
| User control     |   2 | No combined search/filter reset              |
| Consistency      |   3 | Coherent shared controls                     |
| Error prevention |   3 | Constrained inputs; price context incomplete |
| Recognition      |   3 | Useful cards; icon-only filter               |
| Efficiency       |   3 | Search/sort/restore support repeat visits    |
| Minimalism       |   2 | Introduction dominates phone browsing        |
| Error recovery   |   3 | Good messages; reset requires manual work    |
| Help             |   2 | Rating meanings are distant in FAQ           |

**People most affected:** a distracted phone visitor spends the first screen on introduction and administrative choices; a newcomer cannot quickly confirm geographic coverage or understand “0/3”; a reader with low vision encounters full-review prose at 14px on phones. Raise article prose to 16px and put concise rating guidance near the score.

**Cognitive load and emotional journey:** the default controls are manageable. Five desktop destinations and eight expanded activity choices exceed four options, but are familiar and grouped. The larger burden is consent/location work before any useful bar evidence. The photos, prices and personal notes are the strongest moment. A useful next browsing action would finish a review more naturally than the change-log link alone.

**Smaller fixes:** shorten the analytics explanation while preserving equal choices and access to full details; explain “0/3 = Inget extra” near ratings; keep full article prose at least 16px. Check mobile image transfer before deciding whether original-photo upgrades are worth their bandwidth; no performance trace was taken.

**Detector cross-check:** 12 warnings across routes and components: four `side-tab`, four `border-accent-on-rounded`, two `broken-image`, two `gray-on-color`. Source inspection identified all as false positives: crop/upload-frame corners, Svelte image shorthand, a test regex, and selected-state text classes. Locations: `src/routes/installningar/+page.svelte:21`, `src/routes/seo-assets.test.ts:11`, `src/lib/components/review-wizard/PhotoCropper.svelte:73,80–82`, `WizardPhotoStep.svelte:87–89`, `WizardRatingStep.svelte:120`. None were on the homepage, Card, Navbar or ReviewImage. The important manual findings were copy, hierarchy and deployed SEO parity.

**Questions for a follow-up:**

1. Positioning: **Göteborg-first guide** (recommended), or **broader beer diary**?
2. Scope: **top three priorities** (recommended), **all five**, or **critique only**?
