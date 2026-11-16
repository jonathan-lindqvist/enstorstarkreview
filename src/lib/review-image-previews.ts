import type { ReviewImagePreview } from '$lib/types/review-image';

export const REVIEW_IMAGE_PREVIEW_WIDTHS: Record<ReviewImagePreview, number> = {
	'card-v1': 768,
	'detail-v1': 1280,
	'photo-480-v2': 480,
	'photo-768-v2': 768,
	'photo-1280-v2': 1280,
	'photo-1920-v2': 1920,
	'photo-2560-v2': 2560
};

export const RESPONSIVE_REVIEW_IMAGE_PREVIEWS = [
	'photo-480-v2',
	'photo-768-v2',
	'photo-1280-v2',
	'photo-1920-v2',
	'photo-2560-v2'
] as const;

export const CARD_IMAGE_SIZES =
	'(min-width: 1152px) 350px, (min-width: 1024px) calc((100vw - 104px) / 3), (min-width: 640px) calc((100vw - 68px) / 2), calc(100vw - 32px)';
export const DETAIL_IMAGE_SIZES =
	'(min-width: 1152px) 520px, (min-width: 1024px) calc((100vw - 64px) / 2 - 24px), (min-width: 768px) calc((100vw - 48px) / 2 - 24px), (min-width: 640px) calc(100vw - 72px), calc(100vw - 56px)';

export const isReviewImagePreview = (value: string): value is ReviewImagePreview =>
	Object.hasOwn(REVIEW_IMAGE_PREVIEW_WIDTHS, value);
