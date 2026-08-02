import db from '$lib/db/db';
import { createHash } from 'node:crypto';

export const REVIEW_REQUEST_IP_LIMIT = {
	maxAttempts: 5,
	windowMs: 24 * 60 * 60 * 1_000
} as const;

export const REVIEW_REQUEST_GLOBAL_LIMIT = {
	maxAttempts: 30,
	windowMs: 60 * 60 * 1_000
} as const;

type ReviewRequestRateLimitScope = 'ip' | 'global';

interface ReviewRequestRateLimitRecord {
	_id: string;
	scope: ReviewRequestRateLimitScope;
	attempts: Date[];
	lastAllowed: boolean;
	createdAt: Date;
	updatedAt: Date;
}

interface ReviewRequestRateLimitOptions {
	maxAttempts: number;
	windowMs: number;
}

export interface ReviewRequestRateLimitResult {
	allowed: boolean;
	retryAfterSeconds: number;
	remainingAttempts: number;
}

const reviewRequestRateLimits = db.collection<ReviewRequestRateLimitRecord>(
	'review_request_rate_limits'
);

const hashKey = (key: string): string => createHash('sha256').update(key).digest('hex');

const makeId = (scope: ReviewRequestRateLimitScope, key: string): string => {
	return `${scope}:${hashKey(key.trim().toLowerCase() || 'unknown')}`;
};

export const consumeReviewRequestRateLimit = async (
	scope: ReviewRequestRateLimitScope,
	key: string,
	options: ReviewRequestRateLimitOptions
): Promise<ReviewRequestRateLimitResult> => {
	const now = new Date();
	const cutoff = new Date(now.getTime() - options.windowMs);

	const updated = await reviewRequestRateLimits.findOneAndUpdate(
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

	if (!updated) {
		throw new Error('Review request rate-limit update returned no document');
	}

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
};
