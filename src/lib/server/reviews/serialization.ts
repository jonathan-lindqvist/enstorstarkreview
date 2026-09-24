import type { BarReview, SerializedBarReview } from '$lib/types/bar-review';
import { getReviewPublicationStatus } from '$lib/server/review-publication';

export const serializeReview = (review: BarReview): SerializedBarReview => ({
	...review,
	_id: review._id.toString(),
	publicationStatus: getReviewPublicationStatus(review)
});
