import { Effect } from 'effect';
import type { BarReview } from '$lib/types/bar-review';
import type { Coordinates } from '$lib/types/review-location';
import { Mongo, tryMongo } from '$lib/server/platform/mongo';
import { createResolvedCoordinatesLoader } from '../map/coordinates';
import { normalizeMapAddress } from '../map/address';

/**
 * Saved coordinates for already-authorized reviews, keyed by review ID. Coordinates are optional
 * presentation data: lookup failures return no coordinates instead of failing the read. Never
 * geocodes.
 */
export const loadReviewCoordinates = (
	reviews: Pick<BarReview, '_id' | 'location'>[]
): Effect.Effect<Record<string, Coordinates>, never, Mongo> =>
	Effect.gen(function* () {
		const { mapGeocodes } = (yield* Mongo).collections;
		const coordinates = yield* tryMongo(() =>
			createResolvedCoordinatesLoader(mapGeocodes)(reviews.map((review) => review.location))
		);
		return Object.fromEntries(
			reviews.flatMap((review) => {
				const position = coordinates.get(normalizeMapAddress(review.location));
				return position ? [[review._id.toString(), position]] : [];
			})
		);
	}).pipe(Effect.orElseSucceed(() => ({})));
