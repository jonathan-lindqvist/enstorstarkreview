export const BEER_BRANDS = [
	'Norrlands Guld Export',
	'Falcon Export',
	'Mariestads Export',
	'Pripps Blå Export',
	'Eriksberg Original',
	'Eriksberg Karaktär',
	'Åbro Original',
	'Sofiero Original',
	'Spendrups Premium Gold',
	'Carlsberg Export',
	'Heineken',
	'Staropramen',
	'Grängesberg',
	'Ey’Bro',
	'Melleruds Utmärkta Pilsner'
] as const;

export const OTHER_BEER_BRAND_VALUE = '__other_beer__';
export const OTHER_BEER_BRAND_LABEL = 'Annan öl';
export const UNKNOWN_BEER_BRAND_LABEL = 'Öl ej angiven';
export const MAX_BEER_BRAND_LENGTH = 100;

export const isListedBeerBrand = (value: string): value is (typeof BEER_BRANDS)[number] =>
	BEER_BRANDS.some((brand) => brand === value);

// Logos on light beige 256×256 squares, made with support/beer-logos.
export const BEER_BRAND_IMAGES: Partial<Record<(typeof BEER_BRANDS)[number], string>> = {
	'Norrlands Guld Export': '/beer-brands/norrlands-guld-export.webp',
	'Falcon Export': '/beer-brands/falcon-export.webp',
	'Mariestads Export': '/beer-brands/mariestads-export.webp',
	'Pripps Blå Export': '/beer-brands/pripps-bla-export.webp',
	'Eriksberg Original': '/beer-brands/eriksberg-original.webp',
	'Eriksberg Karaktär': '/beer-brands/eriksberg-karaktar.webp',
	'Åbro Original': '/beer-brands/abro-original.webp',
	'Sofiero Original': '/beer-brands/sofiero-original.webp',
	'Spendrups Premium Gold': '/beer-brands/spendrups-premium-gold.webp',
	'Carlsberg Export': '/beer-brands/carlsberg-export.webp',
	Heineken: '/beer-brands/heineken.webp',
	Staropramen: '/beer-brands/staropramen.webp',
	Grängesberg: '/beer-brands/grangesberg.webp',
	'Ey’Bro': '/beer-brands/ey-bro.webp',
	'Melleruds Utmärkta Pilsner': '/beer-brands/melleruds-utmarkta-pilsner.webp'
};

export const beerBrandImage = (brand: string): string | null =>
	isListedBeerBrand(brand) ? (BEER_BRAND_IMAGES[brand] ?? null) : null;
