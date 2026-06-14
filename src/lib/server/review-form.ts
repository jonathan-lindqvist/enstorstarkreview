import { fail, type ActionFailure } from '@sveltejs/kit';
import { MAX_REVIEW_IMAGE_SIZE_BYTES } from '$lib/constants';
import { REVIEW_RATING_METRICS, getReviewRatingValues } from '$lib/review-metadata';
import type {
	BarReview,
	BarReviewFormData,
	BarReviewUpdate,
	ReviewChangeLogEntry,
	ReviewFieldChange,
	ReviewFormActionData,
	ReviewRatingValues
} from '$lib/types/bar-review';

export { REVIEW_RATING_FIELD_NAMES, getReviewRatingValues } from '$lib/review-metadata';

export const MAX_IMAGE_SIZE = MAX_REVIEW_IMAGE_SIZE_BYTES;
export const MAX_SHORT_TEXT = 300;
export const MAX_LONG_TEXT = 20000;
export const MAX_SLUG_LENGTH = 200;
export const MAX_COAUTHORS = 50;
export const DEFAULT_IMAGE_FOCUS = 50;

export type ReviewFailureStatus = 400 | 401 | 404;

export interface ReviewFormProblem {
	status: ReviewFailureStatus;
	message: string;
	pointer: string;
}

export type ReviewFormValidationResult =
	| { ok: true; formData: BarReviewFormData }
	| { ok: false; formData: BarReviewFormData; problem: ReviewFormProblem };

export interface ReviewFormValidationOptions {
	invalidRatingMessage?: string;
	ratingValidationPosition?: 'beforeDetails' | 'afterDetails';
}

export interface ReviewPersistenceFields {
	title: string;
	description: string;
	atmosphere: number;
	service: number;
	selection: number;
	quality: number;
	price: number;
	cleanliness: number;
	soundLevel: number;
	barhopPotential: number;
	rating: number;
	location: string;
	slug: string;
	imageFocusX: number;
	imageFocusY: number;
	coAuthors: string[];
}

export interface ReviewAuthorshipFields {
	author: string;
	coAuthors: string[];
}

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
	primaryAuthorUsername: string
): string[] => {
	return Array.from(
		new Set(
			coAuthorsArray
				.filter((c): c is string => typeof c === 'string')
				.map((c) => sanitizePlainText(c))
				.filter((c) => c.length > 0 && c !== primaryAuthorUsername)
		)
	);
};

export const buildEditedReviewAuthorship = (
	previousAuthor: string,
	currentUsername: string,
	submittedCoAuthors: string[]
): ReviewAuthorshipFields => ({
	author: currentUsername,
	coAuthors: normalizeCoAuthors([previousAuthor, ...submittedCoAuthors], currentUsername)
});

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

const buildReviewRatingFormData = (data: FormData): ReviewRatingValues =>
	Object.fromEntries(
		REVIEW_RATING_METRICS.map((metric) => [metric.key, formNumber(data.get(metric.key))])
	) as ReviewRatingValues;

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
		...buildReviewRatingFormData(data)
	};
};

export const buildEditedReviewFormData = (
	data: FormData,
	previousAuthor: string,
	currentUsername: string
): BarReviewFormData => {
	const formData = buildReviewFormData(data, currentUsername);
	const authorship = buildEditedReviewAuthorship(
		previousAuthor,
		currentUsername,
		formData.coAuthors
	);

	return {
		...formData,
		coAuthors: authorship.coAuthors
	};
};

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

export const failReviewFormProblem = (
	problem: ReviewFormProblem,
	formData?: BarReviewFormData
): ActionFailure<ReviewFormActionData> => {
	return failReviewForm(problem.status, problem.message, problem.pointer, formData);
};

export const hasInvalidRatingValues = (values: number[]): boolean => {
	return values.some((v) => Number.isNaN(v) || v < 0 || v > 5);
};

export const hasInvalidOverallRating = (value: number): boolean => {
	return Number.isNaN(value) || !Number.isInteger(value) || value < 0 || value > 3;
};

