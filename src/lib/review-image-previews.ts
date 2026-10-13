import type { ReviewImagePreview } from '$lib/types/review-image';

export const REVIEW_IMAGE_PREVIEW_WIDTHS: Record<ReviewImagePreview, number> = {
	'card-v1': 768,
	'detail-v1': 1280
};

export const isReviewImagePreview = (value: string): value is ReviewImagePreview =>
	Object.hasOwn(REVIEW_IMAGE_PREVIEW_WIDTHS, value);
