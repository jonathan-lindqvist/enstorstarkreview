import {
	MAX_REVIEW_IMAGE_SIZE_BYTES,
	REVIEW_IMAGE_ACCEPT,
	REVIEW_IMAGE_TOO_LARGE_MESSAGE,
	REVIEW_IMAGE_ALLOWED_TYPES_LABEL
} from '$lib/constants';
import type { ReviewImageDimensions, ReviewImagePreview } from '$lib/types/review-image';
import { REVIEW_IMAGE_PRESETS, RESPONSIVE_REVIEW_IMAGE_PREVIEWS } from '$lib/review-image-previews';

export function isReviewImageFilename(filename: string): boolean {
	return /^[0-9a-f]{24}\.(?:jpe?g|png|webp)$/i.test(filename);
}

export function getReviewImageSources(
	image: string | undefined,
	preview: ReviewImagePreview,
	fallback: string
): { initial: string; original: string; srcset?: string } {
	if (!image) return { initial: fallback, original: fallback };
	if (isReviewImageFilename(image)) {
		const original = `/images/${image}`;
		return {
			initial: `${original}?preview=${preview}`,
			original,
			...(REVIEW_IMAGE_PRESETS[preview].responsive
				? {
						srcset: RESPONSIVE_REVIEW_IMAGE_PREVIEWS.map(
							(preset) => `${original}?preview=${preset} ${REVIEW_IMAGE_PRESETS[preset].width}w`
						).join(', ')
					}
				: {})
		};
	}
	const original = /^(https?:|blob:|\/)/.test(image) ? image : `/images/${image}`;
	return { initial: original, original };
}

export function getReviewImageDimensions(value: unknown): ReviewImageDimensions | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const { width, height } = value as ReviewImageDimensions;
	return Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0
		? { width, height }
		: undefined;
}

/** Scale each layout slot for a landscape photo covering a square; CSS handles viewport changes. */
export function getReviewImageSizes(sizes: string, dimensions: unknown): string {
	const valid = getReviewImageDimensions(dimensions);
	if (!valid || valid.width <= valid.height) return sizes;
	const ratio = valid.width / valid.height;
	return sizes.replace(
		/(calc\([^,]+\)|[\d.]+(?:px|vw|vh|rem|em))(?=\s*(?:,|$))/g,
		(length) => `calc(${length} * ${ratio})`
	);
}

export function validateImageFile(file: File | undefined, required: boolean): string {
	if (!file) {
		return required ? 'Välj en bildfil' : '';
	}

	if (file.size > MAX_REVIEW_IMAGE_SIZE_BYTES) {
		return REVIEW_IMAGE_TOO_LARGE_MESSAGE;
	}

	if (!REVIEW_IMAGE_ACCEPT.split(',').includes(file.type)) {
		return `Ogiltig filtyp. Endast ${REVIEW_IMAGE_ALLOWED_TYPES_LABEL} är tillåtna`;
	}

	return '';
}

export function clampImageFocus(value: number): number {
	if (!Number.isFinite(value)) return 50;
	return Math.min(100, Math.max(0, value));
}
