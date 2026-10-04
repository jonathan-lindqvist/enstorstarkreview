import { isValidBeerPriceKr } from '$lib/utils/price';
import type { PriceComparisonPoint } from '$lib/types/price-comparison';

export const MIN_VALUE_RATING = 0;
export const MAX_VALUE_RATING = 5;

export interface LinearTrend {
	slope: number;
	intercept: number;
}

const isValueRating = (value: unknown): value is number =>
	typeof value === 'number' &&
	Number.isFinite(value) &&
	value >= MIN_VALUE_RATING &&
	value <= MAX_VALUE_RATING;

export const toPriceComparisonPoint = (value: {
	title?: unknown;
	slug?: unknown;
	beerPriceKr?: unknown;
	isHappyHourPrice?: unknown;
	price?: unknown;
}): PriceComparisonPoint | null => {
	if (typeof value.title !== 'string' || typeof value.slug !== 'string') return null;
	if (!isValidBeerPriceKr(value.beerPriceKr as number | null | undefined)) return null;

	return {
		title: value.title,
		slug: value.slug,
		beerPriceKr: value.beerPriceKr as number,
		isHappyHourPrice: value.isHappyHourPrice === true,
		valueRating: isValueRating(value.price) ? value.price : null
	};
};

// Least-squares fit of value rating against price; null without at least three
// rated prices spread over more than one price point.
export const fitValueTrend = (points: PriceComparisonPoint[]): LinearTrend | null => {
	const rated = points.filter(
		(point): point is PriceComparisonPoint & { valueRating: number } => point.valueRating !== null
	);
	if (rated.length < 3) return null;

	const meanX = rated.reduce((sum, point) => sum + point.beerPriceKr, 0) / rated.length;
	const meanY = rated.reduce((sum, point) => sum + point.valueRating, 0) / rated.length;
	let covariance = 0;
	let varianceX = 0;
	for (const point of rated) {
		covariance += (point.beerPriceKr - meanX) * (point.valueRating - meanY);
		varianceX += (point.beerPriceKr - meanX) ** 2;
	}
	if (varianceX === 0) return null;

	const slope = covariance / varianceX;
	return { slope, intercept: meanY - slope * meanX };
};

export const predictValueRating = (trend: LinearTrend, price: number): number =>
	Math.min(MAX_VALUE_RATING, Math.max(MIN_VALUE_RATING, trend.intercept + trend.slope * price));
