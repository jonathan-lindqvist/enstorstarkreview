# Beer logos

Fits the beer logos onto light beige (`#fefaf0`) 256×256 WebP squares with a 10% margin for the app's beer picker.
Transparent or plain-coloured borders already in the source are trimmed first, so every
logo gets the same margin.

## Source requirements

Every logo ends up as a beige square with the same margin, so the sources have to be strict for
the set to look uniform:

- **Transparent background.** Remove any background or plate around the logo. The converter
  trims transparent edges and centres what is left, so stray pixels or shadows throw off the fit.
- **Works on a light background.** The logo is placed on light beige, so a white or very light
  logo disappears. Use the brand's dark or full-colour version.

## Usage

- `sources/` holds the full-size, background-removed originals. Name each file after the brand's
  image in `src/lib/beer-brands.ts` (for example `pripps-bla-export.png`).
- `uv run convert.py` writes the results to `output/` (ignored by Git). Existing outputs are
  skipped; add `--overwrite` to rebuild them all.
- Check the results, then copy the ones you want to `static/beer-brands/` by hand.

Options: `--size 256`, `--quality 90`, `--margin 10` (% per side), `--background "#fefaf0"`, `--no-trim`, `--lossless`,
`--overwrite`. Run `uv run convert.py --help` for details. A new brand also needs an entry in
`BEER_BRAND_OPTIONS` in `src/lib/beer-brands.ts`.
