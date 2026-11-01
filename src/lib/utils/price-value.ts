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
	krPerCl: number;
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
	return { rating: gate?.rating ?? MOST_EXPENSIVE_PRICE_VALUE_RATING, krPerCl, assumedVolume };
};
