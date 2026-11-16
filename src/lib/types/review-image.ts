import type { REVIEW_IMAGE_PRESETS } from '$lib/review-image-previews';

export type ReviewImagePreview = keyof typeof REVIEW_IMAGE_PRESETS;

export interface ReviewImagePreset {
	width: number;
	quality: number;
	cacheVersion: string;
	responsive: boolean;
}

export interface ReviewImageDimensions {
	width: number;
	height: number;
}
