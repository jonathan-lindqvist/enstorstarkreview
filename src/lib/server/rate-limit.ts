import { createHash } from 'crypto';
import { Clock, Context, Effect, Layer } from 'effect';
import { Mongo, tryMongo, type MongoError } from '$lib/server/platform/mongo';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const MAX_TRACKED_KEY_LENGTH = 256;

export type LoginRateLimitScope = 'ip' | 'username';

export interface LoginRateLimitResult {
	allowed: boolean;
	retryAfterSeconds: number;
	remainingAttempts: number;
}

const hashKey = (key: string): string => {
	return createHash('sha256').update(key).digest('hex');
};

const makeId = (scope: LoginRateLimitScope, key: string): string => `${scope}:${hashKey(key)}`;

/** Consumes one attempt with an atomic aggregation-pipeline upsert (8 per 15 minutes). */
export const consumeLoginRateLimit = (
	scope: LoginRateLimitScope,
	key: string
): Effect.Effect<LoginRateLimitResult, MongoError, Mongo> =>
	Effect.gen(function* () {
		const normalizedKey = key.trim().toLowerCase();
		if (!normalizedKey) {
			return {
				allowed: true,
				retryAfterSeconds: 0,
				remainingAttempts: LOGIN_MAX_ATTEMPTS
			};
		}

		const { loginRateLimits } = (yield* Mongo).collections;
		const now = new Date(yield* Clock.currentTimeMillis);
		const id = makeId(scope, normalizedKey);
		const keyPreview = normalizedKey.slice(0, MAX_TRACKED_KEY_LENGTH);
		const blockedUntilAt = new Date(now.getTime() + LOGIN_BLOCK_MS);

		const updated = yield* tryMongo(() =>
			loginRateLimits.findOneAndUpdate(
				{ _id: id },
				[
					{
						$set: {
							scope,
							key: keyPreview,
							createdAt: { $ifNull: ['$createdAt', now] },
							updatedAt: now,
							_windowExpired: {
								$or: [
									{ $eq: [{ $ifNull: ['$windowStart', null] }, null] },
									{
										$gte: [
											{ $subtract: [now, { $ifNull: ['$windowStart', now] }] },
											LOGIN_WINDOW_MS
										]
									}
								]
							},
							_isBlocked: {
								$gt: [{ $ifNull: ['$blockedUntil', new Date(0)] }, now]
							}
						}
					},
					{
						$set: {
							windowStart: {
								$cond: ['$_windowExpired', now, { $ifNull: ['$windowStart', now] }]
							},
							attempts: {
								$cond: [
									'$_isBlocked',
									{ $ifNull: ['$attempts', 0] },
									{
										$cond: ['$_windowExpired', 1, { $add: [{ $ifNull: ['$attempts', 0] }, 1] }]
									}
								]
							},
							blockedUntil: {
								$cond: [
									'$_isBlocked',
									'$blockedUntil',
									{
										$cond: [
											{
												$gt: [
													{
														$cond: [
															'$_windowExpired',
															1,
															{ $add: [{ $ifNull: ['$attempts', 0] }, 1] }
														]
													},
													LOGIN_MAX_ATTEMPTS
												]
											},
											blockedUntilAt,
											null
										]
									}
								]
							}
						}
					},
					{
						$unset: ['_windowExpired', '_isBlocked']
					}
				],
				{ upsert: true, returnDocument: 'after' }
			)
		);

		if (!updated) {
			return {
				allowed: true,
				retryAfterSeconds: 0,
				remainingAttempts: LOGIN_MAX_ATTEMPTS
			};
		}

		const isBlocked = !!updated.blockedUntil && updated.blockedUntil.getTime() > now.getTime();

		return {
			allowed: !isBlocked,
			retryAfterSeconds: isBlocked
				? Math.ceil((updated.blockedUntil!.getTime() - now.getTime()) / 1000)
				: 0,
			remainingAttempts: isBlocked ? 0 : Math.max(0, LOGIN_MAX_ATTEMPTS - updated.attempts)
		};
	});

export const clearLoginRateLimit = (
	scope: LoginRateLimitScope,
	key: string
): Effect.Effect<void, MongoError, Mongo> =>
	Effect.gen(function* () {
		const normalizedKey = key.trim().toLowerCase();
		if (!normalizedKey) return;
		const { loginRateLimits } = (yield* Mongo).collections;
		yield* tryMongo(() => loginRateLimits.deleteOne({ _id: makeId(scope, normalizedKey) }));
	});

/** The login quotas shared by the web form and `POST /api/v1/sessions`. */
export class LoginRateLimiter extends Context.Service<
	LoginRateLimiter,
	{
		consume(
			scope: LoginRateLimitScope,
			key: string
		): Effect.Effect<LoginRateLimitResult, MongoError>;
		clear(scope: 'username', key: string): Effect.Effect<void, MongoError>;
	}
>()('enstorstark/server/LoginRateLimiter') {
	static readonly layer = Layer.effect(
		LoginRateLimiter,
		Effect.gen(function* () {
			const mongo = yield* Mongo;
			return LoginRateLimiter.of({
				consume: (scope, key) =>
					consumeLoginRateLimit(scope, key).pipe(Effect.provideService(Mongo, mongo)),
				clear: (scope, key) =>
					clearLoginRateLimit(scope, key).pipe(Effect.provideService(Mongo, mongo))
			});
		})
	);
}
