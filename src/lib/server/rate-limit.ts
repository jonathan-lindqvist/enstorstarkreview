import db from '$lib/db/db';
import { createHash } from 'crypto';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const MAX_TRACKED_KEY_LENGTH = 256;

type LoginRateLimitScope = 'ip' | 'username';

interface LoginRateLimitRecord {
	_id: string;
	scope: LoginRateLimitScope;
	key: string;
	windowStart: Date;
	attempts: number;
	blockedUntil: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

const loginRateLimits = db.collection<LoginRateLimitRecord>('login_rate_limits');

export interface LoginRateLimitResult {
	allowed: boolean;
	retryAfterSeconds: number;
	remainingAttempts: number;
}

const hashKey = (key: string): string => {
	return createHash('sha256').update(key).digest('hex');
};

const makeId = (scope: LoginRateLimitScope, key: string): string => `${scope}:${hashKey(key)}`;

export const consumeLoginRateLimit = async (
	scope: LoginRateLimitScope,
	key: string
): Promise<LoginRateLimitResult> => {
	const normalizedKey = key.trim().toLowerCase();
	if (!normalizedKey) {
		return {
			allowed: true,
			retryAfterSeconds: 0,
			remainingAttempts: LOGIN_MAX_ATTEMPTS
		};
	}

	const now = new Date();
	const id = makeId(scope, normalizedKey);
	const keyPreview = normalizedKey.slice(0, MAX_TRACKED_KEY_LENGTH);
	const blockedUntilAt = new Date(now.getTime() + LOGIN_BLOCK_MS);

	const updated = await loginRateLimits.findOneAndUpdate(
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
								$gte: [{ $subtract: [now, { $ifNull: ['$windowStart', now] }] }, LOGIN_WINDOW_MS]
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
												$cond: ['$_windowExpired', 1, { $add: [{ $ifNull: ['$attempts', 0] }, 1] }]
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
};

export const clearLoginRateLimit = async (
	scope: LoginRateLimitScope,
	key: string
): Promise<void> => {
	const normalizedKey = key.trim().toLowerCase();
	if (!normalizedKey) return;
	await loginRateLimits.deleteOne({ _id: makeId(scope, normalizedKey) });
};
