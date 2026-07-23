import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import type { BarReview } from '$lib/types/bar-review';
import {
	PUBLIC_REVIEW_FILTER,
	buildPublishReviewUpdate,
	getReviewImageCacheControl,
	getReviewPublicationStatus,
	isDraftReview,
	publishDraftReview,
	withReviewVisibility
} from './review-publication';

const createReview = (overrides: Partial<BarReview> = {}): BarReview => ({
	_id: new ObjectId(),
	title: 'Testbaren',
	description: 'En fullständig recension',
	atmosphere: 4,
	service: 4,
	selection: 4,
	quality: 4,
	price: 4,
	cleanliness: 4,
	soundLevel: 4,
	barhopPotential: 4,
	rating: 2,
	image: '0123456789abcdef01234567.png',
	location: 'Testgatan 1',
	slug: 'testbaren',
	beerPriceKr: 65,
	isHappyHourPrice: false,
	author: 'alice',
	coAuthors: ['carol'],
	changeLog: [],
	createdAt: new Date('2026-01-01T12:00:00.000Z'),
	updatedAt: new Date('2026-01-01T12:00:00.000Z'),
	...overrides
});

describe('review publication', () => {
	it('treats legacy reviews without a status as published', () => {
		expect(getReviewPublicationStatus(createReview())).toBe('published');
		expect(isDraftReview(createReview())).toBe(false);
		expect(isDraftReview(createReview({ publicationStatus: 'draft' }))).toBe(true);
		expect(getReviewImageCacheControl(createReview())).toBe('public, max-age=31536000, immutable');
		expect(getReviewImageCacheControl(createReview({ publicationStatus: 'published' }))).toBe(
			'public, max-age=31536000, immutable'
		);
		expect(getReviewImageCacheControl(createReview({ publicationStatus: 'draft' }))).toBe(
			'private, no-store'
		);
	});

	it('uses a fail-closed public filter while authenticated users receive the original filter', () => {
		const slugFilter = { slug: 'testbaren' };

		expect(withReviewVisibility(slugFilter, true)).toEqual(slugFilter);
		expect(withReviewVisibility(slugFilter, false)).toEqual({
			$and: [slugFilter, PUBLIC_REVIEW_FILTER]
		});
		expect(PUBLIC_REVIEW_FILTER).toEqual({
			$or: [{ publicationStatus: 'published' }, { publicationStatus: { $exists: false } }]
		});
	});

	it('makes a different publisher the author and retains prior contributors', () => {
		const publicationTime = new Date('2026-02-01T12:00:00.000Z');
		const update = buildPublishReviewUpdate(
			createReview({ publicationStatus: 'draft' }),
			'bob',
			publicationTime
		);

		expect(update).toMatchObject({
			publicationStatus: 'published',
			author: 'bob',
			coAuthors: ['alice', 'carol'],
			updatedAt: publicationTime
		});
		expect(update.changeLog.at(-1)).toMatchObject({
			updatedAt: publicationTime,
			updatedBy: 'bob',
			changes: [
				{ field: 'author', before: 'alice', after: 'bob' },
				{ field: 'coAuthors', before: 'carol', after: 'alice, carol' },
				{ field: 'publicationStatus', before: 'Utkast', after: 'Publicerad' }
			]
		});
	});

	it('does not create duplicate authorship changes when the author publishes', () => {
		const update = buildPublishReviewUpdate(
			createReview({ publicationStatus: 'draft', coAuthors: ['carol', 'carol'] }),
			'alice',
			new Date('2026-02-01T12:00:00.000Z')
		);

		expect(update.author).toBe('alice');
		expect(update.coAuthors).toEqual(['carol']);
		expect(update.changeLog.at(-1)?.changes).toEqual([
			{ field: 'coAuthors', label: 'Medförfattare', before: 'carol, carol', after: 'carol' },
			{
				field: 'publicationStatus',
				label: 'Status',
				before: 'Utkast',
				after: 'Publicerad'
			}
		]);
	});

	it('publishes only the draft loaded from the route slug', async () => {
		const draft = createReview({ publicationStatus: 'draft' });
		const collection = {
			findOne: vi.fn().mockResolvedValue(draft),
			updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 })
		};
		const updatedAt = new Date('2026-02-01T12:00:00.000Z');

		await expect(publishDraftReview(collection, 'testbaren', 'bob', updatedAt)).resolves.toEqual({
			outcome: 'published',
			review: draft
		});
		expect(collection.findOne).toHaveBeenCalledWith({ slug: 'testbaren' });
		expect(collection.updateOne).toHaveBeenCalledWith(
			{
				_id: draft._id,
				slug: 'testbaren',
				publicationStatus: 'draft',
				updatedAt: draft.updatedAt
			},
			{
				$set: expect.objectContaining({
					publicationStatus: 'published',
					author: 'bob',
					coAuthors: ['alice', 'carol'],
					updatedAt
				})
			}
		);
	});

	it('does not update a legacy or already-published review', async () => {
		const publishedReview = createReview();
		const collection = {
			findOne: vi.fn().mockResolvedValue(publishedReview),
			updateOne: vi.fn()
		};

		await expect(publishDraftReview(collection, 'testbaren', 'bob', new Date())).resolves.toEqual({
			outcome: 'already_published',
			review: publishedReview
		});
		expect(collection.updateOne).not.toHaveBeenCalled();
	});

	it('reports a conflict when another request publishes or edits the draft first', async () => {
		const draft = createReview({ publicationStatus: 'draft' });
		const collection = {
			findOne: vi.fn().mockResolvedValue(draft),
			updateOne: vi.fn().mockResolvedValue({ modifiedCount: 0 })
		};

		await expect(publishDraftReview(collection, 'testbaren', 'bob', new Date())).resolves.toEqual({
			outcome: 'conflict',
			review: draft
		});
	});
});
