import type { ReviewImagePreset, ReviewImagePreview } from '$lib/types/review-image';

export const REVIEW_IMAGE_PRESETS = {
	'card-v1': { width: 768, quality: 80, cacheVersion: 'v1', responsive: false },
	'detail-v1': { width: 1280, quality: 80, cacheVersion: 'v1', responsive: false },
	'photo-480-v2': { width: 480, quality: 90, cacheVersion: 'v2', responsive: true },
	'photo-768-v2': { width: 768, quality: 90, cacheVersion: 'v2', responsive: true },
	'photo-1280-v2': { width: 1280, quality: 90, cacheVersion: 'v2', responsive: true },
	'photo-1920-v2': { width: 1920, quality: 90, cacheVersion: 'v2', responsive: true },
	'photo-2560-v2': { width: 2560, quality: 90, cacheVersion: 'v2', responsive: true }
} as const satisfies Record<string, ReviewImagePreset>;

export const RESPONSIVE_REVIEW_IMAGE_PREVIEWS = (
	Object.keys(REVIEW_IMAGE_PRESETS) as ReviewImagePreview[]
).filter((preview) => REVIEW_IMAGE_PRESETS[preview].responsive);

export const isReviewImagePreview = (value: string): value is ReviewImagePreview =>
	Object.hasOwn(REVIEW_IMAGE_PRESETS, value);
