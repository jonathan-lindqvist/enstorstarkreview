import { OTHER_BEER_BRAND_VALUE, isListedBeerBrand } from '$lib/beer-brands';
import type { BarAttributeKey } from '$lib/types/bar-attributes';
import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
import type { ReviewFormProblem } from '$lib/types/review-form';
import { calculateOverallRating } from '$lib/utils/ratings';
import { generateSlug } from '$lib/utils/slug';
import type { ApiSchemas } from './openapi';
import { internalErrorProblem, problem, validationProblem } from './problem';

/**
 * Decoded image limit for the API. Base64 adds a third, and production accepts request bodies
 * up to BODY_SIZE_LIMIT (30 MB), so the encoded image plus fields must stay below that.
 */
export const API_IMAGE_MAX_BYTES = 15 * 1024 * 1024;

type ReviewInput = ApiSchemas['ReviewCreateRequest'] | ApiSchemas['ReviewUpdateRequest'];

// Scan once with constant stack space. A repeated four-character regex group overflows
// V8's regex stack on ordinary multi-megabyte images, below the decoded-size limit.
const isBase64 = (data: string, padding: number): boolean => {
	if (!data.length || data.length % 4 !== 0) return false;
	for (let index = 0; index < data.length - padding; index++) {
		const code = data.charCodeAt(index);
		if (
			!(
				(code >= 65 && code <= 90) ||
				(code >= 97 && code <= 122) ||
				(code >= 48 && code <= 57) ||
				code === 43 ||
				code === 47
			)
		)
			return false;
	}
	return true;
};

const IMAGE_EXTENSIONS: Record<ApiSchemas['ImageContentType'], string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

type ImageDecodeResult = { ok: true; file: File } | { ok: false; response: Response };

const decodeImage = (image: ApiSchemas['ImageUpload']): ImageDecodeResult => {
	const { data, contentType } = image;
	const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
	const decodedBytes = (data.length / 4) * 3 - padding;

	if (decodedBytes > API_IMAGE_MAX_BYTES) {
		return {
			ok: false,
			response: problem(413, 'payload_too_large', 'Bilden är för stor.', {
				errors: [{ pointer: '/image/data', detail: 'Bilden är för stor.' }]
			})
		};
	}
	if (!isBase64(data, padding)) {
		return {
			ok: false,
			response: validationProblem([
				{ pointer: '/image/data', detail: 'Bilden är inte giltig base64.' }
			])
		};
	}

	const bytes = Buffer.from(data, 'base64');
	return {
		ok: true,
		file: new File([bytes], `upload.${IMAGE_EXTENSIONS[contentType]}`, { type: contentType })
	};
};

export type ReviewFormDataResult = { ok: true; data: FormData } | { ok: false; response: Response };

/**
 * Builds the form fields that the create and edit workflows accept, so API writes use the same
 * sanitization, validation, authorship, slug and image rules as the web form.
 * `currentAttributes` are the stored attributes of an edited review; they are kept when the
 * request omits `attributes`.
 */
export const toReviewFormData = (
	input: ReviewInput,
	options: { id?: string; currentAttributes?: readonly BarAttributeKey[] } = {}
): ReviewFormDataResult => {
	const data = new FormData();
	if (options.id) data.set('id', options.id);

	data.set('bar-name', input.title);
	data.set('description', input.description);
	data.set('address', input.location);
	data.set('slug', input.slug ?? generateSlug(input.title));

	if (isListedBeerBrand(input.beer.brand)) {
		data.set('beer-brand', input.beer.brand);
	} else {
		data.set('beer-brand', OTHER_BEER_BRAND_VALUE);
		data.set('custom-beer-brand', input.beer.brand);
	}
	data.set('beer-price', String(input.beer.priceKr));
	if (input.beer.isHappyHourPrice) data.set('happy-hour-price', 'on');

	for (const attribute of input.attributes ?? options.currentAttributes ?? []) {
		data.append('attributes', attribute);
	}

	for (const author of input.authors) data.append('authors', author);

	data.set('imageFocusX', String(input.imageFocus.x));
	data.set('imageFocusY', String(input.imageFocus.y));

	const ratingValues = REVIEW_RATING_METRICS.map((metric) => input.ratings[metric.key]);
	REVIEW_RATING_METRICS.forEach((metric, index) =>
		data.set(metric.key, String(ratingValues[index]))
	);
	data.set('rating', String(input.overallRating ?? calculateOverallRating(ratingValues)));

	if (input.image) {
		const image = decodeImage(input.image);
		if (!image.ok) return image;
		data.set('image', image.file);
	}

	return { ok: true, data };
};

// Web form field pointers used by the workflows, mapped to pointers into the API request body.
const API_POINTERS: Record<string, string> = {
	'/': '',
	'/bar-name': '/title',
	'/description': '/description',
	'/address': '/location',
	'/slug': '/slug',
	'/beer-brand': '/beer/brand',
	'/custom-beer-brand': '/beer/brand',
	'/beer-price': '/beer/priceKr',
	'/authors': '/authors',
	'/rating': '/overallRating',
	'/image': '/image'
};

export const toApiPointer = (pointer: string): string => API_POINTERS[pointer] ?? '';

/** Maps a create or edit workflow problem to an API problem response. */
export const reviewProblemResponse = (reviewProblem: ReviewFormProblem): Response => {
	const { message } = reviewProblem;
	const errors = [{ pointer: toApiPointer(reviewProblem.pointer), detail: message }];

	switch (reviewProblem.code) {
		case 'duplicate_slug':
			return problem(409, 'duplicate_slug', message, { errors });
		case 'concurrent_update':
			return problem(409, 'concurrent_update', message);
		case 'precondition_failed':
			return problem(412, 'precondition_failed', message);
		case 'not_found':
			return problem(404, 'not_found', message);
		case 'storage_failed':
			return internalErrorProblem();
		default:
			return validationProblem(errors, message);
	}
};
