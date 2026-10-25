import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';
import { createReviewRatingValues } from '$lib/review-metadata';
import type { BarReview } from '$lib/types/bar-review';

const mocks = vi.hoisted(() => ({
	findOne: vi.fn(),
	updateOne: vi.fn(),
	audit: vi.fn(),
	statistics: vi.fn(),
	map: vi.fn()
}));
vi.mock('$lib/db/bars', () => ({ bars: { findOne: mocks.findOne, updateOne: mocks.updateOne } }));
vi.mock('$lib/db/users', () => ({ users: {} }));
vi.mock('$lib/db/map-geocodes', () => ({ mapGeocodes: {} }));
vi.mock('$lib/server/audit', () => ({ logAuditEvent: mocks.audit }));
vi.mock('$lib/server/request', () => ({ getRequestIp: () => 'test-ip' }));
vi.mock('$lib/server/review-images', () => ({
	uploadReviewImage: vi.fn(),
	cleanupReviewImageUpload: vi.fn()
}));
vi.mock('$lib/server/review-statistics', () => ({
	invalidatePublicReviewStatisticsCache: mocks.statistics
}));
vi.mock('$lib/server/review-map', () => ({ invalidatePublicReviewMapCache: mocks.map }));

import { reviewETag } from '$lib/server/api/reviews';
import { DELETE } from './api/v1/reviews/[slug]/+server';

const review: BarReview = {
	_id: new ObjectId(),
	title: 'Baren',
	description: 'Beskrivning',
	location: 'Gatan 1',
	slug: 'baren',
	...createReviewRatingValues(3),
	rating: 2,
	image: 'image.jpg',
	author: 'editor',
	coAuthors: [],
	publicationStatus: 'draft',
	createdAt: new Date(0),
	updatedAt: new Date(1000)
};
const currentTag = reviewETag(review);

const deleteEvent = (
	username: string | null,
	ifMatch: string | null = currentTag,
	slug = 'baren'
) =>
	({
		params: { slug },
		locals: { user: username ? { username } : null },
		request: new Request(`http://localhost/api/v1/reviews/${slug}`, {
			method: 'DELETE',
			headers: ifMatch ? { 'if-match': ifMatch } : {}
		}),
		url: new URL(`http://localhost/api/v1/reviews/${slug}`)
	}) as unknown as Parameters<typeof DELETE>[0];

const problemCode = async (response: Response) => (await response.json()).code;

beforeEach(() => {
	vi.resetAllMocks();
	mocks.findOne.mockResolvedValue(review);
	mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
});

describe('API review deletion', () => {
	it('denies and audits anonymous requests without reading the review', async () => {
		const response = await DELETE(deleteEvent(null));

		expect(response.status).toBe(401);
		expect(mocks.findOne).not.toHaveBeenCalled();
		expect(mocks.audit.mock.calls.map(([event]) => [event.outcome, event.reason])).toEqual([
			['denied', 'unauthenticated_api_delete']
		]);
	});

	it('requires a current strong version before writing', async () => {
		const missing = await DELETE(deleteEvent('bob', null));
		expect(missing.status).toBe(428);
		expect(await problemCode(missing)).toBe('precondition_required');

		for (const header of ['*', `W/${currentTag}`, '"stale"']) {
			const response = await DELETE(deleteEvent('bob', header));
			expect(response.status).toBe(412);
			expect(await problemCode(response)).toBe('precondition_failed');
		}
		expect(mocks.updateOne).not.toHaveBeenCalled();
		expect(mocks.statistics).not.toHaveBeenCalled();
	});

	it('soft-deletes the matching version, refreshes public caches and returns no content', async () => {
		const response = await DELETE(deleteEvent('bob'));

		expect(response.status).toBe(204);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.text()).toBe('');
		const [filter, update] = mocks.updateOne.mock.calls[0];
		expect(filter).toMatchObject({ _id: review._id, updatedAt: review.updatedAt });
		expect(update.$set).toMatchObject({ deletedBy: 'bob' });
		expect(mocks.statistics).toHaveBeenCalledTimes(1);
		expect(mocks.map).toHaveBeenCalledTimes(1);
	});

	it('does not delete a review that was edited after the version check', async () => {
		mocks.findOne
			.mockResolvedValueOnce(review)
			.mockResolvedValueOnce({ ...review, updatedAt: new Date(2000) });

		const response = await DELETE(deleteEvent('bob'));

		expect(response.status).toBe(409);
		expect(await problemCode(response)).toBe('concurrent_update');
		expect(mocks.updateOne).not.toHaveBeenCalled();
		expect(mocks.statistics).not.toHaveBeenCalled();
	});

	it('returns not found for invalid slugs and missing or deleted reviews', async () => {
		expect((await DELETE(deleteEvent('bob', currentTag, '%'))).status).toBe(404);
		mocks.findOne.mockResolvedValue(null);
		expect((await DELETE(deleteEvent('bob'))).status).toBe(404);
		expect(mocks.updateOne).not.toHaveBeenCalled();
	});

	it('fails closed without details when storage throws', async () => {
		mocks.updateOne.mockRejectedValue(new Error('disk on fire'));
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const response = await DELETE(deleteEvent('bob'));

		expect(response.status).toBe(500);
		expect(JSON.stringify(await response.json())).not.toContain('disk on fire');
		expect(mocks.statistics).not.toHaveBeenCalled();
	});
});
