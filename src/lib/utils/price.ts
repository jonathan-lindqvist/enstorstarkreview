export const MAX_BEER_PRICE_KR = 999;
export const HAPPY_HOUR_PRICE_NOTE = '* happy hour';

export interface BeerPriceDisplay {
	text: string;
	note: string | null;
}

export const isValidBeerPriceKr = (value: number | null | undefined): value is number => {
	return (
		typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_BEER_PRICE_KR
	);
};

export const formatBeerPrice = (
	beerPriceKr: number | null | undefined,
	isHappyHourPrice = false
): string | null => {
	if (!isValidBeerPriceKr(beerPriceKr)) return null;
	return `${beerPriceKr} kr${isHappyHourPrice ? '*' : ''}`;
};

export const getBeerPriceDisplay = (
	beerPriceKr: number | null | undefined,
	isHappyHourPrice = false
): BeerPriceDisplay | null => {
	const text = formatBeerPrice(beerPriceKr, isHappyHourPrice);
	if (!text) return null;

	return {
		text,
		note: isHappyHourPrice ? HAPPY_HOUR_PRICE_NOTE : null
	};
};
