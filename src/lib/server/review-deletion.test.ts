import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { createReviewRatingValues } from '$lib/review-metadata';
import type { BarReview } from '$lib/types/bar-review';
import { ACTIVE_REVIEW_FILTER } from './review-publication';
import { softDeleteReview } from './review-deletion';

const createReview = (overrides: Partial<BarReview> = {}): BarReview => ({
	_id: new ObjectId(),
	title: 'Testbaren',
	description: 'En recension',
	...createReviewRatingValues(4),
	rating: 2,
	image: '0123456789abcdef01234567.png',
	location: 'Testgatan 1',
	slug: 'testbaren',
	author: 'alice',
	coAuthors: [],
	changeLog: [],
	createdAt: new Date('2026-01-01T12:00:00.000Z'),
	updatedAt: new Date('2026-01-01T12:00:00.000Z'),
	...overrides
});

const collectionFor = (review: BarReview | null, modifiedCount = 1) => ({
	findOne: vi.fn().mockResolvedValue(review),
	updateOne: vi.fn().mockResolvedValue({ modifiedCount })
});

describe('soft review deletion', () => {
	it('marks only the active review loaded from the slug as deleted and keeps the document', async () => {
		const review = createReview({ publicationStatus: 'draft' });
		const collection = collectionFor(review);
		const deletedAt = new Date('2026-02-01T12:00:00.000Z');

		await expect(softDeleteReview(collection, 'testbaren', 'bob', deletedAt)).resolves.toEqual({
			outcome: 'deleted',
			review
		});
		expect(collection.findOne).toHaveBeenCalledWith({
			$and: [{ slug: 'testbaren' }, ACTIVE_REVIEW_FILTER]
		});
		const [filter, update] = collection.updateOne.mock.calls[0];
		expect(filter).toEqual({
			_id: review._id,
			slug: 'testbaren',
			updatedAt: review.updatedAt,
			deletedAt: { $exists: false }
		});
		expect(update).toEqual({
			$set: {
				deletedAt,
				deletedBy: 'bob',
				updatedAt: deletedAt,
				changeLog: [
					{
						updatedAt: deletedAt,
						updatedBy: 'bob',
						changes: [{ field: 'deletedAt', label: 'Status', before: 'Utkast', after: 'Borttagen' }]
					}
				]
			}
		});
		expect(update.$set).not.toHaveProperty('publicationStatus');
	});

	it('describes legacy reviews without a status as published in the history', async () => {
		const collection = collectionFor(createReview());
		await softDeleteReview(collection, 'testbaren', 'bob', new Date());
		expect(collection.updateOne.mock.calls[0][1].$set.changeLog.at(-1).changes[0]).toMatchObject({
			before: 'Publicerad',
			after: 'Borttagen'
		});
	});

	it('reports missing and already deleted reviews as not found without writing', async () => {
		const collection = collectionFor(null);
		await expect(softDeleteReview(collection, 'testbaren', 'bob', new Date())).resolves.toEqual({
			outcome: 'not_found'
		});
		expect(collection.updateOne).not.toHaveBeenCalled();
	});

	it('reports a conflict when the review changes between reading and deleting', async () => {
		const review = createReview();
		await expect(
			softDeleteReview(collectionFor(review, 0), 'testbaren', 'bob', new Date())
		).resolves.toEqual({ outcome: 'conflict', review });
	});
});
