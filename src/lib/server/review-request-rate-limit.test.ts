import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findOneAndUpdate: vi.fn()
}));

vi.mock('$lib/db/db', () => ({
	default: {
		collection: vi.fn(() => ({ findOneAndUpdate: mocks.findOneAndUpdate }))
	}
}));

import {
	REVIEW_REQUEST_IP_LIMIT,
	consumeReviewRequestRateLimit
} from './review-request-rate-limit';

describe('review request rate limiting', () => {
	beforeEach(() => {
		mocks.findOneAndUpdate.mockReset();
		vi.useRealTimers();
	});

	it('atomically appends an allowed attempt and reports the remaining allowance', async () => {
		mocks.findOneAndUpdate.mockResolvedValueOnce({
			_id: 'ip:hashed',
			scope: 'ip',
			attempts: [new Date()],
			lastAllowed: true,
			createdAt: new Date(),
			updatedAt: new Date()
		});

		const result = await consumeReviewRequestRateLimit(
			'ip',
			'203.0.113.20',
			REVIEW_REQUEST_IP_LIMIT
		);

		expect(result).toEqual({ allowed: true, retryAfterSeconds: 0, remainingAttempts: 4 });
		expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
			{ _id: expect.stringMatching(/^ip:[0-9a-f]{64}$/) },
			expect.any(Array),
			{ upsert: true, returnDocument: 'after' }
		);
		expect(JSON.stringify(mocks.findOneAndUpdate.mock.calls[0])).not.toContain('203.0.113.20');
	});

	it('returns the rolling-window retry time when the limit is full', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-08-02T12:00:00.000Z'));
		const oldestAttempt = new Date('2026-08-01T13:00:00.000Z');
		mocks.findOneAndUpdate.mockResolvedValueOnce({
			_id: 'ip:hashed',
			scope: 'ip',
			attempts: [oldestAttempt, new Date(), new Date(), new Date(), new Date()],
			lastAllowed: false,
			createdAt: oldestAttempt,
			updatedAt: new Date()
		});

		const result = await consumeReviewRequestRateLimit(
			'ip',
			'203.0.113.21',
			REVIEW_REQUEST_IP_LIMIT
		);

		expect(result).toEqual({ allowed: false, retryAfterSeconds: 3_600, remainingAttempts: 0 });
	});

	it('prunes attempts older than the rolling window in the atomic pipeline', async () => {
		vi.useFakeTimers();
		const now = new Date('2026-08-02T12:00:00.000Z');
		vi.setSystemTime(now);
		mocks.findOneAndUpdate.mockResolvedValueOnce({
			_id: 'ip:hashed',
			scope: 'ip',
			attempts: [now],
			lastAllowed: true,
			createdAt: now,
			updatedAt: now
		});

		await consumeReviewRequestRateLimit('ip', '203.0.113.22', REVIEW_REQUEST_IP_LIMIT);

		const pipeline = mocks.findOneAndUpdate.mock.calls[0][1];
		const cutoff = pipeline[0].$set._activeAttempts.$filter.cond.$gte[1];
		expect(cutoff).toEqual(new Date(now.getTime() - REVIEW_REQUEST_IP_LIMIT.windowMs));
	});

	it('fails closed if MongoDB returns no updated document', async () => {
		mocks.findOneAndUpdate.mockResolvedValueOnce(null);

		await expect(
			consumeReviewRequestRateLimit('global', 'discord-delivery', {
				maxAttempts: 30,
				windowMs: 3_600_000
			})
		).rejects.toThrow('returned no document');
	});
});
