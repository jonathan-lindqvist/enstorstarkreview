import type { BarReview, SerializedBarReview } from '$lib/types/bar-review';
import { getReviewPublicationStatus } from '$lib/server/review-publication';
import { normalizeBarAttributes } from '$lib/bar-attributes';
import { getReviewImageDimensions } from '$lib/utils/review-image';

export const serializeReview = (review: BarReview): SerializedBarReview => ({
	...review,
	_id: review._id.toString(),
	attributes: normalizeBarAttributes(review.attributes),
	imageDimensions: getReviewImageDimensions(review.imageDimensions),
	publicationStatus: getReviewPublicationStatus(review)
});
