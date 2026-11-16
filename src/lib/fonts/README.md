# Local web fonts

These are the original Google Fonts WOFF2 Latin and Latin Extended subsets, downloaded on 16 November 2026.
Archivo v25 retains weights 500–800 and IBM Plex Sans v23 retains weights 400–700, both at their normal width.
The Latin subsets include Swedish letters, and Extended subsets load when needed for other supported Latin characters.
The accompanying SIL Open Font License files preserve the original copyright notices and redistribution terms.

`fonts.css` retains the upstream Unicode ranges and `font-display: swap`.
The app stylesheet imports it, and the root layout preloads the two Latin resources through Vite URLs.
Vite fingerprints the font assets for caching.

Sources: [Google Fonts CSS](https://fonts.googleapis.com/css2?family=Archivo:wght@500..800&family=IBM+Plex+Sans:wght@400..700&display=swap), [Archivo license](https://github.com/google/fonts/blob/main/ofl/archivo/OFL.txt), and [IBM Plex Sans license](https://github.com/google/fonts/blob/main/ofl/ibmplexsans/OFL.txt).
