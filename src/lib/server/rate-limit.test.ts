import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	return {
		findOne: vi.fn(),
		updateOne: vi.fn(),
		deleteOne: vi.fn()
	};
});

vi.mock('$lib/db/db', () => ({
	default: {
		collection: vi.fn(() => ({
			findOne: mocks.findOne,
			updateOne: mocks.updateOne,
			deleteOne: mocks.deleteOne
		}))
	}
}));

import { clearLoginRateLimit, consumeLoginRateLimit } from './rate-limit';

describe('login rate limiting', () => {
	beforeEach(() => {
		mocks.findOne.mockReset();
		mocks.updateOne.mockReset();
		mocks.deleteOne.mockReset();
	});

	it('allows requests with empty keys without touching db', async () => {
		const result = await consumeLoginRateLimit('ip', '   ');

		expect(result).toEqual({
			allowed: true,
			retryAfterSeconds: 0,
			remainingAttempts: 8
		});
		expect(mocks.findOne).not.toHaveBeenCalled();
		expect(mocks.updateOne).not.toHaveBeenCalled();
	});

	it('returns denied when an active block exists', async () => {
		mocks.findOne.mockResolvedValueOnce({
			_id: 'ip:203.0.113.9',
			blockedUntil: new Date(Date.now() + 10_000),
			windowStart: new Date(),
			attempts: 9
		});

		const result = await consumeLoginRateLimit('ip', '203.0.113.9');

		expect(result.allowed).toBe(false);
		expect(result.remainingAttempts).toBe(0);
		expect(result.retryAfterSeconds).toBeGreaterThan(0);
		expect(mocks.updateOne).not.toHaveBeenCalled();
	});

	it('starts a new window with first attempt when no record exists', async () => {
		mocks.findOne.mockResolvedValueOnce(null);
		mocks.updateOne.mockResolvedValueOnce({ acknowledged: true });

		const result = await consumeLoginRateLimit('username', ' Alice ');

		expect(result).toEqual({
			allowed: true,
			retryAfterSeconds: 0,
			remainingAttempts: 7
		});
		expect(mocks.updateOne).toHaveBeenCalledWith(
			{ _id: 'username:alice' },
			expect.objectContaining({
				$set: expect.objectContaining({
					scope: 'username',
					key: 'alice',
					attempts: 1,
					blockedUntil: null
				}),
				$setOnInsert: expect.objectContaining({ createdAt: expect.any(Date) })
			}),
			{ upsert: true }
		);
	});

	it('blocks when attempts exceed max attempts', async () => {
		mocks.findOne.mockResolvedValueOnce({
			_id: 'username:bob',
			windowStart: new Date(Date.now() - 1000),
			attempts: 8,
			blockedUntil: null
		});
		mocks.updateOne.mockResolvedValueOnce({ acknowledged: true });

		const result = await consumeLoginRateLimit('username', 'bob');

		expect(result).toEqual({
			allowed: false,
			retryAfterSeconds: 900,
			remainingAttempts: 0
		});
		expect(mocks.updateOne).toHaveBeenCalledWith(
			{ _id: 'username:bob' },
			expect.objectContaining({
				$set: expect.objectContaining({
					attempts: 9,
					blockedUntil: expect.any(Date),
					updatedAt: expect.any(Date)
				})
			})
		);
	});

	it('clears rate limits with normalized keys', async () => {
		mocks.deleteOne.mockResolvedValueOnce({ acknowledged: true });

		await clearLoginRateLimit('ip', ' 203.0.113.10 ');
		await clearLoginRateLimit('username', '   ');

		expect(mocks.deleteOne).toHaveBeenCalledTimes(1);
		expect(mocks.deleteOne).toHaveBeenCalledWith({ _id: 'ip:203.0.113.10' });
	});
});
