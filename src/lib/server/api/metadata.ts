import { BAR_ATTRIBUTES } from '$lib/bar-attributes';
import { BEER_BRANDS, MAX_BEER_BRAND_LENGTH } from '$lib/beer-brands';
import { ALLOWED_REVIEW_IMAGE_MIME_TYPES } from '$lib/constants';
import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
import {
	MAX_AUTHORS,
	MAX_LONG_TEXT,
	MAX_SHORT_TEXT,
	MAX_SLUG_LENGTH
} from '$lib/server/reviews/form';
import { MAX_BEER_PRICE_KR } from '$lib/utils/price';
import {
	OVERALL_RATING_MAX,
	OVERALL_RATING_MIN,
	OVERALL_RATING_THRESHOLDS
} from '$lib/utils/ratings';
import type { ApiSchemas } from './openapi';
import { API_IMAGE_MAX_BYTES } from './review-input';

/** Everything a client needs to render ratings and build the review form. */
export const buildReviewMetadata = (): ApiSchemas['ReviewMetadata'] => ({
	ratingMetrics: REVIEW_RATING_METRICS.map(({ key, label, description, weight }) => ({
		key,
		label,
		description,
		weight
	})),
	overallRating: {
		minimum: OVERALL_RATING_MIN,
		maximum: OVERALL_RATING_MAX,
		thresholds: OVERALL_RATING_THRESHOLDS.map((threshold) => ({ ...threshold }))
	},
	beerBrands: [...BEER_BRANDS],
	barAttributes: BAR_ATTRIBUTES.map(({ key, label }) => ({ key, label })),
	limits: {
		titleMaxLength: MAX_SHORT_TEXT,
		descriptionMaxLength: MAX_LONG_TEXT,
		locationMaxLength: MAX_SHORT_TEXT,
		slugMaxLength: MAX_SLUG_LENGTH,
		beerBrandMaxLength: MAX_BEER_BRAND_LENGTH,
		beerPriceMinKr: 1,
		beerPriceMaxKr: MAX_BEER_PRICE_KR,
		maxAuthors: MAX_AUTHORS,
		imageMaxBytes: API_IMAGE_MAX_BYTES,
		imageContentTypes: [...ALLOWED_REVIEW_IMAGE_MIME_TYPES]
	}
});
