import { describe, expect, it } from 'vitest';
import { distanceKm, formatDistanceKm, isValidCoordinates } from './review-distance';
import { normalizeHomeReviewSort, sortHomeReviews } from './home-review-sort';
import { normalizeReviewSort } from './review-sort';

const origin = { latitude: 57.7089, longitude: 11.9746 };

describe('local straight-line distance', () => {
	it('calculates kilometres symmetrically and handles coincident and antipodal points', () => {
		const stockholm = { latitude: 59.3293, longitude: 18.0686 };
		expect(distanceKm(origin, stockholm)).toBeCloseTo(397.3, 0);
		expect(distanceKm(stockholm, origin)).toBe(distanceKm(origin, stockholm));
		expect(distanceKm(origin, origin)).toBe(0);
		expect(distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 })).toBeCloseTo(
			20_015.1,
			0
		);
	});
	it.each([
		null,
		undefined,
		{},
		{ latitude: '0', longitude: 0 },
		{ latitude: NaN, longitude: 0 },
		{ latitude: 0, longitude: Infinity },
		{ latitude: 90.01, longitude: 0 },
		{ latitude: -90.01, longitude: 0 },
		{ latitude: 0, longitude: 180.01 },
		{ latitude: 0, longitude: -180.01 }
	])('omits missing or invalid coordinates: %j', (value) => {
		expect(isValidCoordinates(value)).toBe(false);
		expect(distanceKm(value, origin)).toBeNull();
		expect(distanceKm(origin, value)).toBeNull();
	});
	it('accepts the coordinate boundaries', () => {
		expect(isValidCoordinates({ latitude: -90, longitude: -180 })).toBe(true);
		expect(isValidCoordinates({ latitude: 90, longitude: 180 })).toBe(true);
	});
	it('formats one decimal in Swedish, including zero, and omits invalid distances', () => {
		expect(formatDistanceKm(1.234)).toBe('1,2 km');
		expect(formatDistanceKm(0)).toBe('0,0 km');
		for (const value of [null, undefined, -1, NaN, Infinity]) {
			expect(formatDistanceKm(value)).toBeNull();
		}
	});
});

describe('home distance sorting', () => {
	const reviews = [
		{ id: 'a', createdAt: '2026-01-01', rating: 3, distanceKm: 1.24 },
		{ id: 'b', createdAt: '2026-01-02', rating: 2, distanceKm: null },
		{ id: 'c', createdAt: '2026-01-03', rating: 1, distanceKm: 1.21 },
		{ id: 'd', createdAt: '2026-01-04', rating: 2, distanceKm: 1.24 }
	];
	it('sorts unrounded distances, breaks ties by latest, and keeps unknown distances last', () => {
		expect(
			sortHomeReviews(reviews, 'nearest', (review) => review).map((review) => review.id)
		).toEqual(['c', 'd', 'a', 'b']);
		expect(reviews.map((review) => review.id)).toEqual(['a', 'b', 'c', 'd']);
	});
	it('treats invalid distances as unknown and uses latest ordering without a position', () => {
		const unknown = reviews.map((review, index) => ({
			...review,
			distanceKm: [null, -1, NaN, Infinity][index]
		}));
		expect(
			sortHomeReviews(unknown, 'nearest', (review) => review).map((review) => review.id)
		).toEqual(['d', 'c', 'b', 'a']);
	});
	it('keeps existing sorts and restricts nearest to the home contract', () => {
		expect(normalizeHomeReviewSort('nearest')).toBe('nearest');
		expect(normalizeHomeReviewSort('unexpected')).toBe('latest');
		expect(normalizeReviewSort('nearest')).toBe('latest');
		expect(
			sortHomeReviews(reviews, 'oldest', (review) => review).map((review) => review.id)
		).toEqual(['a', 'b', 'c', 'd']);
		expect(
			sortHomeReviews(reviews, 'score', (review) => review).map((review) => review.id)
		).toEqual(['a', 'd', 'b', 'c']);
	});
});
