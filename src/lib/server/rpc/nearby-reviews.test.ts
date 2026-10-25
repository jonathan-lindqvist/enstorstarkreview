import { describe, expect, it } from 'vitest';
import type { NearbyReviewComparison } from '$lib/types/nearby-reviews';
import { toApiNearbyReviews } from './nearby-reviews';

const center = { latitude: 57.7, longitude: 12 };
// About 111 metres per 0.001 degrees of latitude.
const north = (metres: number) => ({ latitude: 57.7 + metres / 111_195, longitude: 12 });

const comparison: NearbyReviewComparison = {
	available: true,
	coordinatesByAddress: { 'gatan 1': center },
	reviews: [
		{ id: '1', title: 'Nära', slug: 'nara', coordinates: north(100) },
		{ id: '2', title: 'Mitt emellan', slug: 'mitt', coordinates: north(400) },
		{ id: '3', title: 'Långt bort', slug: 'langt', coordinates: north(5000) },
		{ id: '4', title: 'Okänd', slug: 'okand', coordinates: null }
	]
};

describe('API nearby reviews', () => {
	it('centres on the saved position of the normalized address and reports whole metres', () => {
		expect(toApiNearbyReviews('  GATAN   1 ', comparison)).toEqual({
			addressKnown: true,
			radiiMetres: [250, 500, 1000],
			summary: {
				counts: [1, 2, 2],
				nearest: [
					{ slug: 'nara', title: 'Nära', distanceMetres: 100 },
					{ slug: 'mitt', title: 'Mitt emellan', distanceMetres: 400 }
				],
				locatedCount: 3,
				totalCount: 4
			}
		});
	});

	it('has no summary for an address without a saved position', () => {
		expect(toApiNearbyReviews('Okänd gata 9', comparison)).toEqual({
			addressKnown: false,
			radiiMetres: [250, 500, 1000],
			summary: null
		});
	});

	it('does not treat inherited object keys as saved addresses', () => {
		expect(toApiNearbyReviews('constructor', comparison).addressKnown).toBe(false);
	});

	it('has no summary when no other review has a known position', () => {
		const unlocated = { ...comparison, reviews: [comparison.reviews[3]] };
		expect(toApiNearbyReviews('Gatan 1', unlocated)).toMatchObject({
			addressKnown: true,
			summary: null
		});
	});
});
