import type { ObjectId } from 'mongodb';
import { Effect } from 'effect';
import type { NearbyReviewComparison } from '$lib/types/nearby-reviews';
import type { Coordinates } from '$lib/types/review-location';
import { isValidCoordinates } from '$lib/utils/review-distance';
import { Mongo, tryMongo } from '$lib/server/platform/mongo';
import { ACTIVE_REVIEW_FILTER } from '$lib/server/review-publication';
import { normalizeMapAddress } from '../map/address';
import { loadReviewCoordinates } from './coordinates';

/** Authenticated form loaders and the API only: active drafts are intentionally included. No geocoding. */
export const loadNearbyReviewComparison = (
	excludeId?: ObjectId
): Effect.Effect<NearbyReviewComparison, never, Mongo> =>
	Effect.gen(function* () {
		const { bars } = (yield* Mongo).collections;
		const documents = yield* tryMongo(() =>
			bars
				.find(ACTIVE_REVIEW_FILTER, { projection: { _id: 1, title: 1, slug: 1, location: 1 } })
				.toArray()
		);
		const coordinates = yield* loadReviewCoordinates(documents);
		const coordinatesByAddress: Record<string, Coordinates> = Object.create(null);
		for (const review of documents) {
			const position = coordinates[review._id.toString()];
			if (isValidCoordinates(position)) {
				coordinatesByAddress[normalizeMapAddress(review.location)] = position;
			}
		}
		return {
			available: true,
			coordinatesByAddress,
			reviews: documents
				.filter((review) => !excludeId?.equals(review._id))
				.map((review) => ({
					id: review._id.toString(),
					title: review.title,
					slug: review.slug,
					coordinates: coordinates[review._id.toString()] ?? null
				}))
		} satisfies NearbyReviewComparison;
	}).pipe(
		Effect.orElseSucceed(
			(): NearbyReviewComparison => ({ available: false, reviews: [], coordinatesByAddress: {} })
		)
	);
