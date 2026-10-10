import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import type { BarReview } from '$lib/types/bar-review';
import type { SoftDeleteReviewResult } from '$lib/server/review-deletion';
import { deleteReview, type DeleteReviewDependencies } from './delete';

const review = { _id: new ObjectId(), slug: 'baren' } as BarReview;
const now = new Date('2026-02-01T12:00:00.000Z');
const context = { username: 'bob', ip: 'test-ip' };

const dependencies = (result: SoftDeleteReviewResult | Error) => {
	const softDelete = vi.fn<DeleteReviewDependencies['softDelete']>();
	if (result instanceof Error) softDelete.mockRejectedValue(result);
	else softDelete.mockResolvedValue(result);
	return {
		softDelete,
		invalidatePublicViews: vi.fn<DeleteReviewDependencies['invalidatePublicViews']>(),
		audit: vi.fn<DeleteReviewDependencies['audit']>().mockResolvedValue(undefined),
		now: () => now
	} satisfies DeleteReviewDependencies;
};

const auditReasons = (deps: ReturnType<typeof dependencies>) =>
	deps.audit.mock.calls.map(([event]) => [event.outcome, event.reason]);

describe('review deletion workflow', () => {
	it('deletes, refreshes public views and audits the deleting user', async () => {
		const deps = dependencies({ outcome: 'deleted', review });

		await expect(deleteReview('baren', context, deps)).resolves.toEqual({ ok: true });
		expect(deps.softDelete).toHaveBeenCalledWith('baren', 'bob', now);
		expect(deps.invalidatePublicViews).toHaveBeenCalledTimes(1);
		expect(deps.audit).toHaveBeenLastCalledWith({
			eventType: 'review_delete',
			outcome: 'success',
			username: 'bob',
			ip: 'test-ip',
			targetSlug: 'baren',
			targetId: review._id.toString()
		});
	});

	it('rejects an invalid slug before touching storage', async () => {
		const deps = dependencies({ outcome: 'deleted', review });

		await expect(deleteReview(null, context, deps)).resolves.toMatchObject({
			ok: false,
			status: 404,
			code: 'not_found'
		});
		expect(deps.softDelete).not.toHaveBeenCalled();
		expect(auditReasons(deps)).toEqual([
			['attempt', undefined],
			['failure', 'invalid_slug']
		]);
	});

	it.each([
		[{ outcome: 'not_found' } as const, 404, 'not_found', 'review_not_found'],
		[{ outcome: 'conflict', review } as const, 409, 'concurrent_update', 'review_state_changed']
	])('maps %j without refreshing public views', async (result, status, code, reason) => {
		const deps = dependencies(result);

		await expect(deleteReview('baren', context, deps)).resolves.toMatchObject({
			ok: false,
			status,
			code
		});
		expect(deps.invalidatePublicViews).not.toHaveBeenCalled();
		expect(auditReasons(deps).at(-1)).toEqual(['failure', reason]);
	});

	it('fails closed when storage throws', async () => {
		const deps = dependencies(new Error('database down'));
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await expect(deleteReview('baren', context, deps)).resolves.toMatchObject({
			ok: false,
			status: 500,
			code: 'storage_failed'
		});
		expect(deps.invalidatePublicViews).not.toHaveBeenCalled();
		expect(auditReasons(deps).at(-1)).toEqual(['failure', 'delete_failed']);
	});
});
