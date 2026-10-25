import { createHash } from 'node:crypto';
import { Clock, Context, Effect, Layer } from 'effect';
import { Mongo, tryMongo, type MongoError } from '$lib/server/platform/mongo';

export type ReviewRequestRateLimitScope = 'ip' | 'global';

export interface ReviewRequestRateLimitOptions {
	maxAttempts: number;
	windowMs: number;
}

export interface ReviewRequestRateLimitResult {
	allowed: boolean;
	retryAfterSeconds: number;
	remainingAttempts: number;
}

const hashKey = (key: string): string => createHash('sha256').update(key).digest('hex');

const makeId = (scope: ReviewRequestRateLimitScope, key: string): string => {
	return `${scope}:${hashKey(key.trim().toLowerCase() || 'unknown')}`;
};

/** A sliding-window quota; blocked attempts are not recorded. Fails instead of allowing on errors. */
export const consumeReviewRequestRateLimit = (
	scope: ReviewRequestRateLimitScope,
	key: string,
	options: ReviewRequestRateLimitOptions
): Effect.Effect<ReviewRequestRateLimitResult, MongoError, Mongo> =>
	Effect.gen(function* () {
		const { reviewRequestRateLimits } = (yield* Mongo).collections;
		const now = new Date(yield* Clock.currentTimeMillis);
		const cutoff = new Date(now.getTime() - options.windowMs);

		const updated = yield* tryMongo(async () => {
			const result = await reviewRequestRateLimits.findOneAndUpdate(
				{ _id: makeId(scope, key) },
				[
					{
						$set: {
							scope,
							createdAt: { $ifNull: ['$createdAt', now] },
							updatedAt: now,
							_activeAttempts: {
								$filter: {
									input: { $ifNull: ['$attempts', []] },
									as: 'attempt',
									cond: { $gte: ['$$attempt', cutoff] }
								}
							}
						}
					},
					{
						$set: {
							lastAllowed: { $lt: [{ $size: '$_activeAttempts' }, options.maxAttempts] },
							attempts: {
								$cond: [
									{ $lt: [{ $size: '$_activeAttempts' }, options.maxAttempts] },
									{ $concatArrays: ['$_activeAttempts', [now]] },
									'$_activeAttempts'
								]
							}
						}
					},
					{ $unset: ['_activeAttempts'] }
				],
				{ upsert: true, returnDocument: 'after' }
			);
			if (!result) throw new Error('Review request rate-limit update returned no document');
			return result;
		});

		if (updated.lastAllowed) {
			return {
				allowed: true,
				retryAfterSeconds: 0,
				remainingAttempts: Math.max(0, options.maxAttempts - updated.attempts.length)
			};
		}

		const oldestAttempt = updated.attempts.reduce(
			(oldest, attempt) => Math.min(oldest, attempt.getTime()),
			Number.POSITIVE_INFINITY
		);
		const retryAt = Number.isFinite(oldestAttempt)
			? oldestAttempt + options.windowMs
			: now.getTime() + options.windowMs;

		return {
			allowed: false,
			retryAfterSeconds: Math.max(1, Math.ceil((retryAt - now.getTime()) / 1_000)),
			remainingAttempts: 0
		};
	});

export class ReviewRequestRateLimiter extends Context.Service<
	ReviewRequestRateLimiter,
	{
		consume(
			scope: ReviewRequestRateLimitScope,
			key: string,
			options: ReviewRequestRateLimitOptions
		): Effect.Effect<ReviewRequestRateLimitResult, MongoError>;
	}
>()('enstorstark/server/ReviewRequestRateLimiter') {
	static readonly layer = Layer.effect(
		ReviewRequestRateLimiter,
		Effect.gen(function* () {
			const mongo = yield* Mongo;
			return ReviewRequestRateLimiter.of({
				consume: (scope, key, options) =>
					consumeReviewRequestRateLimit(scope, key, options).pipe(
						Effect.provideService(Mongo, mongo)
					)
			});
		})
	);
}
