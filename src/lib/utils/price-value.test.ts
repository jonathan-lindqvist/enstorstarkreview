import { describe, expect, it } from 'vitest';
import { suggestPriceValue } from './price-value';

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
