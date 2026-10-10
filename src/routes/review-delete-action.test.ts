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

import { actions } from './[slug]/+page.server';

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
	publicationStatus: 'published',
	createdAt: new Date(0),
	updatedAt: new Date(0)
};

const deleteEvent = (username: string | null, slug = 'baren') =>
	({
		params: { slug },
		locals: { user: username ? { username } : null }
	}) as unknown as Parameters<typeof actions.delete>[0];

const auditOutcomes = () =>
	mocks.audit.mock.calls.map(([event]) => [event.eventType, event.outcome, event.reason]);

beforeEach(() => {
	vi.resetAllMocks();
	mocks.findOne.mockResolvedValue(review);
	mocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
});

describe('review page delete action', () => {
	it('denies and audits anonymous requests without reading or writing the review', async () => {
		const result = await actions.delete(deleteEvent(null));

		expect(result).toMatchObject({ status: 401, data: { message: 'Du är inte inloggad' } });
		expect(mocks.findOne).not.toHaveBeenCalled();
		expect(mocks.updateOne).not.toHaveBeenCalled();
		expect(auditOutcomes()).toEqual([['review_delete', 'denied', 'unauthenticated_delete']]);
	});

	it('soft-deletes for a signed-in user, refreshes public caches and redirects', async () => {
		await expect(actions.delete(deleteEvent('bob'))).rejects.toMatchObject({
			status: 303,
			location: '/admin/reviews?borttagen=1'
		});

		const [filter, update] = mocks.updateOne.mock.calls[0];
		expect(filter).toMatchObject({ _id: review._id, deletedAt: { $exists: false } });
		expect(update.$set).toMatchObject({ deletedBy: 'bob' });
		expect(mocks.statistics).toHaveBeenCalledTimes(1);
		expect(mocks.map).toHaveBeenCalledTimes(1);
		expect(auditOutcomes().at(-1)).toEqual(['review_delete', 'success', undefined]);
	});

	it('returns not found for invalid slugs and reviews that are already deleted', async () => {
		await expect(actions.delete(deleteEvent('bob', '%'))).resolves.toMatchObject({ status: 404 });
		expect(mocks.findOne).not.toHaveBeenCalled();

		mocks.findOne.mockResolvedValue(null);
		await expect(actions.delete(deleteEvent('bob'))).resolves.toMatchObject({ status: 404 });
		expect(mocks.updateOne).not.toHaveBeenCalled();
		expect(mocks.statistics).not.toHaveBeenCalled();
	});

	it('reports a conflict when the review changed while deleting', async () => {
		mocks.updateOne.mockResolvedValue({ modifiedCount: 0 });

		await expect(actions.delete(deleteEvent('bob'))).resolves.toMatchObject({
			status: 409,
			data: { message: 'Recensionen ändrades samtidigt. Ladda om sidan och försök igen.' }
		});
		expect(mocks.statistics).not.toHaveBeenCalled();
	});
});
