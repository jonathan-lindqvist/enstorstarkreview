import { createAsyncCache } from '$lib/server/async-cache';
import type { Coordinates } from '$lib/types/review-location';
import type { PublicReviewMapMarker } from '$lib/types/review-map';
import type { createMarkerLoader } from './markers';
import type { createGeocodeStore } from './geocodes';
import type { createNominatimClient } from './nominatim';
import { normalizeMapAddress } from './address';
import { REVIEW_MAP_CACHE_TTL_MS } from './policy';

interface ReviewMapDependencies {
	markers: ReturnType<typeof createMarkerLoader>;
	geocodes: ReturnType<typeof createGeocodeStore>;
	findCoordinates: ReturnType<typeof createNominatimClient>['findCoordinates'];
	onGeocodeResolved: () => void;
}
export const createReviewMapService = ({
	markers,
	geocodes,
	findCoordinates,
	onGeocodeResolved
}: ReviewMapDependencies) => {
	const cache = createAsyncCache({ load: markers.loadMapData, ttlMs: REVIEW_MAP_CACHE_TTL_MS });
	let pendingGeocode: Promise<PublicReviewMapMarker | null> | null = null;
	const resolveNextPublicReviewMapMarker = async (): Promise<PublicReviewMapMarker | null> => {
		const reviews = await markers.loadReviews();
		const seenAddresses = new Set<string>();

		for (const review of reviews) {
			const addressKey = normalizeMapAddress(review.location);
			if (seenAddresses.has(addressKey)) continue;
			seenAddresses.add(addressKey);

			if (!(await geocodes.claim(review.location, addressKey))) continue;

			let coordinates: Coordinates | null;
			try {
				coordinates = await findCoordinates(review.location);
				if (!coordinates) {
					await geocodes.saveUnresolved(addressKey, 'not_found');
					return null;
				}

				await geocodes.saveResolved(addressKey, coordinates);
			} catch (error) {
				console.error('Map geocoding failed:', error);
				await geocodes.saveUnresolved(addressKey, 'failed');
				return null;
			}

			cache.invalidate();
			try {
				onGeocodeResolved();
			} catch {
				console.error('Regional statistics cache invalidation failed.');
			}
			return { ...review, ...coordinates };
		}

		return null;
	};

	const resolveOnePublicReviewMapMarker = async (): Promise<PublicReviewMapMarker | null> => {
		if (pendingGeocode) return null;

		const promise = resolveNextPublicReviewMapMarker().finally(() => {
			if (pendingGeocode === promise) pendingGeocode = null;
		});
		pendingGeocode = promise;
		return promise;
	};

	return {
		getPublicReviewMapData: cache.get,
		invalidatePublicReviewMapCache: cache.invalidate,
		resolveOnePublicReviewMapMarker
	};
};
