import type { PriceComparisonPoint } from '$lib/types/price-comparison';
import { isValidBeerVolumeCl } from './beer-value';
import { isValidBeerPriceKr } from './price';

export const ASSUMED_BEER_VOLUME_CL = 40;

// Upper kr/cl limits, exclusive, fitted to published reviews in November 2026.
export const PRICE_VALUE_GATES = [
	{ rating: 5, belowKrPerCl: 1.15 },
	{ rating: 4, belowKrPerCl: 1.6 },
	{ rating: 3, belowKrPerCl: 1.755 },
	{ rating: 2, belowKrPerCl: 2.255 },
	{ rating: 1, belowKrPerCl: 2.605 }
] as const;
const MOST_EXPENSIVE_PRICE_VALUE_RATING = 0;

export interface PriceValueSuggestion {
	rating: number;
	clPerKr: number;
	assumedVolume: boolean;
}

const isBlank = (value: unknown) =>
	value === null || value === undefined || String(value).trim() === '';

export const suggestPriceValue = (
	price: string | number | null | undefined,
	volume: string | number | null | undefined
): PriceValueSuggestion | null => {
	const priceKr = isBlank(price) ? null : Number(price);
	const assumedVolume = isBlank(volume);
	const volumeCl = assumedVolume ? ASSUMED_BEER_VOLUME_CL : Number(volume);
	if (!isValidBeerPriceKr(priceKr) || !isValidBeerVolumeCl(volumeCl)) return null;

	const krPerCl = priceKr / volumeCl;
	const gate = PRICE_VALUE_GATES.find(({ belowKrPerCl }) => krPerCl < belowKrPerCl);
	return {
		rating: gate?.rating ?? MOST_EXPENSIVE_PRICE_VALUE_RATING,
		clPerKr: volumeCl / priceKr,
		assumedVolume
	};
};

export interface PriceValueBar {
	point: PriceComparisonPoint;
	clPerKr: number;
	gateRating: number;
	valueRating: number;
	distance: number;
	assumedVolume: boolean;
}

export interface PriceValueGateSummary {
	rating: number;
	aboveClPerKr: number;
	atMostClPerKr: number | null;
	count: number;
	exact: number;
}

const toPriceValueBar = (point: PriceComparisonPoint): PriceValueBar | null => {
	// Gates are fitted to regular prices.
	if (point.isHappyHourPrice || point.valueRating === null) return null;
	const suggestion = suggestPriceValue(point.beerPriceKr, point.beerVolumeCl);
	if (!suggestion) return null;
	return {
		point,
		clPerKr: suggestion.clPerKr,
		gateRating: suggestion.rating,
		valueRating: point.valueRating,
		distance: Math.abs(suggestion.rating - point.valueRating),
		assumedVolume: suggestion.assumedVolume
	};
};

export const comparePriceValues = (points: PriceComparisonPoint[]) => {
	const bars = points.map(toPriceValueBar).filter((bar) => bar !== null);
	// Reciprocals turn exclusive upper price limits into exclusive lower value limits.
	const limits = [null, ...PRICE_VALUE_GATES.map(({ belowKrPerCl }) => 1 / belowKrPerCl), 0];
	const ratings = [
		...PRICE_VALUE_GATES.map(({ rating }) => rating),
		MOST_EXPENSIVE_PRICE_VALUE_RATING
	];
	const gates: PriceValueGateSummary[] = ratings.map((rating, index) => {
		const inGate = bars.filter(({ gateRating }) => gateRating === rating);
		return {
			rating,
			aboveClPerKr: limits[index + 1] ?? 0,
			atMostClPerKr: limits[index],
			count: inGate.length,
			exact: inGate.filter(({ distance }) => distance === 0).length
		};
	});
	return { bars, gates };
};
