import { REVIEW_RATING_METRICS } from '#lib/review-metadata.js';
import { normalizeBarAttributes } from '#lib/bar-attributes.js';
import type {
	BarReviewFormData,
	ReviewFormActionData,
	ReviewRatingValues
} from '#lib/types/bar-review.js';

const DEFAULT_IMAGE_FOCUS = 50;

export const actionDataToReviewFormData = (
	form: ReviewFormActionData | null
): BarReviewFormData | null => {
	if (!form || form.barName === undefined) return null;

	const ratingValues = Object.fromEntries(
		REVIEW_RATING_METRICS.map((metric) => [metric.key, form[metric.key] ?? 0])
	) as ReviewRatingValues;

	return {
		barName: form.barName ?? '',
		description: form.description ?? '',
		address: form.address ?? '',
		slug: form.slug ?? '',
		beerBrandSelection: form.beerBrandSelection ?? '',
		customBeerBrand: form.customBeerBrand ?? '',
		beerPriceKr: form.beerPriceKr ?? Number.NaN,
		beerVolumeCl: form.beerVolumeCl ?? null,
		isHappyHourPrice: form.isHappyHourPrice ?? false,
		attributes: normalizeBarAttributes(form.attributes),
		authors: Array.isArray(form.authors) ? form.authors : [],
		imageFocusX: form.imageFocusX ?? DEFAULT_IMAGE_FOCUS,
		imageFocusY: form.imageFocusY ?? DEFAULT_IMAGE_FOCUS,
		rating: form.rating ?? 0,
		...ratingValues
	};
};
