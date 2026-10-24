import {
	MAX_REVIEW_IMAGE_SIZE_BYTES,
	REVIEW_IMAGE_ACCEPT,
	REVIEW_IMAGE_TOO_LARGE_MESSAGE,
	REVIEW_IMAGE_ALLOWED_TYPES_LABEL
} from '#lib/constants.js';
import type { ReviewImagePreview } from '#lib/types/review-image.js';

export function isReviewImageFilename(filename: string): boolean {
	return /^[0-9a-f]{24}\.(?:jpe?g|png|webp)$/i.test(filename);
}

export function getReviewImageSources(
	image: string | undefined,
	preview: ReviewImagePreview,
	fallback: string
): { initial: string; original: string } {
	if (!image) return { initial: fallback, original: fallback };
	if (isReviewImageFilename(image)) {
		const original = `/images/${image}`;
		return { initial: `${original}?preview=${preview}`, original };
	}
	const original = /^(https?:|blob:|\/)/.test(image) ? image : `/images/${image}`;
	return { initial: original, original };
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
