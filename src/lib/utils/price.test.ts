import { describe, expect, it } from 'vitest';
import { HAPPY_HOUR_PRICE_NOTE, formatBeerPrice, getBeerPriceDisplay } from './price';

describe('beer price formatting', () => {
	it('formats regular and happy hour beer prices', () => {
		expect(formatBeerPrice(79, false)).toBe('79 kr');
		expect(formatBeerPrice(79, true)).toBe('79 kr*');
	});

	it('returns null for legacy or invalid beer prices', () => {
		expect(formatBeerPrice(undefined, false)).toBeNull();
		expect(formatBeerPrice(null, false)).toBeNull();
		expect(formatBeerPrice(Number.NaN, false)).toBeNull();
		expect(formatBeerPrice(0, false)).toBeNull();
		expect(formatBeerPrice(-1, false)).toBeNull();
		expect(formatBeerPrice(79.5, false)).toBeNull();
		expect(formatBeerPrice(1000, false)).toBeNull();
	});

	it('returns display metadata for happy hour notes', () => {
		expect(getBeerPriceDisplay(79, true)).toEqual({
			text: '79 kr*',
			note: HAPPY_HOUR_PRICE_NOTE
		});
		expect(getBeerPriceDisplay(undefined, true)).toBeNull();
	});
});
