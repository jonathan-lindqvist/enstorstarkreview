export const BEER_BRANDS = [
	'Carlsberg Export',
	'Eriksberg Karaktär',
	'Eriksberg Original',
	'Ey’Bro',
	'Falcon Export',
	'Grängesberg',
	'Heineken',
	'Mariestads Export',
	'Melleruds Utmärkta Pilsner',
	'Norrlands Guld Export',
	'Pripps Blå Export',
	'Sofiero Original',
	'Spendrups Premium Gold',
	'Staropramen',
	'Åbro Original'
] as const;

export const OTHER_BEER_BRAND_VALUE = '__other_beer__';
export const OTHER_BEER_BRAND_LABEL = 'Annan öl';
export const UNKNOWN_BEER_BRAND_LABEL = 'Öl ej angiven';
export const MAX_BEER_BRAND_LENGTH = 100;

export const isListedBeerBrand = (value: string): value is (typeof BEER_BRANDS)[number] =>
	BEER_BRANDS.some((brand) => brand === value);
