import { Cache, Duration, Effect, Exit } from 'effect';

export interface CachedValue<A, E> {
	/** Concurrent reads share one pending load. */
	readonly get: Effect.Effect<A, E>;
	/**
	 * Drops the value. A load that is still running finishes for its own callers but cannot
	 * refill the cache; the next read starts a fresh load.
	 */
	readonly invalidate: Effect.Effect<void>;
}

/**
 * One process-wide value with a time to live, built on Effect `Cache`. Failures are not cached,
 * so the next read retries, and the time to live starts when the load completes.
 */
export const makeCachedValue = <A, E, R>(
	load: Effect.Effect<A, E, R>,
	timeToLive: Duration.Input
): Effect.Effect<CachedValue<A, E>, never, R> =>
	Effect.map(
		Cache.makeWith(() => load, {
			capacity: 1,
			timeToLive: (exit) => (Exit.isSuccess(exit) ? timeToLive : Duration.zero)
		}),
		(cache) => ({
			get: Cache.get(cache, undefined),
			invalidate: Cache.invalidate(cache, undefined)
		})
	);
