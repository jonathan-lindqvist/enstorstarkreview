import { OTHER_BEER_BRAND_VALUE, isListedBeerBrand } from '$lib/beer-brands';
import type { BarAttributeKey } from '$lib/types/bar-attributes';
import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
import type { BarReviewFormData } from '$lib/types/bar-review';
import type { ReviewFormProblem } from '$lib/types/review-form';
import { calculateOverallRating } from '$lib/utils/ratings';
import { generateSlug } from '$lib/utils/slug';
import type { ApiSchemas } from './schemas';
import type { RpcContext } from './context';
import { problem, type ProcedureError } from './errors';

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

const decodeImage = (image: ApiSchemas['ImageUpload']): File => {
	const { data, contentType } = image;
	const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
	const decodedBytes = (data.length / 4) * 3 - padding;

	if (decodedBytes > API_IMAGE_MAX_BYTES) {
		throw problem('payload_too_large', 'Bilden är för stor.', {
			errors: [{ pointer: '/image/data', detail: 'Bilden är för stor.' }]
		});
	}
	if (!isBase64(data, padding)) {
		throw problem('validation_failed', 'Kontrollera fälten.', {
			errors: [{ pointer: '/image/data', detail: 'Bilden är inte giltig base64.' }]
		});
	}

	const bytes = Buffer.from(data, 'base64');
	return new File([bytes], `upload.${IMAGE_EXTENSIONS[contentType]}`, { type: contentType });
};

/**
 * Builds the form fields that the create and edit workflows accept, so API writes use the same
 * sanitization, validation, authorship, slug and image rules as the web form.
 * `currentAttributes` are the stored attributes of an edited review; they are kept when the
 * request omits `attributes`. Throws a problem for an invalid or oversized image.
 */
export const toReviewFormData = (
	input: ReviewInput,
	options: {
		id?: string;
		currentAttributes?: readonly BarAttributeKey[];
		currentBeerVolumeCl?: number | null;
	} = {}
): FormData => {
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
	const volume =
		input.beer.volumeCl === undefined ? options.currentBeerVolumeCl : input.beer.volumeCl;
	data.set('beer-volume', volume == null ? '' : String(volume));
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

	if (input.image) data.set('image', decodeImage(input.image));

	return data;
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
	'/beer-volume': '/beer/volumeCl',
	'/authors': '/authors',
	'/rating': '/overallRating',
	'/image': '/image'
};

export const toApiPointer = (pointer: string): string => API_POINTERS[pointer] ?? '';

const API_PROBLEMS = {
	duplicate_slug: 'duplicate_slug',
	concurrent_update: 'concurrent_update',
	precondition_failed: 'precondition_failed',
	not_found: 'not_found',
	storage_failed: 'internal_error'
} as const;

/**
 * Turns a create or edit workflow problem into a procedure error. The API door shows the code and
 * API field pointers; the web door redisplays the form with its own status, pointer and values.
 */
export const reviewWriteProblem = (
	reviewProblem: ReviewFormProblem,
	formData: BarReviewFormData | undefined,
	channel: RpcContext['channel']
): ProcedureError => {
	const { message, pointer, status } = reviewProblem;
	const code = reviewProblem.code ? API_PROBLEMS[reviewProblem.code] : 'validation_failed';
	const withFieldErrors = code === 'validation_failed' || code === 'duplicate_slug';
	return problem(code, message, {
		...(withFieldErrors && channel === 'api'
			? { errors: [{ pointer: toApiPointer(pointer), detail: message }] }
			: {}),
		...(channel === 'web' ? { form: { status, pointer, values: formData } } : {})
	});
};
