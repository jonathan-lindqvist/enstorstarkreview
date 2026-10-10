import type { Filter, UpdateFilter } from 'mongodb';
import type { BarReview } from '$lib/types/bar-review';
import { ACTIVE_REVIEW_FILTER, isDraftReview } from './review-publication';

interface ReviewDeletionCollection {
	findOne(filter: Filter<BarReview>): Promise<BarReview | null>;
	updateOne(
		filter: Filter<BarReview>,
		update: UpdateFilter<BarReview>
	): Promise<{ modifiedCount: number }>;
}

export type SoftDeleteReviewResult =
	| { outcome: 'deleted'; review: BarReview }
	| { outcome: 'not_found' }
	| { outcome: 'conflict'; review: BarReview };

/**
 * Marks the active review behind a route slug as deleted. The document, its image and its
 * history stay; `ACTIVE_REVIEW_FILTER` hides it from every reader afterwards. The update only
 * applies to the version that was read, so a parallel edit or deletion is a conflict.
 */
export const softDeleteReview = async (
	collection: ReviewDeletionCollection,
	slug: string,
	deletedBy: string,
	deletedAt: Date
): Promise<SoftDeleteReviewResult> => {
	const review = await collection.findOne({ $and: [{ slug }, ACTIVE_REVIEW_FILTER] });
	if (!review) return { outcome: 'not_found' };

	const result = await collection.updateOne(
		{ _id: review._id, slug, updatedAt: review.updatedAt, deletedAt: { $exists: false } },
		{
			$set: {
				deletedAt,
				deletedBy,
				updatedAt: deletedAt,
				changeLog: [
					...(review.changeLog ?? []),
					{
						updatedAt: deletedAt,
						updatedBy: deletedBy,
						changes: [
							{
								field: 'deletedAt',
								label: 'Status',
								before: isDraftReview(review) ? 'Utkast' : 'Publicerad',
								after: 'Borttagen'
							}
						]
					}
				]
			}
		}
	);

	return result.modifiedCount === 1
		? { outcome: 'deleted', review }
		: { outcome: 'conflict', review };
};
