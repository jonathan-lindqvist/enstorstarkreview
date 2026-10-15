import { describe, expect, it } from 'vitest';
import { beerClPerKr, formatClPerKr, isValidBeerVolumeCl } from './beer-value';

describe('beer volume and value', () => {
	it('calculates volume divided by price without rounding before comparisons', () => {
		expect(beerClPerKr(50, 65)).toBe(50 / 65);
		expect(formatClPerKr(50 / 65)).toBe('0,77 cl/kr');
		expect(beerClPerKr(50, 79)).toBeGreaterThan(beerClPerKr(50, 80)!);
	});
	it.each([undefined, null, '', '50', 0, -1, 201, 33.5, NaN, Infinity])(
		'rejects volume %j',
		(value) => {
			expect(isValidBeerVolumeCl(value)).toBe(false);
			expect(beerClPerKr(value, 65)).toBeNull();
		}
	);
	it.each([undefined, null, 0, -1, 50.5, 1000, NaN, Infinity])(
		'does not divide by invalid price %j',
		(price) => {
			expect(beerClPerKr(50, price)).toBeNull();
		}
	);
});
