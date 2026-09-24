import { MAX_BEER_BRAND_LENGTH, OTHER_BEER_BRAND_VALUE, isListedBeerBrand } from '$lib/beer-brands';
import { REVIEW_RATING_METRICS, getReviewRatingValues } from '$lib/review-metadata';
import type { BarReviewFormData, ReviewRatingValues } from '$lib/types/bar-review';
import type {
	ReviewFormProblem,
	ReviewFailureStatus,
	ReviewFormValidationResult,
	ReviewFormValidationOptions
} from '$lib/types/review-form';
import { isValidBeerPriceKr } from '$lib/utils/price';
import { sanitizePlainText, sanitizeLongText } from '$lib/utils/review-text';
import { sanitizeSlug } from '$lib/utils/slug';

export const MAX_SHORT_TEXT = 300;
export const MAX_LONG_TEXT = 20000;
export const MAX_SLUG_LENGTH = 200;
export const MAX_AUTHORS = 51;
export const DEFAULT_IMAGE_FOCUS = 50;

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

export const buildReviewFormData = (data: FormData): BarReviewFormData => {
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
		beerBrandSelection:
			typeof data.get('beer-brand') === 'string'
				? sanitizePlainText(data.get('beer-brand') as string)
				: '',
		customBeerBrand:
			typeof data.get('custom-beer-brand') === 'string'
				? sanitizePlainText(data.get('custom-beer-brand') as string)
				: '',
		beerPriceKr: formNumber(data.get('beer-price')),
		isHappyHourPrice: typeof data.get('happy-hour-price') === 'string',
		authors: [
			...new Set(
				data
					.getAll('authors')
					.filter((name): name is string => typeof name === 'string' && name.length > 0)
			)
		],
		imageFocusX: normalizeImageFocus(data.get('imageFocusX')),
		imageFocusY: normalizeImageFocus(data.get('imageFocusY')),
		rating: formNumber(data.get('rating')),
		...buildReviewRatingFormData(data)
	};
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
		!isListedBeerBrand(formData.beerBrandSelection) &&
		formData.beerBrandSelection !== OTHER_BEER_BRAND_VALUE
			? problem('Välj vilken öl som serveras', '/beer-brand')
			: null,
	(formData) =>
		formData.beerBrandSelection === OTHER_BEER_BRAND_VALUE &&
		(!formData.customBeerBrand.length || formData.customBeerBrand.length > MAX_BEER_BRAND_LENGTH)
			? problem('Ange ett giltigt ölnamn', '/custom-beer-brand')
			: null,
	(formData) =>
		!isValidBeerPriceKr(formData.beerPriceKr) ? problem('Ogiltigt pris', '/beer-price') : null,
	(formData) =>
		!formData.slug.length || formData.slug.length > MAX_SLUG_LENGTH
			? problem('Ogiltig slug', '/slug')
			: null,
	(formData) =>
		formData.authors.length === 0 ? problem('Välj minst en författare', '/authors') : null,
	(formData) =>
		formData.authors.length > MAX_AUTHORS ? problem('För många författare', '/authors') : null
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
	options: ReviewFormValidationOptions = {}
): ReviewFormValidationResult => {
	const formData = buildReviewFormData(data);
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
