import {
	MAX_REVIEW_IMAGE_SIZE_BYTES,
	REVIEW_IMAGE_ACCEPT,
	REVIEW_IMAGE_TOO_LARGE_MESSAGE,
	REVIEW_IMAGE_ALLOWED_TYPES_LABEL
} from '$lib/constants';

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
