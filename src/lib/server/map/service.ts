import { Context, Effect, Layer, Ref } from 'effect';
import type { PublicReviewMapData, PublicReviewMapMarker } from '$lib/types/review-map';
import { Mongo, tryMongo, type MongoError } from '$lib/server/platform/mongo';
import { makeCachedValue } from '$lib/server/cache';
import { createMarkerLoader } from './markers';
import { createGeocodeStore } from './geocodes';
import { Geocoder } from './nominatim';
import { normalizeMapAddress } from './address';
import { REVIEW_MAP_CACHE_TTL_MS } from './policy';

/**
 * The public map. Marker reads use only persisted resolved geocodes and a 24-hour cache;
 * `resolveOne` makes at most one address attempt, and returns null at once while another
 * attempt is running instead of sharing its result.
 */
export class ReviewMap extends Context.Service<
	ReviewMap,
	{
		readonly get: Effect.Effect<PublicReviewMapData, MongoError>;
		readonly invalidate: Effect.Effect<void>;
		readonly resolveOne: Effect.Effect<PublicReviewMapMarker | null, MongoError>;
	}
>()('enstorstark/map/ReviewMap') {
	static readonly layer = Layer.effect(
		ReviewMap,
		Effect.gen(function* () {
			const { collections } = yield* Mongo;
			const geocoder = yield* Geocoder;
			const markers = createMarkerLoader(collections.bars, collections.mapGeocodes);
			const geocodes = createGeocodeStore(collections.mapGeocodes);
			const cache = yield* makeCachedValue(
				tryMongo(() => markers.loadMapData()),
				REVIEW_MAP_CACHE_TTL_MS
			);
			const attemptRunning = yield* Ref.make(false);

			const resolveNext = Effect.gen(function* () {
				const reviews = yield* tryMongo(() => markers.loadReviews());
				const seenAddresses = new Set<string>();

				for (const review of reviews) {
					const addressKey = normalizeMapAddress(review.location);
					if (seenAddresses.has(addressKey)) continue;
					seenAddresses.add(addressKey);

					if (!(yield* tryMongo(() => geocodes.claim(review.location, addressKey)))) continue;

					const coordinates = yield* geocoder
						.findCoordinates(review.location)
						.pipe(
							Effect.catchTag('GeocodingFailed', (error) =>
								Effect.sync(() => console.error('Map geocoding failed:', error.cause)).pipe(
									Effect.andThen(tryMongo(() => geocodes.saveUnresolved(addressKey, 'failed'))),
									Effect.as('failed' as const)
								)
							)
						);
					if (coordinates === 'failed') return null;
					if (!coordinates) {
						yield* tryMongo(() => geocodes.saveUnresolved(addressKey, 'not_found'));
						return null;
					}

					yield* tryMongo(() => geocodes.saveResolved(addressKey, coordinates));
					yield* cache.invalidate;
					return { ...review, ...coordinates };
				}
				return null;
			});

			const resolveOne = Effect.gen(function* () {
				// Claim the single slot atomically; a concurrent call gets null without waiting.
				if (yield* Ref.getAndSet(attemptRunning, true)) return null;
				return yield* resolveNext.pipe(Effect.ensuring(Ref.set(attemptRunning, false)));
			});

			return ReviewMap.of({ get: cache.get, invalidate: cache.invalidate, resolveOne });
		})
	);
}
