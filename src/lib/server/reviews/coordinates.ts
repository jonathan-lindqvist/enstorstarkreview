import { mapGeocodes } from '$lib/db/map-geocodes';
import type { BarReview } from '$lib/types/bar-review';
import type { Coordinates } from '$lib/types/review-location';
import { createResolvedCoordinatesLoader } from '../map/coordinates';
import { normalizeMapAddress } from '../map/address';

const loadCoordinates = createResolvedCoordinatesLoader(mapGeocodes);

/** Coordinates are optional presentation data; failures must not prevent reading a review. */
export const loadReviewCoordinates = async (
	reviews: Pick<BarReview, '_id' | 'location'>[]
): Promise<Record<string, Coordinates>> => {
	try {
		const coordinates = await loadCoordinates(reviews.map((review) => review.location));
		return Object.fromEntries(
			reviews.flatMap((review) => {
				const position = coordinates.get(normalizeMapAddress(review.location));
				return position ? [[review._id.toString(), position]] : [];
			})
		);
	} catch {
		return {};
	}
};
