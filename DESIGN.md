# DESIGN.md

Design guidance for anyone (human or agent) changing how En stor stark looks or behaves in the
browser. Read it before UI work: new pages, redesigns, layout, typography, colour, motion, copy,
or polish. The [theming implementation](#theming-implementation) at the end says how colours and dark mode
are wired.

The goal is work that looks designed for this product, not assembled from the defaults every
generated interface reaches for.

## The product's visual world

- **What it is:** a small, friendly, slightly tongue-in-cheek review site for bars in and around
  Göteborg, judged by what a large lager costs and how the evening felt. Copy is Swedish.
- **Surfaces:** warm cream background with soft blurred blobs, translucent white "glass" panels
  (`bg-white/70` plus `--color-glass-highlight` / `--color-glass-shadow`), amber as the beer
  accent, slate for text. Light is the default; dark is opt-in and composed separately in
  `src/app.css`, not inverted.
- **Type:** Archivo (`font-serif` utility, headings and display) and IBM Plex Sans (`font-sans`,
  body and UI). Don't add a third family without a role only it can fill.
- **Photography leads.** Review photos are the most distinctive content; give them space and a
  consistent square crop that respects `imageFocusX` / `imageFocusY`.
- **Icons:** Lucide (`@lucide/svelte`) and the local SVG components. One stroke style; never emoji
  or Unicode glyphs as icons.

Refine inside this world. A redesign may change it, but then say so explicitly and update this
section.

## Principles

- **The brief wins.** If the user pins a look, a font, or a palette, honour it even where the rules
  below would choose otherwise.
- **Refinement preserves; redesign replaces.** A refinement keeps identity, behaviour, copy, and
  everything outside its scope. A redesign keeps content, function, and constraints but treats the
  old look as evidence, not as something to polish halfway.
- **Know which kind of page it is.**
  - _Reading_ (review detail, history, FAQ/about): the reader's question leads. Calm column,
    comfortable measure, clear headings; the world frames the column but never performs inside it.
  - _Operating_ (forms, admin, login, map controls): familiarity is a feature. Standard controls,
    consistent affordances, clear states. Brand lives in precise details, not invented widgets.
  - _Browsing_ (home grid, statistics, map): content and photos lead; the interface recedes.
- **Commit.** When torn between a safe, measured version and a committed one that fits the world,
  commit. Timid and generic is the most common failure.
- **Verify in bounded passes.** Build fully, inspect desktop and phone together once, fix
  everything found in one batch, confirm with at most one more round, then stop.

## Avoid

These are the defaults generated UIs fall into. Reaching for one without a reason means you weren't
deciding. Rewrite the element rather than softening it.

Page structure:

- Pages built from rows of same-size cards (icon + heading + text). Cards are the lazy container;
  nested cards are always wrong. Group with proximity and spacing first.
- The hero-metric template: big number, small label, a row of supporting stats, an accent.
- Kicker/eyebrow labels above headings (small uppercase tracked text). The heading carries itself.
- Section numbers (01 / 02 / 03) unless the sequence actually matters to the reader.
- A modal for a task that needs neither interruption nor protected focus.

Surface habits:

- Gradient text. Emphasis comes from weight or size.
- Glass and blur as decoration everywhere. Here glass is the established surface; use it for
  panels, not for every nested element, and never glass on glass.
- Coloured `border-left`/`border-right` thicker than 1px on cards, list items, or callouts.
- Hard offset shadows (`4px 4px 0`). Shadows have an offset and a soft blur; no zero-offset
  coloured halos.
- Both a border and a wide soft shadow on the same element (the "ghost card"). Pick one way to
  show elevation. Card radii stay around 12–16px (`rounded-xl`/`rounded-2xl`; existing large
  panels use `rounded-3xl`); full pills are for small controls.
- Sparklines, progress rings, or soft rounded rectangles standing in for real content.
- Monospace as a "technical" costume. Mono is for code, data, and measurements.
- Sketchy SVG illustration, doodles, or `feTurbulence` grain. Real photos or clean vector
  geometry only.
- Decorative stripes or grid backgrounds without a real map, chart, or plan under them.
- Invented claims or numbers. Illustrative values are labelled as such.

## Typography

- One clear role scale: page title, section heading, body, label/metadata, data. Adjacent roles
  must differ visibly in size or weight; don't ask size alone to do all the work.
- Body text at least 1rem; prose at 65–75ch (45ch is fine on narrow columns).
- Product UI uses a fixed rem scale (ratio about 1.125–1.2), not fluid clamp headings.
- Display headings cap at about 6rem; letter-spacing no tighter than −0.04em (−0.02 to −0.03em
  usually reads better). Use `text-balance` on headings.
- Tabular numerals (`tabular-nums`) for prices, ratings, and columns of numbers.
- Light text on dark surfaces needs slightly more line height and tracking, and sometimes one step
  more weight.
- Test real Swedish copy at every breakpoint, including long bar names and addresses.

## Colour

- Colours are roles, not a bag of swatches: canvas, raised surface, primary/secondary text, action,
  focus, selection, borders, and success/warning/error/info.
- Use palette utilities and `var(--color-*)` only; never hard-code colours (see
  [Theming implementation](#theming-implementation)). A new palette family needs a dark mapping in `app.css`.
- Amber is the accent: primary actions, selection, state, and the beer-specific moments. Don't
  scatter it as decoration or put saturated accents on inactive states.
- Gray text on a coloured surface looks washed out. Derive secondary text from that surface's hue
  instead (e.g. `text-amber-900/80` on amber).
- Contrast: body text ≥ 4.5:1, large text ≥ 3:1, icons, controls, and focus rings ≥ 3:1. Check
  both themes and text over photos.
- Never use colour as the only signal; pair it with text, shape, or position.

## Layout and spacing

- Squint test: with detail blurred, the primary element, the secondary element, and the major
  groups should still read in order.
- Tight within groups, generous between them, more space above a heading than below it. Rhythm
  comes from contrast between intervals, not one value repeated everywhere.
- Use Tailwind's spacing scale; prefer `gap` for sibling rhythm.
- Responsive changes are structural (reorder, stack, collapse), and DOM/focus order must match the
  visual order. Keep touch targets usable even when the visible mark is small.
- Reuse the same component vocabulary across pages: one button shape per role, one form-control
  style, one icon style. If "save" looks different in two places, one is wrong.

## Motion

- Motion explains state, feedback, or continuity. No page-load choreography, and not the same
  fade-and-rise on every section.
- Timing: 100–150 ms for feedback, 150–300 ms for state changes, 300–500 ms for overlays/layout.
  Exits are faster than entrances. Ease out (`cubic-bezier(0.16, 1, 0.3, 1)`); no bounce or
  elastic.
- Content is visible by default; animation never hides it if scripts fail.
- Animate transform and opacity, not layout properties. Every animation has a
  `prefers-reduced-motion` path that removes movement but keeps meaningful feedback.

## States and details

- Every interactive element has default, hover, focus-visible, active, and disabled states; forms
  also need loading, error, and success. Empty states explain what to do next.
- Errors name the problem and the fix, in Swedish. Buttons name their action ("Publicera
  recension", not "OK").
- Browser surfaces are part of the design: focus rings, text selection, caret, link underline
  offset, and numerals in data come from the palette, not browser defaults.
- Images reserve their aspect ratio (no layout shift) and have useful `alt` text.
- Dropdowns and popovers must escape `overflow: hidden` ancestors (`<dialog>`, popover API, or
  fixed positioning).

## Making things quieter

When something feels loud: lower saturation, fewer bold elements competing, thinner or no
borders, less motion, smaller scale jumps. Keep hierarchy, some colour, and personality: quiet is
not grey, flat, or uniformly small.

## Theming implementation

Light/dark mode is driven entirely by CSS variables in `src/app.css`. Light is always the default; dark mode is opt-in through the navbar toggle (never the OS preference) and is remembered in the `theme` cookie. `hooks.server.ts` renders `<html data-theme="light|dark">` from that cookie (parsed by `src/lib/theme.ts`, which also owns the toggle and theme-change events) so the first paint never flashes. `color-scheme` selects the branch of each `light-dark()` palette override in `@theme static`. Keep using ordinary palette utilities (`bg-white/70`, `text-slate-600`, `bg-amber-100 text-amber-950`); `white` is the glass surface colour and the used palette families are remapped for dark mode. Do not hard-code colours in `<style>` blocks or arbitrary values. Use `var(--color-*)`, and `--color-glass-highlight` / `--color-glass-shadow` for glass shadows. Reach for the `dark:` variant only when markup must differ per theme. Adding a new palette family means adding its dark mapping in `app.css`.

The shared component vocabulary also lives in `app.css` as utilities: `glass-panel` for raised surfaces, `field`, `field-label`, `field-help`, and `field-error` for form controls, `btn` with `btn-primary` or `btn-secondary` for buttons and button-styled links, and `chip` with `chip-on` / `chip-off` for toggles. Use them instead of restating the classes, and change them there when the look should change everywhere.

## Verify before finishing

Check the built result, not the intention, at phone (~375px) and desktop widths, in light and
dark mode:

- contrast in every state, including text on photos;
- headings, prices, and long names don't overflow or wrap badly;
- spacing groups related content and separates distinct groups;
- keyboard focus is visible and tab order follows the visual order;
- hover, disabled, loading, error, and empty states exist where relevant;
- nothing from **Avoid** slipped in without a reason.

Then run the normal verification in [AGENTS.md](AGENTS.md#verification).
