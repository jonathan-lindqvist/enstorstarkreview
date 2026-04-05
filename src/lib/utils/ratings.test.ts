import { describe, expect, it } from 'vitest';
import { calculateOverallRating } from './ratings';

describe('calculateOverallRating', () => {
	it('returns 0 when all category scores are 0', () => {
		expect(calculateOverallRating([0, 0, 0, 0, 0, 0, 0, 0])).toBe(0);
	});

	it('floors weighted result to an integer', () => {
		const value = calculateOverallRating([3, 2, 2, 3, 2, 2, 1, 3]);
		expect(value).toBe(2);
	});

	it('caps at 3 with current implementation', () => {
		expect(calculateOverallRating([5, 5, 5, 5, 5, 5, 5, 5])).toBe(3);
	});
});
