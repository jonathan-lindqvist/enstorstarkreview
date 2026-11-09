import { describe, expect, it, vi } from 'vitest';
import type { PublishDraftReviewResult } from '$lib/server/review-publication';
import { publishReview, type PublishReviewDependencies } from './publish';
import { createExistingReview } from './test-fixtures';

const context = { username: 'bob', ip: '203.0.113.5' };

const createDependencies = (
	result: PublishDraftReviewResult | Error
): PublishReviewDependencies & {
	notifyPublished: ReturnType<typeof vi.fn<PublishReviewDependencies['notifyPublished']>>;
} => ({
	publishDraft: vi.fn(async () => {
		if (result instanceof Error) throw result;
		return result;
	}),
	invalidatePublicViews: vi.fn(),
	notifyPublished: vi.fn<PublishReviewDependencies['notifyPublished']>(),
	audit: vi.fn(async () => {}),
	now: () => new Date('2026-11-09T12:00:00.000Z')
});

describe('publishReview notifications', () => {
	it('announces a successful first publication once, with the publisher', async () => {
		const review = createExistingReview({ publicationStatus: 'draft' });
		const deps = createDependencies({ outcome: 'published', review });

		const result = await publishReview(review.slug, context, deps);

		expect(result).toEqual({ ok: true, slug: review.slug });
		expect(deps.notifyPublished).toHaveBeenCalledTimes(1);
		expect(deps.notifyPublished).toHaveBeenCalledWith(review, 'bob');
	});

	it.each([
		['not found', { outcome: 'not_found' } as const],
		[
			'already published',
			{ outcome: 'already_published', review: createExistingReview() } as const
		],
		['a concurrent change', { outcome: 'conflict', review: createExistingReview() } as const]
	])('sends nothing after %s', async (_, outcome) => {
		const deps = createDependencies(outcome);
		const result = await publishReview('focus-bar', context, deps);
		expect(result.ok).toBe(false);
		expect(deps.notifyPublished).not.toHaveBeenCalled();
	});

	it('sends nothing for an invalid slug or a storage failure', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const invalid = createDependencies({ outcome: 'not_found' });
		await publishReview(null, context, invalid);
		expect(invalid.notifyPublished).not.toHaveBeenCalled();

		const failed = createDependencies(new Error('database down'));
		expect((await publishReview('focus-bar', context, failed)).ok).toBe(false);
		expect(failed.notifyPublished).not.toHaveBeenCalled();
		vi.restoreAllMocks();
	});

	it('still publishes when announcing throws', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const review = createExistingReview({ publicationStatus: 'draft' });
		const deps = createDependencies({ outcome: 'published', review });
		deps.notifyPublished.mockImplementation(() => {
			throw new Error('push misconfigured');
		});

		expect(await publishReview(review.slug, context, deps)).toEqual({
			ok: true,
			slug: review.slug
		});
		expect(deps.audit).toHaveBeenLastCalledWith(
			expect.objectContaining({ eventType: 'review_publish', outcome: 'success' })
		);
		vi.restoreAllMocks();
	});
});
