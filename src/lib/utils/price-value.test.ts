import { describe, expect, it } from 'vitest';
import { comparePriceValues, suggestPriceValue } from './price-value';

describe('suggestPriceValue', () => {
	it.each([
		[45, 40, 5],
		[46, 40, 4],
		[63, 40, 4],
		[64, 40, 3],
		[70, 40, 3],
		[71, 40, 2],
		[90, 40, 2],
		[91, 40, 1],
		[104, 40, 1],
		[105, 40, 0]
	])('maps %i kr for %i cl to %i', (price, volume, rating) => {
		expect(suggestPriceValue(price, volume)?.rating).toBe(rating);
	});

	it('reads form strings and reports kr per cl', () => {
		expect(suggestPriceValue('55', '50')).toEqual({
			rating: 5,
			krPerCl: 1.1,
			assumedVolume: false
		});
	});

	it('assumes 40 cl when the volume is blank', () => {
		expect(suggestPriceValue('60', '')).toEqual({ rating: 4, krPerCl: 1.5, assumedVolume: true });
		expect(suggestPriceValue(60, null)?.assumedVolume).toBe(true);
	});

	it.each([
		['', 40],
		[undefined, 40],
		[0, 40],
		[1000, 40],
		['abc', 40],
		[60, 0],
		[60, 201],
		[60, 'abc'],
		[60, 33.5]
	])('gives no suggestion for price %s and volume %s', (price, volume) => {
		expect(suggestPriceValue(price, volume)).toBeNull();
	});
});

describe('comparePriceValues', () => {
	const point = (title: string, price: number, volume: number | null, rating: number | null) => ({
		title,
		slug: title,
		beerPriceKr: price,
		beerVolumeCl: volume,
		isHappyHourPrice: false,
		valueRating: rating
	});

	it('places bars in gates and measures the rating distance', () => {
		const { bars, gates } = comparePriceValues([
			point('Rätt', 55, 40, 4),
			point('Nära', 55, null, 3),
			point('Långt', 110, 40, 2)
		]);
		expect(bars.map(({ gateRating, distance }) => [gateRating, distance])).toEqual([
			[4, 0],
			[4, 1],
			[0, 2]
		]);
		expect(bars[1].assumedVolume).toBe(true);
		expect(gates.find(({ rating }) => rating === 4)).toEqual({
			rating: 4,
			fromKrPerCl: 1.15,
			belowKrPerCl: 1.6,
			count: 2,
			exact: 1
		});
		expect(gates.at(-1)).toMatchObject({ rating: 0, belowKrPerCl: null, count: 1, exact: 0 });
	});

	it('leaves out happy hour prices and unrated bars', () => {
		const { bars } = comparePriceValues([
			{ ...point('Happy', 40, 40, 5), isHappyHourPrice: true },
			point('Ej betygsatt', 40, 40, null)
		]);
		expect(bars).toEqual([]);
	});
});
