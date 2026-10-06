import { describe, expect, it } from 'vitest';
import type { PublicReviewMapMarker } from '$lib/types/review-map';
import { toApiReviewMap } from './reviews';

const marker: PublicReviewMapMarker = {
	title: 'Baren',
	slug: 'baren',
	rating: 2,
	location: 'Gatan 1, Göteborg',
	latitude: 57.7,
	longitude: 11.97,
	beerPriceKr: 65,
	isHappyHourPrice: true
};

describe('toApiReviewMap', () => {
	it('includes the bar attributes of each marker in display order', () => {
		const map = toApiReviewMap({
			markers: [{ ...marker, attributes: ['darts', 'quiz'] }],
			totalReviews: 1
		});

		expect(map.markers[0]).toEqual({
			slug: 'baren',
			title: 'Baren',
			overallRating: 2,
			location: 'Gatan 1, Göteborg',
			latitude: 57.7,
			longitude: 11.97,
			beer: { priceKr: 65, isHappyHourPrice: true },
			attributes: ['quiz', 'darts']
		});
	});

	it('gives legacy markers without attributes an empty list', () => {
		const map = toApiReviewMap({ markers: [marker], totalReviews: 1 });

		expect(map.markers[0].attributes).toEqual([]);
	});
});
