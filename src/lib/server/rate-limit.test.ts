import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Mongo } from '$lib/server/platform/mongo';
import * as RateLimit from './rate-limit';

const mocks = { findOneAndUpdate: vi.fn(), deleteOne: vi.fn() };
const collections = Mongo.layerTest({ loginRateLimits: mocks as never });
const consumeLoginRateLimit = (...args: Parameters<typeof RateLimit.consumeLoginRateLimit>) =>
	Effect.runPromise(RateLimit.consumeLoginRateLimit(...args).pipe(Effect.provide(collections)));
const clearLoginRateLimit = (...args: Parameters<typeof RateLimit.clearLoginRateLimit>) =>
	Effect.runPromise(RateLimit.clearLoginRateLimit(...args).pipe(Effect.provide(collections)));

describe('login rate limiting', () => {
	beforeEach(() => {
		mocks.findOneAndUpdate.mockReset();
		mocks.deleteOne.mockReset();
	});

	it('allows requests with empty keys without touching db', async () => {
		const result = await consumeLoginRateLimit('ip', '   ');

		expect(result).toEqual({
			allowed: true,
			retryAfterSeconds: 0,
			remainingAttempts: 8
		});
		expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
	});

	it('returns denied when updated state remains blocked', async () => {
		mocks.findOneAndUpdate.mockResolvedValueOnce({
			_id: 'ip:203.0.113.9',
			blockedUntil: new Date(Date.now() + 10_000),
			windowStart: new Date(Date.now() - 1000),
			attempts: 9
		});

		const result = await consumeLoginRateLimit('ip', '203.0.113.9');

		expect(result.allowed).toBe(false);
		expect(result.remainingAttempts).toBe(0);
		expect(result.retryAfterSeconds).toBeGreaterThan(0);
	});

	it('starts a new window with first attempt when no record exists', async () => {
		mocks.findOneAndUpdate.mockResolvedValueOnce({
			_id: expect.stringMatching(/^username:[0-9a-f]{64}$/),
			scope: 'username',
			key: 'alice',
			windowStart: new Date(),
			attempts: 1,
			blockedUntil: null,
			createdAt: new Date(),
			updatedAt: new Date()
		});

		const result = await consumeLoginRateLimit('username', ' Alice ');

		expect(result).toEqual({
			allowed: true,
			retryAfterSeconds: 0,
			remainingAttempts: 7
		});
		expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
			{ _id: expect.stringMatching(/^username:[0-9a-f]{64}$/) },
			expect.any(Array),
			expect.objectContaining({ upsert: true, returnDocument: 'after' })
		);
	});

	it('blocks when attempts exceed max attempts', async () => {
		mocks.findOneAndUpdate.mockResolvedValueOnce({
			_id: 'username:bob',
			windowStart: new Date(),
			attempts: 8,
			blockedUntil: new Date(Date.now() + 900_000),
			createdAt: new Date(),
			updatedAt: new Date()
		});

		const result = await consumeLoginRateLimit('username', 'bob');

		expect(result).toEqual({
			allowed: false,
			retryAfterSeconds: expect.any(Number),
			remainingAttempts: 0
		});
		expect(result.retryAfterSeconds).toBeGreaterThan(0);
	});

	it('returns permissive fallback if findOneAndUpdate unexpectedly returns null', async () => {
		mocks.findOneAndUpdate.mockResolvedValueOnce(null);

		const result = await consumeLoginRateLimit('ip', '203.0.113.77');

		expect(result).toEqual({
			allowed: true,
			retryAfterSeconds: 0,
			remainingAttempts: 8
		});
	});

	it('clears rate limits with normalized keys', async () => {
		mocks.deleteOne.mockResolvedValueOnce({ acknowledged: true });

		await clearLoginRateLimit('ip', ' 203.0.113.10 ');
		await clearLoginRateLimit('username', '   ');

		expect(mocks.deleteOne).toHaveBeenCalledTimes(1);
		expect(mocks.deleteOne).toHaveBeenCalledWith({
			_id: expect.stringMatching(/^ip:[0-9a-f]{64}$/)
		});
	});

	it('uses a fixed-length hashed identifier for long keys', async () => {
		mocks.findOneAndUpdate.mockResolvedValueOnce({
			_id: expect.stringMatching(/^ip:[0-9a-f]{64}$/),
			scope: 'ip',
			key: 'x'.repeat(256),
			windowStart: new Date(),
			attempts: 1,
			blockedUntil: null,
			createdAt: new Date(),
			updatedAt: new Date()
		});

		await consumeLoginRateLimit('ip', 'x'.repeat(5000));

		expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
			{ _id: expect.stringMatching(/^ip:[0-9a-f]{64}$/) },
			expect.any(Array),
			expect.any(Object)
		);
	});
});
