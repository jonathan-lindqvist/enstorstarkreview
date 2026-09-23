import type { Filter, UpdateFilter } from 'mongodb';
import type {
	BarReview,
	ReviewChangeLogEntry,
	ReviewPublicationStatus
} from '$lib/types/bar-review';

export const PUBLIC_REVIEW_FILTER: Filter<BarReview> = {
	$or: [{ publicationStatus: 'published' }, { publicationStatus: { $exists: false } }]
};

export const getReviewPublicationStatus = (
	review: Pick<BarReview, 'publicationStatus'>
): ReviewPublicationStatus => review.publicationStatus ?? 'published';

export const isDraftReview = (review: Pick<BarReview, 'publicationStatus'>): boolean =>
	getReviewPublicationStatus(review) === 'draft';

export const getReviewImageCacheControl = (
	review: Pick<BarReview, 'publicationStatus'>
): 'private, no-store' | 'public, max-age=31536000, immutable' =>
	isDraftReview(review) ? 'private, no-store' : 'public, max-age=31536000, immutable';

export const withReviewVisibility = (
	filter: Filter<BarReview>,
	isAuthenticated: boolean
): Filter<BarReview> =>
	isAuthenticated
		? filter
		: {
				$and: [filter, PUBLIC_REVIEW_FILTER]
			};

export interface PublishReviewUpdate {
	publicationStatus: 'published';
	changeLog: ReviewChangeLogEntry[];
	updatedAt: Date;
}

interface ReviewPublicationCollection {
	findOne(filter: Filter<BarReview>): Promise<BarReview | null>;
	updateOne(
		filter: Filter<BarReview>,
		update: UpdateFilter<BarReview>
	): Promise<{ modifiedCount: number }>;
}

export type PublishDraftReviewResult =
	| { outcome: 'published'; review: BarReview }
	| { outcome: 'not_found' }
	| { outcome: 'already_published'; review: BarReview }
	| { outcome: 'conflict'; review: BarReview };

export const buildPublishReviewUpdate = (
	existingReview: BarReview,
	publisher: string,
	updatedAt: Date
): PublishReviewUpdate => {
	return {
		publicationStatus: 'published',
		changeLog: [
			...(existingReview.changeLog ?? []),
			{
				updatedAt,
				updatedBy: publisher,
				changes: [
					{
						field: 'publicationStatus',
						label: 'Status',
						before: 'Utkast',
						after: 'Publicerad'
					}
				]
			}
		],
		updatedAt
	};
};

export const publishDraftReview = async (
	collection: ReviewPublicationCollection,
	slug: string,
	publisher: string,
	updatedAt: Date
): Promise<PublishDraftReviewResult> => {
	const existingReview = await collection.findOne({ slug });
	if (!existingReview) return { outcome: 'not_found' };
	if (!isDraftReview(existingReview)) {
		return { outcome: 'already_published', review: existingReview };
	}

	const update = buildPublishReviewUpdate(existingReview, publisher, updatedAt);
	const result = await collection.updateOne(
		{
			_id: existingReview._id,
			slug,
			publicationStatus: 'draft',
			updatedAt: existingReview.updatedAt
		},
		{ $set: update }
	);

	return result.modifiedCount === 1
		? { outcome: 'published', review: existingReview }
		: { outcome: 'conflict', review: existingReview };
};
