import { Exit } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { failureOf, makeTestWorld, runWorkflow } from '$lib/server/testing';
import { deleteReview } from './delete';
import { createExistingReview } from './test-fixtures';

const auditReasons = (world: ReturnType<typeof makeTestWorld>) =>
	world.audits.map((event) => [event.outcome, event.reason]);

describe('review deletion workflow', () => {
	it('deletes, refreshes public views and audits the deleting user', async () => {
		const review = createExistingReview({ slug: 'baren' });
		const world = makeTestWorld({ reviews: [review] });

		expect(await runWorkflow(world, deleteReview('baren'), { username: 'bob' })).toEqual(Exit.void);
		expect(world.reviews[0]).toMatchObject({ deletedBy: 'bob' });
		expect(world.invalidations).toBe(1);
		expect(world.audits.at(-1)).toEqual({
			eventType: 'review_delete',
			outcome: 'success',
			username: 'bob',
			ip: 'test-ip',
			targetSlug: 'baren',
			targetId: review._id.toString()
		});
	});

	it('deletes only the version the caller saw', async () => {
		const review = createExistingReview({ slug: 'baren' });
		const world = makeTestWorld({ reviews: [review] });

		const exit = await runWorkflow(
			world,
			deleteReview('baren', { expectedUpdatedAt: new Date('2025-12-31T00:00:00Z') })
		);
		expect(failureOf(exit)).toMatchObject({ _tag: 'ConcurrentUpdate' });
		expect(world.reviews[0].deletedAt).toBeUndefined();
		expect(auditReasons(world).at(-1)).toEqual(['failure', 'review_state_changed']);

		expect(
			Exit.isSuccess(
				await runWorkflow(world, deleteReview('baren', { expectedUpdatedAt: review.updatedAt }))
			)
		).toBe(true);
	});

	it('rejects an invalid slug before touching storage', async () => {
		const world = makeTestWorld({ failing: new Set(['softDelete']) });
		const exit = await runWorkflow(world, deleteReview(null));
		expect(failureOf(exit)).toMatchObject({ _tag: 'ReviewNotFound' });
		expect(auditReasons(world)).toEqual([
			['attempt', undefined],
			['failure', 'invalid_slug']
		]);
	});

	it('maps a missing review without refreshing public views', async () => {
		const world = makeTestWorld();
		const exit = await runWorkflow(world, deleteReview('baren'));
		expect(failureOf(exit)).toMatchObject({ _tag: 'ReviewNotFound' });
		expect(world.invalidations).toBe(0);
		expect(auditReasons(world).at(-1)).toEqual(['failure', 'review_not_found']);
	});

	it('fails closed when storage fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const world = makeTestWorld({
			reviews: [createExistingReview({ slug: 'baren' })],
			failing: new Set(['softDelete'])
		});
		const exit = await runWorkflow(world, deleteReview('baren'));
		expect(failureOf(exit)).toMatchObject({ _tag: 'StorageFailed' });
		expect(world.invalidations).toBe(0);
		expect(auditReasons(world).at(-1)).toEqual(['failure', 'delete_failed']);
	});
});
