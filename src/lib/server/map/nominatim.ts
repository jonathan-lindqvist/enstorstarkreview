import { Clock, Context, Duration, Effect, Layer, Ref, Schema } from 'effect';
import type { Coordinates } from '$lib/types/review-location';
import { NOMINATIM_MIN_REQUEST_INTERVAL_MS } from './policy';
import {
	createAddressFallback,
	coordinatesFromNominatimResult,
	coordinatesFromFallbackResult
} from './address';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_USER_AGENT = 'EnStorStarkReview/1.0';
const NOMINATIM_TIMEOUT = Duration.seconds(10);

/** Nominatim could not answer: transport error, timeout, HTTP error or malformed JSON. */
export class GeocodingFailed extends Schema.TaggedError<GeocodingFailed>()('GeocodingFailed', {
	cause: Schema.Unknown
}) {}

interface SearchOptions {
	limit: number;
	addressDetails: boolean;
	addressLayerOnly?: boolean;
}

/**
 * Address search against public Nominatim. Requests are spaced at least a second apart (their
 * usage policy), each is bounded by `Effect.timeout`, and the fetch is aborted on interruption.
 */
export class Geocoder extends Context.Service<
	Geocoder,
	{ findCoordinates(address: string): Effect.Effect<Coordinates | null, GeocodingFailed> }
>()('enstorstark/map/Geocoder') {
	static readonly make = Effect.gen(function* () {
		const lastRequestAt = yield* Ref.make(0);

		const waitForSlot = Effect.gen(function* () {
			const waitTime = Math.max(
				0,
				(yield* Ref.get(lastRequestAt)) + NOMINATIM_MIN_REQUEST_INTERVAL_MS -
					(yield* Clock.currentTimeMillis)
			);
			if (waitTime) yield* Effect.sleep(Duration.millis(waitTime));
			yield* Ref.set(lastRequestAt, yield* Clock.currentTimeMillis);
		});

		const search = (address: string, options: SearchOptions) =>
			waitForSlot.pipe(
				Effect.andThen(
					Effect.tryPromise({
						try: async (signal) => {
							const url = new URL(NOMINATIM_SEARCH_URL);
							url.searchParams.set('q', address);
							url.searchParams.set('format', 'jsonv2');
							url.searchParams.set('limit', String(options.limit));
							url.searchParams.set('addressdetails', options.addressDetails ? '1' : '0');
							url.searchParams.set('accept-language', 'sv');
							if (options.addressLayerOnly) url.searchParams.set('layer', 'address');

							const response = await globalThis.fetch(url, {
								headers: { accept: 'application/json', 'user-agent': NOMINATIM_USER_AGENT },
								signal
							});
							if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
							const results: unknown = await response.json();
							if (!Array.isArray(results)) throw new Error('Nominatim returned an invalid response');
							return results as unknown[];
						},
						catch: (cause) => new GeocodingFailed({ cause })
					}).pipe(
						Effect.timeoutOrElse({
							duration: NOMINATIM_TIMEOUT,
							orElse: () =>
								Effect.fail(new GeocodingFailed({ cause: new Error('Nominatim timed out') }))
						})
					)
				)
			);

		const findCoordinates = Effect.fn('Geocoder.findCoordinates')(function* (address: string) {
			const exactResults = yield* search(address, { limit: 1, addressDetails: false });
			for (const result of exactResults) {
				const coordinates = coordinatesFromNominatimResult(result);
				if (coordinates) return coordinates;
			}
			if (exactResults.length > 0) return null;

			const fallback = createAddressFallback(address);
			if (!fallback) return null;

			const fallbackResults = yield* search(fallback.query, {
				limit: 5,
				addressDetails: true,
				addressLayerOnly: true
			});
			for (const result of fallbackResults) {
				const coordinates = coordinatesFromFallbackResult(result, fallback);
				if (coordinates) return coordinates;
			}
			return null;
		});

		return Geocoder.of({ findCoordinates });
	});

	static readonly layer = Layer.effect(Geocoder, Geocoder.make);
}
