import { UNKNOWN_BEER_BRAND_LABEL } from '$lib/beer-brands';
import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
import { getBarAttributeLabels } from '$lib/bar-attributes';
import type {
	BarReview,
	BarReviewUpdate,
	ReviewChangeLogEntry,
	ReviewFieldChange
} from '$lib/types/bar-review';
import type { ReviewPersistenceFields } from '$lib/types/review-form';
import { isValidBeerPriceKr } from '$lib/utils/price';
import { DEFAULT_IMAGE_FOCUS } from './form';

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
		field: 'attributes',
		label: 'Aktiviteter och utbud',
		before: (review) => getBarAttributeLabels(review.attributes),
		after: (next) => getBarAttributeLabels(next.attributes)
	},
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