type ReviewFormValidator = (formData: BarReviewFormData) => ReviewFormProblem | null;

const problem = (
	message: string,
	pointer: string,
	status: ReviewFailureStatus = 400
): ReviewFormProblem => ({
	status,
	message,
	pointer
});

const baseValidators: ReviewFormValidator[] = [
	(formData) =>
		!formData.barName.length || formData.barName.length > MAX_SHORT_TEXT
			? problem('Ogiltigt namn på baren', '/bar-name')
			: null,
	(formData) =>
		!formData.description.length || formData.description.length > MAX_LONG_TEXT
			? problem('Ogiltig beskrivning', '/description')
			: null
];

const detailValidators: ReviewFormValidator[] = [
	(formData) =>
		!formData.address.length || formData.address.length > MAX_SHORT_TEXT
			? problem('Ogiltig adress', '/address')
			: null,
	(formData) =>
		!formData.slug.length || formData.slug.length > MAX_SLUG_LENGTH
			? problem('Ogiltig slug', '/slug')
			: null,
	(formData) =>
		formData.coAuthors.length > MAX_COAUTHORS
			? problem('För många medförfattare', '/co-authors')
			: null
];

const ratingValidators = (invalidRatingMessage: string): ReviewFormValidator[] => [
	(formData) =>
		hasInvalidRatingValues(getReviewRatingValues(formData))
			? problem(invalidRatingMessage, '/')
			: null,
	(formData) =>
		hasInvalidOverallRating(formData.rating) ? problem('Ogiltigt helhetsbetyg', '/rating') : null
];

export const validateReviewFormData = (
	data: FormData,
	currentUsername: string,
	options: ReviewFormValidationOptions = {}
): ReviewFormValidationResult => {
	const formData = buildReviewFormData(data, currentUsername);
	return validateReviewFormFields(formData, options);
};

const validateReviewFormFields = (
	formData: BarReviewFormData,
	options: ReviewFormValidationOptions = {}
): ReviewFormValidationResult => {
	const ratings = ratingValidators(options.invalidRatingMessage ?? 'Ogiltiga betyg');
	const validators =
		options.ratingValidationPosition === 'beforeDetails'
			? [...baseValidators, ...ratings, ...detailValidators]
			: [...baseValidators, ...detailValidators, ...ratings];

	for (const validate of validators) {
		const validationProblem = validate(formData);
		if (validationProblem) {
			return {
				ok: false,
				formData,
				problem: validationProblem
			};
		}
	}

	return {
		ok: true,
		formData
	};
};

export const validateEditedReviewFormData = (
	data: FormData,
	previousAuthor: string,
	currentUsername: string,
	options: ReviewFormValidationOptions = {}
): ReviewFormValidationResult => {
	return validateReviewFormFields(
		buildEditedReviewFormData(data, previousAuthor, currentUsername),
		options
	);
};

export const validateReviewCoAuthors = async (
	coAuthors: string[],
	loadValidUsernames: (coAuthors: string[]) => Promise<string[]>
): Promise<ReviewFormProblem | null> => {
	if (coAuthors.length === 0) return null;

	const validUsernames = new Set(await loadValidUsernames(coAuthors));
	return validUsernames.size === coAuthors.length
		? null
		: problem('En eller flera medförfattare är ogiltiga', '/co-authors');
};

export const buildReviewPersistenceFields = (
	formData: BarReviewFormData
): ReviewPersistenceFields => ({
	title: formData.barName,
	description: formData.description,
	atmosphere: formData.atmosphere,
	service: formData.service,
	selection: formData.selection,
	quality: formData.quality,
	price: formData.price,
	cleanliness: formData.cleanliness,
	soundLevel: formData.soundLevel,
	barhopPotential: formData.barhopPotential,
	rating: formData.rating,
	location: formData.address,
	slug: formData.slug,
	imageFocusX: formData.imageFocusX,
	imageFocusY: formData.imageFocusY,
	coAuthors: formData.coAuthors
});

