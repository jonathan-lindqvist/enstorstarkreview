import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import type { BarReview } from '$lib/types/bar-review';
import {
	ACTIVE_REVIEW_FILTER,
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

	it('hides deleted reviews from everyone and drafts from anonymous visitors', () => {
		const slugFilter = { slug: 'testbaren' };

		expect(ACTIVE_REVIEW_FILTER).toEqual({ deletedAt: { $exists: false } });
		expect(withReviewVisibility(slugFilter, true)).toEqual({
			$and: [slugFilter, ACTIVE_REVIEW_FILTER]
		});
		expect(withReviewVisibility(slugFilter, false)).toEqual({
			$and: [slugFilter, PUBLIC_REVIEW_FILTER]
		});
		expect(PUBLIC_REVIEW_FILTER).toEqual({
			$and: [
				ACTIVE_REVIEW_FILTER,
				{ $or: [{ publicationStatus: 'published' }, { publicationStatus: { $exists: false } }] }
			]
		});
	});

	it('records a different publisher without changing credited authors', () => {
		const publicationTime = new Date('2026-02-01T12:00:00.000Z');
		const update = buildPublishReviewUpdate(
			createReview({ publicationStatus: 'draft' }),
			'bob',
			publicationTime
		);

		expect(update).toMatchObject({
			publicationStatus: 'published',
			updatedAt: publicationTime
		});
		expect(update).not.toHaveProperty('author');
		expect(update).not.toHaveProperty('coAuthors');
		expect(update.changeLog.at(-1)).toMatchObject({
			updatedAt: publicationTime,
			updatedBy: 'bob',
			changes: [{ field: 'publicationStatus', before: 'Utkast', after: 'Publicerad' }]
		});
	});

	it.each([{ coAuthors: undefined }, { coAuthors: [] }, { coAuthors: ['carol', 'carol'] }])(
		'preserves legacy co-author data %j without normalizing it on publication',
		({ coAuthors }) => {
			const draft = createReview({ publicationStatus: 'draft', coAuthors });
			const update = buildPublishReviewUpdate(draft, 'alice', new Date());
			expect({ ...draft, ...update }).toMatchObject({ author: 'alice', coAuthors });
			expect(update).not.toHaveProperty('author');
			expect(update).not.toHaveProperty('coAuthors');
			expect(update.changeLog.at(-1)?.changes).toEqual([
				{
					field: 'publicationStatus',
					label: 'Status',
					before: 'Utkast',
					after: 'Publicerad'
				}
			]);
		}
	);

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
		expect(collection.findOne).toHaveBeenCalledWith({
			$and: [{ slug: 'testbaren' }, ACTIVE_REVIEW_FILTER]
		});
		expect(collection.updateOne).toHaveBeenCalledWith(
			{
				_id: draft._id,
				slug: 'testbaren',
				publicationStatus: 'draft',
				updatedAt: draft.updatedAt,
				deletedAt: { $exists: false }
			},
			{
				$set: expect.objectContaining({
					publicationStatus: 'published',
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
