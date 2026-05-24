const ALLOWED_IMAGE_MIME: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif'
};

export const MAX_IMAGE_SIZE = 25 * 1024 * 1024;
export const MAX_SHORT_TEXT = 300;
export const MAX_LONG_TEXT = 20000;
export const MAX_SLUG_LENGTH = 200;
export const MAX_COAUTHORS = 50;

export const REVIEW_RATING_FIELD_NAMES =
	'atmosphere, service, selection, quality, price, cleanliness, soundLevel, barhopPotential';

const isDisallowedControlCharacter = (value: string): boolean => {
	const code = value.charCodeAt(0);
	return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
};

const stripControlCharacters = (value: string): string => {
	return Array.from(value)
		.filter((character) => !isDisallowedControlCharacter(character))
		.join('');
};

export const sanitizePlainText = (value: string): string => {
	return stripControlCharacters(value).replace(/\s+/g, ' ').trim();
};

export const sanitizeLongText = (value: string): string => {
	return stripControlCharacters(value).trim();
};

export const sanitizeSlug = (value: string): string => {
	return stripControlCharacters(value)
		.trim()
		.replace(/\s+/g, '-')
		.replace(/[^0-9A-Za-z\u00C0-\u017F-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^[-]+|[-]+$/g, '');
};

export const normalizeCoAuthors = (
	coAuthorsArray: FormDataEntryValue[],
	currentUsername: string
): string[] => {
	return Array.from(
		new Set(
			coAuthorsArray
				.filter((c): c is string => typeof c === 'string')
				.map((c) => sanitizePlainText(c))
				.filter((c) => c.length > 0 && c !== currentUsername)
		)
	);
};

export const hasInvalidRatingValues = (values: number[]): boolean => {
	return values.some((v) => Number.isNaN(v) || v < 0 || v > 5);
};

export const hasInvalidOverallRating = (value: number): boolean => {
	return Number.isNaN(value) || !Number.isInteger(value) || value < 0 || value > 3;
};

export const getImageExtension = (mimeType: string): string | undefined => {
	return ALLOWED_IMAGE_MIME[mimeType];
};

export const matchesImageSignature = (bytes: Uint8Array, mimeType: string): boolean => {
	if (mimeType === 'image/jpeg') {
		return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
	}

	if (mimeType === 'image/png') {
		return (
			bytes.length >= 8 &&
			bytes[0] === 0x89 &&
			bytes[1] === 0x50 &&
			bytes[2] === 0x4e &&
			bytes[3] === 0x47 &&
			bytes[4] === 0x0d &&
			bytes[5] === 0x0a &&
			bytes[6] === 0x1a &&
			bytes[7] === 0x0a
		);
	}

	if (mimeType === 'image/webp') {
		return (
			bytes.length >= 12 &&
			String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
			String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
		);
	}

	if (mimeType === 'image/gif') {
		if (bytes.length < 6) return false;
		const magic = String.fromCharCode(...bytes.slice(0, 6));
		return magic === 'GIF87a' || magic === 'GIF89a';
	}

	return false;
};

export const isDuplicateSlugError = (error: unknown): boolean => {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: number }).code === 11000
	);
};
