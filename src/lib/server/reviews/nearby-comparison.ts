import { loadReviewCoordinates } from './coordinates';
import type { NearbyReviewComparison } from '$lib/types/nearby-reviews';
import type { ObjectId } from 'mongodb';
import { listActiveReviews } from './queries';
import { normalizeMapAddress } from '../map/address';
import type { Coordinates } from '$lib/types/review-location';
import { isValidCoordinates } from '$lib/utils/review-distance';

/** Authenticated form loaders only: active drafts are intentionally included. No geocoding. */
export const loadNearbyReviewComparison = async (
	excludeId?: ObjectId
): Promise<NearbyReviewComparison> => {
	try {
		const documents = await listActiveReviews({
			projection: { _id: 1, title: 1, slug: 1, location: 1 }
		});
		const coordinates = await loadReviewCoordinates(documents);
		const coordinatesByAddress: Record<string, Coordinates> = Object.create(null);
		for (const review of documents) {
			const position = coordinates[review._id.toString()];
			if (isValidCoordinates(position))
				coordinatesByAddress[normalizeMapAddress(review.location)] = position;
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
		};
	} catch {
		return { available: false, reviews: [], coordinatesByAddress: {} };
	}
};
