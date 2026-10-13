import { describe, expect, it } from 'vitest';
import { getNearbyReviewSummary } from './nearby-reviews';
import type { NearbyReview } from '$lib/types/nearby-reviews';

const center = { latitude: 0, longitude: 0 };
const point = (title: string, metres: number): NearbyReview => ({
	id: title,
	title,
	slug: title,
	coordinates: { latitude: ((metres / 1000 / 6371) * 180) / Math.PI, longitude: 0 }
});

describe('nearby reviewed bars', () => {
	it('counts inclusive radii cumulatively, retaining coverage and only five nearest', () => {
		const reviews = [
			point('a', 0),
			point('b', 249),
			point('c', 250),
			point('d', 500),
			point('e', 999),
			point('f', 1000),
			point('g', 1001),
			{ ...point('missing', 0), coordinates: null }
		];
		const result = getNearbyReviewSummary(center, reviews);
		expect(result).toMatchObject({ counts: [3, 4, 6], locatedCount: 7, totalCount: 8 });
		expect(result?.nearest.map((bar) => bar.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
	});
	it('breaks equal-distance ties using Swedish titles', () => {
		expect(
			getNearbyReviewSummary(center, [point('Ö', 0), point('Å', 0), point('Z', 0)])?.nearest.map(
				(bar) => bar.title
			)
		).toEqual(['Z', 'Å', 'Ö']);
	});
	it('distinguishes a real zero from unavailable coordinates', () => {
		expect(getNearbyReviewSummary(center, [point('far', 2000)])?.counts).toEqual([0, 0, 0]);
		expect(getNearbyReviewSummary(null, [point('near', 0)])).toBeNull();
		expect(
			getNearbyReviewSummary(center, [
				{ ...point('bad', 0), coordinates: { latitude: NaN, longitude: 0 } }
			])
		).toBeNull();
		expect(getNearbyReviewSummary(center, [])).toBeNull();
	});
});
