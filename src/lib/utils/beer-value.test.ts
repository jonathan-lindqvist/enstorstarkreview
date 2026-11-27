import { describe, expect, it } from 'vitest';
import { beerKrPerCl, formatKrPerCl, isValidBeerVolumeCl } from './beer-value';

describe('beer volume and value', () => {
	it('calculates price divided by volume without rounding before comparisons', () => {
		expect(beerKrPerCl(50, 65)).toBe(65 / 50);
		expect(formatKrPerCl(65 / 50)).toBe('1,30 kr/cl');
		expect(beerKrPerCl(50, 79)).toBeLessThan(beerKrPerCl(50, 80)!);
	});
	it.each([undefined, null, '', '50', 0, -1, 201, 33.5, NaN, Infinity])(
		'rejects volume %j',
		(value) => {
			expect(isValidBeerVolumeCl(value)).toBe(false);
			expect(beerKrPerCl(value, 65)).toBeNull();
		}
	);
	it.each([undefined, null, 0, -1, 50.5, 1000, NaN, Infinity])(
		'does not divide by invalid price %j',
		(price) => {
			expect(beerKrPerCl(50, price)).toBeNull();
		}
	);
});
