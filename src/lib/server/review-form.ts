import { fail, type ActionFailure } from '@sveltejs/kit';
import sharp from 'sharp';
import { ALLOWED_REVIEW_IMAGE_MIME_TYPES, MAX_REVIEW_IMAGE_SIZE_BYTES } from '$lib/constants';
import type { BarReviewFormData, ReviewFormActionData } from '$lib/types/bar-review';

const ALLOWED_IMAGE_MIME: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

export const MAX_IMAGE_SIZE = MAX_REVIEW_IMAGE_SIZE_BYTES;
export const MAX_SHORT_TEXT = 300;
export const MAX_LONG_TEXT = 20000;
export const MAX_SLUG_LENGTH = 200;
export const MAX_COAUTHORS = 50;
export const DEFAULT_IMAGE_FOCUS = 50;

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

const formNumber = (value: FormDataEntryValue | null): number => {
	return typeof value === 'string' ? Number(value) : Number.NaN;
};

export const normalizeImageFocus = (
	value: FormDataEntryValue | number | null | undefined
): number => {
	const numberValue = typeof value === 'number' ? value : formNumber(value ?? null);
	if (!Number.isFinite(numberValue)) return DEFAULT_IMAGE_FOCUS;
	return Math.min(100, Math.max(0, numberValue));
};

export const buildReviewFormData = (data: FormData, currentUsername: string): BarReviewFormData => {
	return {
		barName:
			typeof data.get('bar-name') === 'string'
				? sanitizePlainText(data.get('bar-name') as string)
				: '',
		description:
			typeof data.get('description') === 'string'
				? sanitizeLongText(data.get('description') as string)
				: '',
		address:
			typeof data.get('address') === 'string'
				? sanitizePlainText(data.get('address') as string)
				: '',
		slug: typeof data.get('slug') === 'string' ? sanitizeSlug(data.get('slug') as string) : '',
		coAuthors: normalizeCoAuthors(data.getAll('co-authors'), currentUsername),
		imageFocusX: normalizeImageFocus(data.get('imageFocusX')),
		imageFocusY: normalizeImageFocus(data.get('imageFocusY')),
		rating: formNumber(data.get('rating')),
		atmosphere: formNumber(data.get('atmosphere')),
		service: formNumber(data.get('service')),
		selection: formNumber(data.get('selection')),
		quality: formNumber(data.get('quality')),
		price: formNumber(data.get('price')),
		cleanliness: formNumber(data.get('cleanliness')),
		soundLevel: formNumber(data.get('soundLevel')),
		barhopPotential: formNumber(data.get('barhopPotential'))
	};
};

export const getReviewRatingValues = (formData: BarReviewFormData): number[] => [
	formData.atmosphere,
	formData.service,
	formData.selection,
	formData.quality,
	formData.price,
	formData.cleanliness,
	formData.soundLevel,
	formData.barhopPotential
];

type ReviewFailureStatus = 400 | 401 | 404;

export const failReviewForm = (
	status: ReviewFailureStatus,
	message: string,
	pointer: string = '/',
	formData?: BarReviewFormData
): ActionFailure<ReviewFormActionData> => {
	return fail(status, {
		pointer,
		message,
		...formData
	});
};

export const hasInvalidRatingValues = (values: number[]): boolean => {
	return values.some((v) => Number.isNaN(v) || v < 0 || v > 5);
};

export const hasInvalidOverallRating = (value: number): boolean => {
	return Number.isNaN(value) || !Number.isInteger(value) || value < 0 || value > 3;
};

export const getImageExtension = (mimeType: string): string | undefined => {
	if (!(ALLOWED_REVIEW_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) return undefined;
	return ALLOWED_IMAGE_MIME[mimeType];
};

export const sanitizeReviewImage = async (bytes: Uint8Array, mimeType: string): Promise<Buffer> => {
	const image = sharp(Buffer.from(bytes)).rotate();

	if (mimeType === 'image/jpeg') {
		return image.jpeg({ quality: 90 }).toBuffer();
	}

	if (mimeType === 'image/png') {
		return image.png().toBuffer();
	}

	if (mimeType === 'image/webp') {
		return image.webp({ quality: 90 }).toBuffer();
	}

	throw new Error(`Unsupported image type: ${mimeType}`);
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
