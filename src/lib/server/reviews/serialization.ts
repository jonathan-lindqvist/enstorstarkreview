import type { BarReview, SerializedBarReview } from '$lib/types/bar-review';
import { getReviewPublicationStatus } from '$lib/server/review-publication';
import { normalizeBarAttributes } from '$lib/bar-attributes';

export const serializeReview = (review: BarReview): SerializedBarReview => ({
	...review,
	_id: review._id.toString(),
	attributes: normalizeBarAttributes(review.attributes),
	publicationStatus: getReviewPublicationStatus(review)
});
