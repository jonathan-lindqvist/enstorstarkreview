import type { Filter, UpdateFilter } from 'mongodb';
import type {
	BarReview,
	ReviewChangeLogEntry,
	ReviewFieldChange,
	ReviewPublicationStatus
} from '$lib/types/bar-review';
import { buildEditedReviewAuthorship } from '$lib/server/review-form';

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

const formatAuthors = (authors: string[]): string => (authors.length ? authors.join(', ') : 'Inga');

export interface PublishReviewUpdate {
	publicationStatus: 'published';
	author: string;
	coAuthors: string[];
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
	const authorship = buildEditedReviewAuthorship(
		existingReview.author,
		publisher,
		existingReview.coAuthors ?? []
	);
	const previousCoAuthors = existingReview.coAuthors ?? [];
	const changes: ReviewFieldChange[] = [];

	if (existingReview.author !== authorship.author) {
		changes.push({
			field: 'author',
			label: 'Författare',
			before: existingReview.author,
			after: authorship.author
		});
	}

	if (formatAuthors(previousCoAuthors) !== formatAuthors(authorship.coAuthors)) {
		changes.push({
			field: 'coAuthors',
			label: 'Medförfattare',
			before: formatAuthors(previousCoAuthors),
			after: formatAuthors(authorship.coAuthors)
		});
	}

	changes.push({
		field: 'publicationStatus',
		label: 'Status',
		before: 'Utkast',
		after: 'Publicerad'
	});

	return {
		publicationStatus: 'published',
		author: authorship.author,
		coAuthors: authorship.coAuthors,
		changeLog: [
			...(existingReview.changeLog ?? []),
			{
				updatedAt,
				updatedBy: publisher,
				changes
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
