import { beforeEach, describe, expect, it, vi } from 'vitest';
import { call } from '@orpc/server';
import { reviewETag } from '../representations';
import { router } from '../router';
import { testContext, testDependencies, testReview } from '../test-fixtures';
import type { RpcContext, RpcDependencies } from '../context';

const review = testReview();
const currentTag = reviewETag(review);
let deps: RpcDependencies;

const context = (overrides: Parameters<typeof testContext>[0] = {}): RpcContext =>
	testContext({ deps, ...overrides });

const rejection = async (promise: Promise<unknown>) => {
	try {
		await promise;
	} catch (error) {
		return error as { status: number; code: string; message: string };
	}
	throw new Error('Expected the procedure to fail');
};

const auditOutcomes = () =>
	vi.mocked(deps.audit).mock.calls.map(([event]) => [event.eventType, event.outcome, event.reason]);

beforeEach(() => {
	deps = testDependencies({ reviews: { findOne: vi.fn().mockResolvedValue(review) } });
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('reviews.delete', () => {
	const remove = (ifMatch: string | undefined, ctx = context(), slug = 'baren') =>
		call(
			router.reviews.delete,
			{ params: { slug }, headers: { 'if-match': ifMatch as string } },
			{ context: ctx }
		);

	it.each([
		['api', 'unauthenticated_api_delete', 'Du behöver logga in.'],
		['web', 'unauthenticated_delete', 'Du är inte inloggad']
	] as const)(
		'denies and audits an anonymous %s caller without reading the review',
		async (channel, reason, message) => {
			const error = await rejection(remove(currentTag, context({ username: null, channel })));

			expect(error).toMatchObject({ status: 401, code: 'unauthorized', message });
			expect(deps.reviews.findOne).not.toHaveBeenCalled();
			expect(deps.reviews.delete.softDelete).not.toHaveBeenCalled();
			expect(auditOutcomes()).toEqual([['review_delete', 'denied', reason]]);
		}
	);

	it.each(['api', 'web'] as const)(
		'requires the version the %s caller saw before reading the review',
		async (channel) => {
			for (const header of [undefined, '', '  ']) {
				const error = await rejection(remove(header, context({ channel })));
				expect(error).toMatchObject({ status: 428, code: 'precondition_required' });
			}
			expect(deps.reviews.findOne).not.toHaveBeenCalled();
		}
	);

	it('rejects wildcard, weak and stale versions without writing', async () => {
		for (const header of ['*', `*, ${currentTag}`, `W/${currentTag}`, '"stale"']) {
			const error = await rejection(remove(header));
			expect(error).toMatchObject({ status: 412, code: 'precondition_failed' });
		}
		expect(deps.reviews.delete.softDelete).not.toHaveBeenCalled();
		expect(deps.reviews.delete.invalidatePublicViews).not.toHaveBeenCalled();
	});

	it('soft-deletes exactly the version the caller saw and refreshes public views', async () => {
		await expect(remove(`"older", ${currentTag}`)).resolves.toBeUndefined();

		expect(deps.reviews.delete.softDelete).toHaveBeenCalledWith(
			'baren',
			'editor',
			expect.any(Date),
			review.updatedAt
		);
		expect(deps.reviews.delete.invalidatePublicViews).toHaveBeenCalledTimes(1);
		expect(auditOutcomes().at(-1)).toEqual(['review_delete', 'success', undefined]);
	});

	it('reports a conflict when the review changed after the version check', async () => {
		vi.mocked(deps.reviews.delete.softDelete).mockResolvedValue({ outcome: 'conflict', review });

		const error = await rejection(remove(currentTag));

		expect(error).toMatchObject({ status: 409, code: 'concurrent_update' });
		expect(deps.reviews.delete.invalidatePublicViews).not.toHaveBeenCalled();
	});

	it('treats invalid slugs and missing or deleted reviews as not found', async () => {
		expect(await rejection(remove(currentTag, context(), '%'))).toMatchObject({ status: 404 });
		expect(deps.reviews.findOne).not.toHaveBeenCalled();

		vi.mocked(deps.reviews.findOne).mockResolvedValue(null);
		expect(await rejection(remove(currentTag))).toMatchObject({ status: 404, code: 'not_found' });
		expect(deps.reviews.delete.softDelete).not.toHaveBeenCalled();
	});

	it('fails closed without storage details', async () => {
		vi.mocked(deps.reviews.delete.softDelete).mockRejectedValue(new Error('disk on fire'));

		const error = await rejection(remove(currentTag));

		expect(error).toMatchObject({ status: 500, code: 'internal_error' });
		expect(error.message).not.toContain('disk on fire');
		expect(deps.reviews.delete.invalidatePublicViews).not.toHaveBeenCalled();
	});
});

describe('reviews.publish', () => {
	const publish = (ctx = context()) =>
		call(router.reviews.publish, { params: { slug: 'baren' } }, { context: ctx });

	it('denies and audits anonymous callers before the workflow', async () => {
		const error = await rejection(publish(context({ username: null })));

		expect(error).toMatchObject({ status: 401 });
		expect(deps.reviews.publish.publishDraft).not.toHaveBeenCalled();
		expect(vi.mocked(deps.audit).mock.calls[0][0]).toMatchObject({
			outcome: 'denied',
			reason: 'unauthenticated_api_publish',
			targetSlug: 'baren'
		});
	});

	it('publishes and returns the stored representation with its version', async () => {
		const published = testReview({ publicationStatus: 'published', updatedAt: new Date(5000) });
		vi.mocked(deps.reviews.findOne).mockResolvedValue(published);
		const resHeaders = new Headers();

		const result = await publish(context({ resHeaders }));

		expect(result).toMatchObject({ slug: 'baren', publicationStatus: 'published' });
		expect(resHeaders.get('etag')).toBe(reviewETag(published));
	});

	it('maps an already published review to its problem code', async () => {
		vi.mocked(deps.reviews.publish.publishDraft).mockResolvedValue({
			outcome: 'already_published',
			review
		});

		expect(await rejection(publish())).toMatchObject({ status: 409, code: 'already_published' });
	});
});

describe('reviews.list and reviews.get', () => {
	it('shows anonymous callers only published reviews', async () => {
		await call(router.reviews.list, { query: {} }, { context: context({ username: null }) });

		expect(JSON.stringify(vi.mocked(deps.reviews.find).mock.calls[0][0])).toContain('published');
	});

	it('falls back to the default sort and shortens long searches like the home page', async () => {
		vi.mocked(deps.reviews.find).mockResolvedValue([review]);

		const result = await call(
			router.reviews.list,
			{ query: { sort: 'unknown' as never, search: 'x'.repeat(200) } },
			{ context: context() }
		);

		expect(result.reviews).toHaveLength(1);
	});

	it('returns drafts to anonymous callers as not found', async () => {
		vi.mocked(deps.reviews.findOne).mockResolvedValue(null);

		const error = await rejection(
			call(
				router.reviews.get,
				{ params: { slug: 'baren' } },
				{ context: context({ username: null }) }
			)
		);

		expect(error).toMatchObject({ status: 404, code: 'not_found' });
	});
});

describe('reviews.update', () => {
	it('requires a version before reading the body', async () => {
		const read = vi.fn();
		const error = await rejection(
			call(
				router.reviews.update,
				{
					params: { slug: 'baren' },
					headers: { 'if-match': '' },
					body: { read } as never
				},
				{ context: context({ channel: 'web' }) }
			)
		);

		expect(error).toMatchObject({ status: 428, message: 'Ladda om sidan och försök igen.' });
		expect(read).not.toHaveBeenCalled();
		expect(deps.reviews.findOne).not.toHaveBeenCalled();
	});
});
