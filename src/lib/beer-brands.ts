// Logos are light beige 256×256 squares in static/beer-brands/, made with support/beer-logos.
export const BEER_BRAND_OPTIONS = [
	{ brand: 'Norrlands Guld Export', image: 'norrlands-guld-export.webp' },
	{ brand: 'Falcon Export', image: 'falcon-export.webp' },
	{ brand: 'Mariestads Export', image: 'mariestads-export.webp' },
	{ brand: 'Pripps Blå Export', image: 'pripps-bla-export.webp' },
	{ brand: 'Eriksberg Original', image: 'eriksberg-original.webp' },
	{ brand: 'Eriksberg Karaktär', image: 'eriksberg-karaktar.webp' },
	{ brand: 'Åbro Original', image: 'abro-original.webp' },
	{ brand: 'Sofiero Original', image: 'sofiero-original.webp' },
	{ brand: 'Spendrups Premium Gold', image: 'spendrups-premium-gold.webp' },
	{ brand: 'Carlsberg Export', image: 'carlsberg-export.webp' },
	{ brand: 'Heineken', image: 'heineken.webp' },
	{ brand: 'Staropramen', image: 'staropramen.webp' },
	{ brand: 'Grängesberg', image: 'grangesberg.webp' },
	{ brand: 'Ey’Bro', image: 'ey-bro.webp' },
	{ brand: 'Melleruds Utmärkta Pilsner', image: 'melleruds-utmarkta-pilsner.webp' }
] as const;

export type BeerBrand = (typeof BEER_BRAND_OPTIONS)[number]['brand'];

export const BEER_BRANDS: readonly BeerBrand[] = BEER_BRAND_OPTIONS.map(({ brand }) => brand);

export const OTHER_BEER_BRAND_VALUE = '__other_beer__';
export const OTHER_BEER_BRAND_LABEL = 'Annan öl';
export const UNKNOWN_BEER_BRAND_LABEL = 'Öl ej angiven';
export const MAX_BEER_BRAND_LENGTH = 100;

export const isListedBeerBrand = (value: string): value is BeerBrand =>
	BEER_BRANDS.some((brand) => brand === value);

export const beerBrandImage = (brand: string): string | null => {
	const option = BEER_BRAND_OPTIONS.find((candidate) => candidate.brand === brand);
	return option ? `/beer-brands/${option.image}` : null;
};
