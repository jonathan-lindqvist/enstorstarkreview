import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/db/bars', () => ({ bars: {} }));
vi.mock('$lib/db/map-geocodes', () => ({ mapGeocodes: {} }));
vi.mock('$lib/server/review-image-previews', () => ({
	ReviewImagePreviewCapacityError: class extends Error {}
}));

import type { RpcDependencies } from '$lib/server/rpc/context';
import { reviewETag } from '$lib/server/rpc/representations';
import { testDependencies, testEvent, testReview } from '$lib/server/rpc/test-fixtures';
import { actions } from './[slug]/+page.server';

// The web door of reviews.delete: the action only maps the procedure's result to a redirect or
// an action failure. The procedure's rules are tested in rpc/procedures/reviews.test.ts.
const review = testReview({ publicationStatus: 'published' });
let deps: RpcDependencies;

const deleteEvent = (username: string | null, version: string | null = reviewETag(review)) => {
	const query = version === null ? '' : `&version=${encodeURIComponent(version)}`;
	const event = testEvent(`/baren?/delete${query}`, { method: 'POST', username, deps });
	return Object.assign(event, { params: { slug: 'baren' } }) as unknown as Parameters<
		typeof actions.delete
	>[0];
};

beforeEach(() => {
	deps = testDependencies({ reviews: { findOne: vi.fn().mockResolvedValue(review) } });
});

describe('review page delete action', () => {
	it('denies and audits anonymous requests without reading the review', async () => {
		expect(await actions.delete(deleteEvent(null))).toMatchObject({
			status: 401,
			data: { message: 'Du är inte inloggad' }
		});
		expect(deps.reviews.findOne).not.toHaveBeenCalled();
		expect(vi.mocked(deps.audit).mock.calls[0][0]).toMatchObject({
			eventType: 'review_delete',
			outcome: 'denied',
			reason: 'unauthenticated_delete'
		});
	});

	it('soft-deletes the displayed version and redirects to the review list', async () => {
		await expect(actions.delete(deleteEvent('bob'))).rejects.toMatchObject({
			status: 303,
			location: '/admin/reviews?borttagen=1'
		});
		expect(deps.reviews.delete.softDelete).toHaveBeenCalledWith(
			'baren',
			'bob',
			expect.any(Date),
			review.updatedAt
		);
	});

	it('asks to reload instead of deleting without a version or with a stale one', async () => {
		expect(await actions.delete(deleteEvent('bob', null))).toMatchObject({
			status: 428,
			data: { message: 'Ladda om sidan och försök igen.' }
		});
		expect(await actions.delete(deleteEvent('bob', '"stale"'))).toMatchObject({
			status: 412,
			data: { message: 'Recensionen ändrades samtidigt. Ladda om sidan och försök igen.' }
		});
		expect(deps.reviews.delete.softDelete).not.toHaveBeenCalled();
	});

	it('returns not found for reviews that are already deleted', async () => {
		vi.mocked(deps.reviews.findOne).mockResolvedValue(null);
		expect(await actions.delete(deleteEvent('bob'))).toMatchObject({ status: 404 });
	});
});

describe('review page publish action', () => {
	it('publishes through the procedure and redirects to the review', async () => {
		const event = Object.assign(
			testEvent('/baren?/publish', { method: 'POST', username: 'bob', deps }),
			{ params: { slug: 'baren' } }
		) as unknown as Parameters<typeof actions.publish>[0];

		await expect(actions.publish(event)).rejects.toMatchObject({ status: 303, location: '/baren' });
		expect(deps.reviews.publish.publishDraft).toHaveBeenCalledWith(
			'baren',
			'bob',
			expect.any(Date)
		);
	});
});
