import type { BarReview } from '$lib/types/bar-review';
import type { PublicReviewMapData } from '$lib/types/review-map';
import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
import { getReviewPublicationStatus } from '$lib/server/review-publication';
import { DEFAULT_IMAGE_FOCUS } from '$lib/server/reviews/form';
import { getReviewAuthors } from '$lib/utils/authors';
import { isValidBeerPriceKr } from '$lib/utils/price';
import { OVERALL_RATING_MAX, OVERALL_RATING_MIN } from '$lib/utils/ratings';
import type { ApiSchemas } from './openapi';

export const API_IMAGE_PATH = '/api/v1/images';

const finiteOr = (value: unknown, fallback: number): number =>
	typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const toIsoString = (value: Date | string | undefined): string => {
	const date = new Date(value ?? 0);
	return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
};

const toOverallRating = (value: unknown): number =>
	Math.min(OVERALL_RATING_MAX, Math.max(OVERALL_RATING_MIN, Math.round(finiteOr(value, 0))));

const toRatings = (review: BarReview): ApiSchemas['Ratings'] =>
	Object.fromEntries(
		REVIEW_RATING_METRICS.map((metric) => [
			metric.key,
			Math.min(5, Math.max(0, finiteOr(review[metric.key], 0)))
		])
	) as ApiSchemas['Ratings'];

/** Maps a stored review to the API shape. Tolerates legacy documents with missing fields. */
export const toApiReview = (review: BarReview): ApiSchemas['Review'] => {
	const hasValidPrice = isValidBeerPriceKr(review.beerPriceKr);
	return {
		id: review._id.toString(),
		slug: review.slug,
		title: review.title,
		description: review.description ?? '',
		location: review.location ?? '',
		ratings: toRatings(review),
		overallRating: toOverallRating(review.rating),
		beer: {
			brand: review.beerBrand?.trim() ? review.beerBrand : null,
			priceKr: hasValidPrice ? (review.beerPriceKr as number) : null,
			isHappyHourPrice: hasValidPrice && review.isHappyHourPrice === true
		},
		image: {
			url: `${API_IMAGE_PATH}/${encodeURIComponent(review.image)}`,
			focusX: finiteOr(review.imageFocusX, DEFAULT_IMAGE_FOCUS),
			focusY: finiteOr(review.imageFocusY, DEFAULT_IMAGE_FOCUS)
		},
		author: review.author,
		coAuthors: getReviewAuthors(review).filter((name) => name !== review.author),
		publicationStatus: getReviewPublicationStatus(review),
		createdAt: toIsoString(review.createdAt),
		updatedAt: toIsoString(review.updatedAt)
	};
};

/**
 * Version tag of a stored review. It changes on every write, because every write sets
 * `updatedAt`. The `v1` prefix changes when the review representation changes.
 */
export const reviewETag = (review: Pick<BarReview, '_id' | 'updatedAt'>): string =>
	`"v1-${review._id.toString()}-${new Date(review.updatedAt).getTime()}"`;

export const reviewPath = (slug: string) => `/api/v1/reviews/${encodeURIComponent(slug)}`;

export const toApiReviewHistory = (review: BarReview): ApiSchemas['ReviewHistory'] => ({
	slug: review.slug,
	title: review.title,
	entries: [...(review.changeLog ?? [])].reverse().map((entry) => ({
		updatedAt: toIsoString(entry.updatedAt),
		updatedBy: entry.updatedBy,
		changes: entry.changes.map(({ field, label, before, after }) => ({
			field,
			label,
			before: String(before ?? ''),
			after: String(after ?? '')
		}))
	}))
});

export const toApiReviewMap = (data: PublicReviewMapData): ApiSchemas['ReviewMap'] => ({
	markers: data.markers.map((marker) => ({
		slug: marker.slug,
		title: marker.title,
		overallRating: marker.rating,
		location: marker.location,
		latitude: marker.latitude,
		longitude: marker.longitude,
		beer: isValidBeerPriceKr(marker.beerPriceKr)
			? { priceKr: marker.beerPriceKr, isHappyHourPrice: marker.isHappyHourPrice === true }
			: null
	}))
});
