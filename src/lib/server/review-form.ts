import { fail, type ActionFailure } from '@sveltejs/kit';
import { OTHER_BEER_BRAND_VALUE, UNKNOWN_BEER_BRAND_LABEL } from '$lib/beer-brands';
import { MAX_REVIEW_IMAGE_SIZE_BYTES } from '$lib/constants';
import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
import type {
	BarReview,
	BarReviewFormData,
	BarReviewUpdate,
	ReviewChangeLogEntry,
	ReviewFieldChange,
	ReviewFormActionData
} from '$lib/types/bar-review';
import type {
	ReviewFailureStatus,
	ReviewFormProblem,
	ReviewPersistenceFields,
	ReviewAuthorshipFields
} from '$lib/types/review-form';
import { isValidBeerPriceKr } from '$lib/utils/price';
import {
	getReviewAuthorOptions,
	getReviewAuthors,
	type ReviewAuthorCredit
} from '$lib/utils/authors';
import { DEFAULT_IMAGE_FOCUS } from './reviews/form';
export * from './reviews/form';
export type {
	ReviewFailureStatus,
	ReviewFormProblem,
	ReviewFormValidationResult,
	ReviewFormValidationOptions,
	ReviewPersistenceFields,
	ReviewAuthorshipFields
} from '$lib/types/review-form';
export { sanitizePlainText, sanitizeLongText } from '$lib/utils/review-text';
export { sanitizeSlug } from '$lib/utils/slug';
export { REVIEW_RATING_FIELD_NAMES, getReviewRatingValues } from '$lib/review-metadata';
export const MAX_IMAGE_SIZE = MAX_REVIEW_IMAGE_SIZE_BYTES;
const problem = (
	message: string,
	pointer: string,
	status: ReviewFailureStatus = 400
): ReviewFormProblem => ({ status, message, pointer });
export const buildReviewAuthorship = (
	selectedAuthors: string[],
	currentUsername: string,
	existingReview?: ReviewAuthorCredit
): ReviewAuthorshipFields => {
	const selected = new Set(selectedAuthors);
	const orderedAuthors = getReviewAuthorOptions(
		currentUsername,
		selectedAuthors,
		existingReview
	).filter((username) => selected.has(username));
	const author = selected.has(currentUsername)
		? currentUsername
		: existingReview && selected.has(existingReview.author)
			? existingReview.author
			: orderedAuthors[0];
	if (!author) throw new Error('At least one author must be selected');

	return { author, coAuthors: orderedAuthors.filter((username) => username !== author) };
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

export const validateReviewAuthors = async (
	authors: string[],
	loadValidUsernames: (authors: string[]) => Promise<string[]>,
	existingReview?: ReviewAuthorCredit
): Promise<ReviewFormProblem | null> => {
	if (authors.length === 0) return problem('Välj minst en författare', '/authors');
	const existingAuthors = new Set(getReviewAuthors(existingReview));
	const newAuthors = authors.filter((username) => !existingAuthors.has(username));
	if (newAuthors.length === 0) return null;

	const validUsernames = new Set(await loadValidUsernames(newAuthors));
	return newAuthors.every((username) => validUsernames.has(username))
		? null
		: problem('En eller flera författare är ogiltiga', '/authors');
};

export const buildReviewPersistenceFields = (
	formData: BarReviewFormData,
	currentUsername: string,
	existingReview?: ReviewAuthorCredit
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
	beerBrand:
		formData.beerBrandSelection === OTHER_BEER_BRAND_VALUE
			? formData.customBeerBrand
			: formData.beerBrandSelection,
	beerPriceKr: formData.beerPriceKr,
	isHappyHourPrice: formData.isHappyHourPrice,
	imageFocusX: formData.imageFocusX,
	imageFocusY: formData.imageFocusY,
	...buildReviewAuthorship(formData.authors, currentUsername, existingReview)
});

const formatBeerPriceChangeValue = (value: number | undefined): string | undefined => {
	return isValidBeerPriceKr(value) ? `${value} kr` : undefined;
};

const formatValue = (value: unknown): string => {
	if (Array.isArray(value)) {
		return value.length ? value.join(', ') : 'Inga';
	}
	if (typeof value === 'boolean') {
		return value ? 'Ja' : 'Nej';
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
		field: 'beerBrand',
		label: 'Öl för en stor stark',
		before: (review) => review.beerBrand || UNKNOWN_BEER_BRAND_LABEL,
		after: (next) => next.beerBrand
	},
	{
		field: 'beerPriceKr',
		label: 'Pris för en stor stark',
		before: (review) => formatBeerPriceChangeValue(review.beerPriceKr),
		after: (next) => formatBeerPriceChangeValue(next.beerPriceKr)
	},
	{
		field: 'isHappyHourPrice',
		label: 'Happy hour',
		before: (review) => review.isHappyHourPrice ?? false,
		after: (next) => next.isHappyHourPrice
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
