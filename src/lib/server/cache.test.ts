import { Deferred, Effect, Fiber, Ref } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import { makeCachedValue } from './cache';

const run = <A, E>(effect: Effect.Effect<A, E>) =>
	Effect.runPromise(effect.pipe(Effect.provide(TestClock.layer())) as Effect.Effect<A, E>);

describe('cached value', () => {
	it('shares pending reads and expires relative to completion', () =>
		run(
			Effect.gen(function* () {
				const loads = yield* Ref.make(0);
				const gate = yield* Deferred.make<void>();
				const cache = yield* makeCachedValue(
					Ref.updateAndGet(loads, (n) => n + 1).pipe(Effect.tap(() => Deferred.await(gate))),
					'10 millis'
				);
				const first = yield* Effect.forkChild(cache.get);
				const second = yield* Effect.forkChild(cache.get);
				yield* Effect.yieldNow;
				yield* TestClock.adjust('20 millis');
				yield* Deferred.succeed(gate, undefined);
				expect([yield* Fiber.join(first), yield* Fiber.join(second)]).toEqual([1, 1]);

				yield* TestClock.adjust('9 millis');
				expect(yield* cache.get).toBe(1);
				yield* TestClock.adjust('1 millis');
				expect(yield* cache.get).toBe(2);
			})
		));

	it('does not let an invalidated pending load refill the cache', () =>
		run(
			Effect.gen(function* () {
				const loads = yield* Ref.make(0);
				const gates = [yield* Deferred.make<void>(), yield* Deferred.make<void>()];
				const cache = yield* makeCachedValue(
					Effect.gen(function* () {
						const n = yield* Ref.updateAndGet(loads, (count) => count + 1);
						yield* Deferred.await(gates[n - 1]);
						return n;
					}),
					'100 millis'
				);
				const old = yield* Effect.forkChild(cache.get);
				yield* Effect.yieldNow;
				yield* cache.invalidate;
				const current = yield* Effect.forkChild(cache.get);
				yield* Effect.yieldNow;
				yield* Deferred.succeed(gates[0], undefined);
				expect(yield* Fiber.join(old)).toBe(1);
				yield* Deferred.succeed(gates[1], undefined);
				expect(yield* Fiber.join(current)).toBe(2);
				expect(yield* cache.get).toBe(2);
				expect(yield* Ref.get(loads)).toBe(2);
			})
		));

	it('does not cache failures', () =>
		run(
			Effect.gen(function* () {
				const attempts = yield* Ref.make(0);
				const cache = yield* makeCachedValue(
					Ref.updateAndGet(attempts, (n) => n + 1).pipe(
						Effect.flatMap((n) => (n === 1 ? Effect.fail('offline') : Effect.succeed(n)))
					),
					'100 millis'
				);
				expect(yield* Effect.flip(cache.get)).toBe('offline');
				expect(yield* cache.get).toBe(2);
			})
		));
});
