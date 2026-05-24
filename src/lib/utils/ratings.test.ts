import { describe, expect, it } from 'vitest';
import { calculateOverallRating } from './ratings';

describe('calculateOverallRating', () => {
	it('returns 0 when all category scores are 0', () => {
		expect(calculateOverallRating([0, 0, 0, 0, 0, 0, 0, 0])).toBe(0);
	});

	it('returns 1 when the weighted average reaches 2', () => {
		expect(calculateOverallRating([2, 2, 2, 2, 2, 2, 2, 2])).toBe(1);
	});

	it('returns 2 for strong scores below the 3 threshold', () => {
		expect(calculateOverallRating([4, 4, 4, 4, 4, 4, 4, 4])).toBe(2);
	});

	it('returns 3 only for excellent scores', () => {
		expect(calculateOverallRating([5, 5, 5, 5, 5, 5, 5, 5])).toBe(3);
	});

	it('does not return 3 for a high but not excellent weighted score', () => {
		expect(calculateOverallRating([4, 5, 4, 4, 4, 4, 4, 4])).toBe(2);
	});
});
