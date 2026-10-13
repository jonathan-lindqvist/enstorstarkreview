import type { NearbyReview, NearbyReviewSummary } from '$lib/types/nearby-reviews';
import { distanceKm, isValidCoordinates } from './review-distance';

export const NEARBY_REVIEW_RADII_METRES = [250, 500, 1000] as const;

export const getNearbyReviewSummary = (
	center: unknown,
	reviews: NearbyReview[]
): NearbyReviewSummary | null => {
	if (!isValidCoordinates(center)) return null;
	const located = reviews.flatMap((review) => {
		const distance = distanceKm(center, review.coordinates);
		return distance === null ? [] : [{ ...review, distanceKm: distance }];
	});
	if (!located.length) return null;
	// Floating-point roundoff must not exclude an exact radius boundary.
	const within = (distance: number, metres: number) => distance <= metres / 1000 + 1e-12;
	return {
		counts: NEARBY_REVIEW_RADII_METRES.map(
			(radius) => located.filter((bar) => within(bar.distanceKm, radius)).length
		),
		nearest: located
			.filter((bar) => within(bar.distanceKm, 1000))
			.sort(
				(a, b) =>
					a.distanceKm - b.distanceKm ||
					a.title.localeCompare(b.title, 'sv') ||
					a.slug.localeCompare(b.slug, 'sv')
			)
			.slice(0, 5),
		locatedCount: located.length,
		totalCount: reviews.length
	};
};
