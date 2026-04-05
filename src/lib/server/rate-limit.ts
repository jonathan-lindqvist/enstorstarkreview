import db from '$lib/db/db';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

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

const makeId = (scope: LoginRateLimitScope, key: string): string => `${scope}:${key}`;

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
	const existing = await loginRateLimits.findOne({ _id: id });

	if (existing?.blockedUntil && existing.blockedUntil.getTime() > now.getTime()) {
		return {
			allowed: false,
			retryAfterSeconds: Math.ceil((existing.blockedUntil.getTime() - now.getTime()) / 1000),
			remainingAttempts: 0
		};
	}

	if (!existing || now.getTime() - existing.windowStart.getTime() >= LOGIN_WINDOW_MS) {
		await loginRateLimits.updateOne(
			{ _id: id },
			{
				$set: {
					scope,
					key: normalizedKey,
					windowStart: now,
					attempts: 1,
					blockedUntil: null,
					updatedAt: now
				},
				$setOnInsert: {
					createdAt: now
				}
			},
			{ upsert: true }
		);

		return {
			allowed: true,
			retryAfterSeconds: 0,
			remainingAttempts: LOGIN_MAX_ATTEMPTS - 1
		};
	}

	const attempts = existing.attempts + 1;
	const shouldBlock = attempts > LOGIN_MAX_ATTEMPTS;
	const blockedUntil = shouldBlock ? new Date(now.getTime() + LOGIN_BLOCK_MS) : null;

	await loginRateLimits.updateOne(
		{ _id: id },
		{
			$set: {
				attempts,
				blockedUntil,
				updatedAt: now
			}
		}
	);

	return {
		allowed: !shouldBlock,
		retryAfterSeconds: shouldBlock ? Math.ceil(LOGIN_BLOCK_MS / 1000) : 0,
		remainingAttempts: Math.max(0, LOGIN_MAX_ATTEMPTS - attempts)
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
