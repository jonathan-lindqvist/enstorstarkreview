import type { NearbyReviewComparison } from '$lib/types/nearby-reviews';
import { normalizeMapAddress } from '$lib/utils/map-address';
import { getNearbyReviewSummary, NEARBY_REVIEW_RADII_METRES } from '$lib/utils/nearby-reviews';
import type { ApiSchemas } from './openapi';

/**
 * The web form's nearby comparison for one address: the same saved-address center, radii and
 * summary, without a device-location fallback.
 */
export const toApiNearbyReviews = (
	address: string,
	comparison: NearbyReviewComparison
): ApiSchemas['NearbyReviews'] => {
	const key = normalizeMapAddress(address);
	const positions = comparison.coordinatesByAddress;
	const center = Object.hasOwn(positions, key) ? positions[key] : null;
	const summary = center ? getNearbyReviewSummary(center, comparison.reviews) : null;
	return {
		addressKnown: center !== null,
		radiiMetres: [...NEARBY_REVIEW_RADII_METRES],
		summary: summary && {
			counts: summary.counts,
			nearest: summary.nearest.map((bar) => ({
				slug: bar.slug,
				title: bar.title,
				distanceMetres: Math.round(bar.distanceKm * 1000)
			})),
			locatedCount: summary.locatedCount,
			totalCount: summary.totalCount
		}
	};
};
