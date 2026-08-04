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
