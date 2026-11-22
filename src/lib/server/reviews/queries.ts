import type { Document, Filter, FindOptions, ObjectId } from 'mongodb';
import { bars } from '$lib/db/bars';
import {
	ACTIVE_REVIEW_FILTER,
	PUBLIC_REVIEW_FILTER,
	withReviewVisibility
} from '$lib/server/review-publication';
import type { BarReview } from '$lib/types/bar-review';

export const findVisibleReviewBySlug = (slug: string, isAuthenticated: boolean) =>
	bars.findOne(withReviewVisibility({ slug }, isAuthenticated));

export const findActiveReviewById = (reviewId: ObjectId) =>
	bars.findOne({ $and: [{ _id: reviewId }, ACTIVE_REVIEW_FILTER] });

export const findActiveReviewIdBySlug = async (slug: string) =>
	(
		await bars.findOne<Pick<BarReview, '_id'>>(withReviewVisibility({ slug }, true), {
			projection: { _id: 1 }
		})
	)?._id;

export const findVisibleReviewForImage = (filename: string, isAuthenticated: boolean) =>
	bars.findOne<Pick<BarReview, 'publicationStatus'>>(
		withReviewVisibility({ image: filename }, isAuthenticated),
		{ projection: { publicationStatus: 1, _id: 0 } }
	);

export const listVisibleReviews = (
	filter: Filter<BarReview>,
	isAuthenticated: boolean,
	options?: FindOptions<BarReview>
) => bars.find(withReviewVisibility(filter, isAuthenticated), options).toArray();

export const listActiveReviews = (options?: FindOptions<BarReview>) =>
	bars.find(ACTIVE_REVIEW_FILTER, options).toArray();

export const listPublicReviews = (options: FindOptions<BarReview>) =>
	bars.find(PUBLIC_REVIEW_FILTER, options).toArray();

export const listPublicReviewLocations = () => bars.distinct('location', PUBLIC_REVIEW_FILTER);

export const aggregatePublicReviews = <Result extends Document>(
	filter: Filter<BarReview>,
	stages: Document[]
) =>
	bars.aggregate<Result>([{ $match: { $and: [PUBLIC_REVIEW_FILTER, filter] } }, ...stages]).next();