const formatValue = (value: unknown): string => {
	if (Array.isArray(value)) {
		return value.length ? value.join(', ') : 'Inga';
	}
	if (typeof value === 'number') {
		return value.toString();
	}
	if (typeof value === 'string') {
		return value.length ? value : 'Tom';
	}
	if (value === undefined || value === null) {
		return 'Tom';
	}
	return String(value);
};

type ReviewChangeSource = ReviewPersistenceFields & Pick<BarReviewUpdate, 'author' | 'image'>;

interface ReviewChangeFieldSpec {
	field: string;
	label: string;
	before: (review: BarReview) => unknown;
	after: (next: ReviewChangeSource) => unknown;
	include?: (next: ReviewChangeSource) => boolean;
}

const ratingChangeFieldSpecs: ReviewChangeFieldSpec[] = REVIEW_RATING_METRICS.map((metric) => ({
	field: metric.key,
	label: metric.label,
	before: (review) => review[metric.key],
	after: (next) => next[metric.key]
}));

const REVIEW_CHANGE_FIELD_SPECS: ReviewChangeFieldSpec[] = [
	{
		field: 'author',
		label: 'Författare',
		before: (review) => review.author,
		after: (next) => next.author,
		include: (next) => next.author !== undefined
	},
	{
		field: 'title',
		label: 'Barens namn',
		before: (review) => review.title,
		after: (next) => next.title
	},
	{
		field: 'description',
		label: 'Beskrivning',
		before: (review) => review.description,
		after: (next) => next.description
	},
	{
		field: 'location',
		label: 'Adress',
		before: (review) => review.location,
		after: (next) => next.location
	},
	{
		field: 'slug',
		label: 'URL-slug',
		before: (review) => review.slug,
		after: (next) => next.slug
	},
	{
		field: 'imageFocusX',
		label: 'Bildfokus X',
		before: (review) => review.imageFocusX ?? DEFAULT_IMAGE_FOCUS,
		after: (next) => next.imageFocusX
	},
	{
		field: 'imageFocusY',
		label: 'Bildfokus Y',
		before: (review) => review.imageFocusY ?? DEFAULT_IMAGE_FOCUS,
		after: (next) => next.imageFocusY
	},
	{
		field: 'coAuthors',
		label: 'Medförfattare',
		before: (review) => review.coAuthors ?? [],
		after: (next) => next.coAuthors
	},
	...ratingChangeFieldSpecs,
	{
		field: 'rating',
		label: 'Helhetsbetyg',
		before: (review) => review.rating,
		after: (next) => next.rating
	},
	{
		field: 'image',
		label: 'Bild',
		before: (review) => review.image,
		after: (next) => next.image,
		include: (next) => next.image !== undefined
	}
];

export const buildReviewFieldChanges = (
	existingReview: BarReview,
	nextFields: ReviewChangeSource
): ReviewFieldChange[] => {
	return REVIEW_CHANGE_FIELD_SPECS.filter((spec) => spec.include?.(nextFields) ?? true)
		.filter(
			(spec) => formatValue(spec.before(existingReview)) !== formatValue(spec.after(nextFields))
		)
		.map((spec) => ({
			field: spec.field,
			label: spec.label,
			before: formatValue(spec.before(existingReview)),
			after: formatValue(spec.after(nextFields))
		}));
};

export const buildReviewChangeLog = (
	existingReview: BarReview,
	nextFields: ReviewChangeSource,
	updatedAt: Date,
	updatedBy: string
): ReviewChangeLogEntry[] => {
	const changes = buildReviewFieldChanges(existingReview, nextFields);

	if (changes.length === 0) {
		return existingReview.changeLog ?? [];
	}

	return [
		...(existingReview.changeLog ?? []),
		{
			updatedAt,
			updatedBy,
			changes
		}
	];
};

export const isDuplicateSlugError = (error: unknown): boolean => {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: number }).code === 11000
	);
};
