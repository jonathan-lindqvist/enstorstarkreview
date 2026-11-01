import { isValidBeerVolumeCl } from '$lib/utils/beer-value';
import { isValidBeerPriceKr } from '$lib/utils/price';
import type { PriceComparisonPoint } from '$lib/types/price-comparison';

export const MIN_VALUE_RATING = 0;
export const MAX_VALUE_RATING = 5;

const isValueRating = (value: unknown): value is number =>
	typeof value === 'number' &&
	Number.isFinite(value) &&
	value >= MIN_VALUE_RATING &&
	value <= MAX_VALUE_RATING;

export const toPriceComparisonPoint = (value: {
	title?: unknown;
	slug?: unknown;
	beerPriceKr?: unknown;
	beerVolumeCl?: unknown;
	isHappyHourPrice?: unknown;
	price?: unknown;
}): PriceComparisonPoint | null => {
	if (typeof value.title !== 'string' || typeof value.slug !== 'string') return null;
	if (!isValidBeerPriceKr(value.beerPriceKr as number | null | undefined)) return null;

	return {
		title: value.title,
		slug: value.slug,
		beerPriceKr: value.beerPriceKr as number,
		...(isValidBeerVolumeCl(value.beerVolumeCl) && { beerVolumeCl: value.beerVolumeCl }),
		isHappyHourPrice: value.isHappyHourPrice === true,
		valueRating: isValueRating(value.price) ? value.price : null
	};
};

// Least-squares fit of value rating against price; null without at least three
// rated prices spread over more than one price point.
