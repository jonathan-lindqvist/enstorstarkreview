import { z } from 'zod';
import { BAR_ATTRIBUTES } from '$lib/bar-attributes';
import { ALLOWED_REVIEW_IMAGE_MIME_TYPES } from '$lib/constants';
import { REVIEW_RATING_METRICS } from '$lib/review-metadata';
import { REVIEW_SORTS } from '$lib/utils/review-sort';
import type { BarAttributeKey as BarAttributeKeyValue } from '$lib/types/bar-attributes';
import type { ReviewRatingKey } from '$lib/types/bar-review';
import { describedReference, doc } from './schema-docs';

/**
 * The `/api/v1` data contract. Every exported schema whose name starts with a capital letter is
 * a named component in the generated `openapi/v1.yaml` (see `COMPONENT_SCHEMAS` at the end); the
 * native clients generate types with these names, so renaming one is a breaking change.
 *
 * Request schemas are closed (`strictObject`); response schemas stay open, as before.
 */

// Body budgets live beside the request schemas and are published as `x-max-body-bytes`.
export const SMALL_BODY_BYTES = 16 * 1024;
export const REVIEW_BODY_BYTES = 22 * 1024 * 1024;

const integer = () => z.int();
const ratingKeys = REVIEW_RATING_METRICS.map((metric) => metric.key) as [
	ReviewRatingKey,
	...ReviewRatingKey[]
];
const attributeKeys = BAR_ATTRIBUTES.map((attribute) => attribute.key) as [
	BarAttributeKeyValue,
	...BarAttributeKeyValue[]
];
const dateTime = () => doc(z.string(), { format: 'date-time' });

export const ProblemCode = z.enum([
	'bad_request',
	'unauthorized',
	'invalid_credentials',
	'not_found',
	'validation_failed',
	'duplicate_slug',
	'already_published',
	'concurrent_update',
	'precondition_failed',
	'precondition_required',
	'payload_too_large',
	'unsupported_media_type',
	'rate_limited',
	'service_unavailable',
	'internal_error'
]);

export const FieldError = z.object({
	pointer: doc(z.string(), {
		description: 'JSON Pointer (RFC 6901) into the request body. Empty for the whole body.',
		examples: ['/title', '/beer/priceKr', '/ratings/atmosphere']
	}),
	detail: doc(z.string(), {
		description: 'Swedish message that clients can show next to the field.'
	})
});

export const Problem = doc(
	z.object({
		status: integer(),
		code: ProblemCode,
		title: doc(z.string(), { description: 'Short English summary for logs.' }),
		detail: doc(z.string(), { description: 'Swedish message that clients can show.' }),
		errors: z.array(FieldError).optional()
	}),
	{ description: 'RFC 9457 problem details with a machine-readable `code`.' }
);

export const SessionCreateRequest = doc(
	z.strictObject({
		username: z.string().max(256),
		password: z.string().max(1024)
	}),
	{ 'x-max-body-bytes': SMALL_BODY_BYTES }
);

export const User = z.object({ username: z.string() });

export const Session = z.object({ user: User, expiresAt: dateTime() });

export const SessionCreated = z.intersection(
	Session,
	z.object({
		token: doc(z.string(), {
			description: 'Store it in the Keychain or Android encrypted storage.'
		})
	})
);

export const UserList = z.object({ users: z.array(User) });

export const RatingKey = z.enum(ratingKeys);

const ratingsOf = (rating: () => z.ZodNumber) =>
	Object.fromEntries(ratingKeys.map((key) => [key, rating().min(0).max(5)])) as Record<
		ReviewRatingKey,
		z.ZodNumber
	>;

export const Ratings = doc(z.strictObject(ratingsOf(() => z.number())), {
	description: 'Aspect ratings from 0 to 5.'
});

export const RatingsInput = doc(z.strictObject(ratingsOf(integer)), {
	description: 'Whole-number aspect ratings from 0 to 5.'
});

export const RatingMetric = z.object({
	key: RatingKey,
	label: z.string(),
	description: z.string(),
	weight: z.number()
});

export const OverallRatingThreshold = z.object({
	minimumWeightedScore: z.number(),
	rating: integer().min(0).max(3)
});

export const BarAttributeKey = z.enum(attributeKeys);

export const BarAttribute = z.object({
	key: BarAttributeKey,
	label: doc(z.string(), { description: 'Swedish label.' })
});

export const BarAttributes = doc(z.array(BarAttributeKey), {
	description: 'Bar features such as quiz or darts, in display order, without duplicates.',
	uniqueItems: true
});

export const ImageContentType = z.enum(ALLOWED_REVIEW_IMAGE_MIME_TYPES);

export const ReviewMetadata = z.object({
	ratingMetrics: doc(z.array(RatingMetric), {
		description: 'Aspects in display order. The weights add up to 1.'
	}),
	overallRating: doc(
		z.object({
			minimum: integer(),
			maximum: integer(),
			thresholds: z.array(OverallRatingThreshold)
		}),
		{
			description:
				'The suggested overall rating is the highest `rating` whose\n`minimumWeightedScore` is at most the weighted sum of the aspect ratings, else 0.\nReviewers may choose another value.\n'
		}
	),
	beerBrands: doc(z.array(z.string()), {
		description: 'Suggested brands. Any other brand name is also accepted.'
	}),
	barAttributes: doc(z.array(BarAttribute), {
		description: 'Selectable bar attributes in display order.'
	}),
	limits: z.object({
		titleMaxLength: integer(),
		descriptionMaxLength: integer(),
		locationMaxLength: integer(),
		slugMaxLength: integer(),
		beerBrandMaxLength: integer(),
		beerPriceMinKr: integer(),
		beerPriceMaxKr: integer(),
		beerVolumeMinCl: integer(),
		beerVolumeMaxCl: integer(),
		maxAuthors: integer(),
		imageMaxBytes: doc(integer(), { description: 'Maximum decoded image size.' }),
		imageContentTypes: z.array(ImageContentType)
	})
});

export const ReviewSort = z.enum(REVIEW_SORTS).default('latest');

export const PublicationStatus = z.enum(['draft', 'published']);

export const ReviewImage = z.object({
	url: doc(z.string(), {
		description: 'Path relative to the server origin, for example `/api/v1/images/<file>`.'
	}),
	focusX: doc(z.number().min(0).max(100), {
		description: 'Horizontal focus point in percent for cropping.'
	}),
	focusY: doc(z.number().min(0).max(100), {
		description: 'Vertical focus point in percent for cropping.'
	})
});

export const Beer = z.object({
	brand: doc(z.string().nullable(), { description: 'Null for older reviews without a brand.' }),
	priceKr: doc(integer().nullable(), {
		description: 'Null for older reviews without a valid price.'
	}),
	volumeCl: doc(integer().min(1).max(200).nullable(), {
		description: 'Serving size in centilitres, or null when unknown.'
	}),
	isHappyHourPrice: z.boolean()
});

export const Review = z.object({
	id: z.string(),
	slug: z.string(),
	title: z.string(),
	description: doc(z.string(), { description: 'Markdown.' }),
	location: doc(z.string(), { description: 'Street address.' }),
	ratings: Ratings,
	overallRating: integer().min(0).max(3),
	beer: Beer,
	attributes: BarAttributes,
	image: ReviewImage,
	author: doc(z.string(), { description: 'Primary author.' }),
	coAuthors: z.array(z.string()),
	publicationStatus: PublicationStatus,
	createdAt: dateTime(),
	updatedAt: dateTime()
});

export const ReviewList = z.object({ reviews: z.array(Review) });

export const ImageUpload = z.strictObject({
	contentType: ImageContentType,
	// Base64 is checked by a linear scan in review-input.ts, not a regex, so large images fit.
	data: doc(z.string(), {
		contentEncoding: 'base64',
		description: 'Standard base64 without a data-URL prefix. Convert HEIC to JPEG first.'
	})
});

export const ImageFocus = z.strictObject({
	x: z.number().min(0).max(100),
	y: z.number().min(0).max(100)
});

export const BeerInput = z.strictObject({
	brand: doc(z.string().min(1), {
		description: 'A suggested brand from the metadata or another brand name.'
	}),
	priceKr: integer(),
	volumeCl: doc(integer().min(1).max(200).nullable().optional(), {
		description:
			'Optional serving size. Omission preserves an existing value on update; null clears it.'
	}),
	isHappyHourPrice: z.boolean()
});

export const ReviewFields = z.object({
	title: z.string(),
	description: doc(z.string(), { description: 'Markdown.' }),
	location: z.string(),
	slug: doc(z.string().optional(), {
		description: 'Optional. The server derives a slug from the title when it is omitted.'
	}),
	ratings: RatingsInput,
	overallRating: doc(integer().min(0).max(3).optional(), {
		description: 'Optional. The server uses the suggested overall rating when it is omitted.'
	}),
	beer: BeerInput,
	attributes: describedReference(
		BarAttributes,
		'Optional. When omitted, a new review gets no attributes and an edit keeps the\ncurrent attributes. Send an empty array to remove all attributes.\n'
	).optional(),
	authors: doc(z.array(z.string()).min(1), {
		description:
			'Credited reviewers. The signed-in user becomes the primary author when selected;\notherwise an existing primary author, then the first selection.\n'
	}),
	imageFocus: ImageFocus
});

const reviewFieldKeys = Object.keys(ReviewFields.shape);

/**
 * `allOf` with `unevaluatedProperties: false` in the contract. Zod's intersection strips unknown
 * keys, so they are rejected before it, at the first one, like the earlier Ajv validation.
 */
const closedReviewBody = <T extends z.ZodType>(rest: T, allowedKeys: string[]) =>
	doc(
		z.preprocess(
			(value, context) => {
				if (value && typeof value === 'object' && !Array.isArray(value)) {
					const unknown = Object.keys(value).find((key) => !allowedKeys.includes(key));
					if (unknown !== undefined) {
						context.addIssue({
							code: 'unrecognized_keys',
							keys: [unknown],
							input: value as Record<string, unknown>
						});
					}
				}
				return value;
			},
			z.intersection(ReviewFields, rest)
		),
		{ unevaluatedProperties: false, 'x-max-body-bytes': REVIEW_BODY_BYTES }
	);

export const ReviewCreateRequest = closedReviewBody(z.object({ image: ImageUpload }), [
	...reviewFieldKeys,
	'image'
]);

export const ReviewUpdateRequest = closedReviewBody(z.object({ image: ImageUpload.optional() }), [
	...reviewFieldKeys,
	'image'
]);

export const ReviewFieldChange = z.object({
	field: z.string(),
	label: doc(z.string(), { description: 'Swedish field label.' }),
	before: z.string(),
	after: z.string()
});

export const ReviewHistoryEntry = z.object({
	updatedAt: dateTime(),
	updatedBy: z.string(),
	changes: z.array(ReviewFieldChange)
});

export const ReviewHistory = z.object({
	slug: z.string(),
	title: z.string(),
	entries: z.array(ReviewHistoryEntry)
});

export const MapMarker = z.object({
	slug: z.string(),
	title: z.string(),
	overallRating: z.number(),
	location: z.string(),
	latitude: z.number().min(-90).max(90),
	longitude: z.number().min(-180).max(180),
	beer: doc(z.object({ priceKr: integer(), isHappyHourPrice: z.boolean() }).nullable(), {
		description: 'Null when the review has no valid price.'
	}),
	attributes: BarAttributes
});

export const ReviewMap = z.object({ markers: z.array(MapMarker) });

export const StatisticBar = z.object({
	slug: z.string(),
	title: z.string(),
	beerPriceKr: integer(),
	isHappyHourPrice: z.boolean()
});

export const NearbyReview = z.strictObject({
	slug: z.string(),
	title: z.string(),
	distanceMetres: integer().min(0)
});

export const NearbyReviews = z.strictObject({
	addressKnown: doc(z.boolean(), {
		description: 'False when no review with this address has a saved position.'
	}),
	radiiMetres: doc(z.array(integer().min(1)), {
		description: 'The radii that `summary.counts` refers to, in order.'
	}),
	// Inline [object, 'null'] rather than oneOf with a $ref: swift-openapi-generator drops a
	// oneOf that mixes null and a reference, which breaks decoding in the iOS app.
	summary: doc(
		z
			.strictObject({
				counts: doc(z.array(integer().min(0)), {
					description: 'Cumulative number of other reviews within each radius, including drafts.'
				}),
				nearest: doc(z.array(NearbyReview).max(5), {
					description: 'Up to five reviews within the largest radius, nearest first.'
				}),
				locatedCount: doc(integer().min(0), {
					description: 'Other reviews with a known position.'
				}),
				totalCount: doc(integer().min(0), {
					description: 'All other active reviews, located or not.'
				})
			})
			.nullable(),
		{
			description: 'Null when the address is unknown or no other review has a known position.'
		}
	)
});

export const ValueStatisticBar = z.intersection(
	StatisticBar,
	z.object({
		beerVolumeCl: integer().min(1).max(200),
		clPerKr: z.number().gt(0)
	})
);

export const BeerBrandValue = doc(
	z.strictObject({
		brand: z.string().min(1),
		averageClPerKr: z.number().gt(0),
		reviewCount: integer().min(1),
		happyHourReviewCount: integer().min(0)
	}),
	{
		description:
			'Value statistics for regular prices only. The legacy happyHourReviewCount field is always zero.'
	}
);

export const BeerBrandPrice = doc(
	z.strictObject({
		brand: z.string().min(1),
		averagePriceKr: z.number().min(1).max(999),
		reviewCount: integer().min(1),
		happyHourReviewCount: integer().min(0)
	}),
	{
		description:
			'Price statistics for regular prices only. The legacy happyHourReviewCount field is always zero.'
	}
);

export const ReviewStatistics = doc(
	z.object({
		totalReviews: integer(),
		gothenburgReviews: integer(),
		averageRating: z.number().nullable(),
		priceReviewCount: doc(integer(), {
			description: 'Number of valid regular-price entries, excluding happy hour.'
		}),
		averageBeerPrice: z.number().nullable(),
		totalReviewerSpendKr: doc(integer().min(0), {
			description:
				"Estimated spending in SEK: each public active review's valid whole-krona price (1–999), including happy hour, multiplied by its distinct credited reviewer count. Counts the primary author and co-authors, including legacy string co-authors and credits for deleted accounts. Blank or malformed credits and invalid prices contribute zero. Returns zero when no spending qualifies."
		}),
		happyHourReviewCount: doc(integer(), {
			description: 'Number of public active happy hour reviews with a valid price.'
		}),
		happyHourPercentage: doc(z.number().nullable(), {
			description:
				'Happy hour findings as a percentage of all valid price entries, including happy hour; null when none exist.'
		}),
		cheapestBars: z.array(StatisticBar),
		mostExpensiveBars: z.array(StatisticBar),
		beerBrandPrices: z.array(BeerBrandPrice),
		valueReviewCount: integer().min(0),
		averageClPerKr: doc(z.number().nullable(), {
			description:
				"Arithmetic mean of each eligible regular-price review's volume divided by its price, excluding happy hour."
		}),
		bestValueBars: z.array(ValueStatisticBar).max(5),
		worstValueBars: z.array(ValueStatisticBar).max(5),
		beerBrandValues: z.array(BeerBrandValue)
	}),
	{
		description:
			'Statistics for public active reviews. Price and value averages, sample counts, rankings and brand aggregates exclude happy hour prices. Review counts and ratings include happy hour reviews; happy hour findings are counted separately. Estimated reviewer spending includes happy hour prices.'
	}
);

export const ReviewRequestCreateRequest = doc(
	z.strictObject({
		barName: z.string(),
		location: z.string(),
		motivation: z.string().optional()
	}),
	{ 'x-max-body-bytes': SMALL_BODY_BYTES }
);

export const ReviewRequestAccepted = z.object({
	message: doc(z.string(), { description: 'Swedish confirmation for the user.' })
});

/** Named components of the generated contract, in document order. */
export const COMPONENT_SCHEMAS = {
	Problem,
	ProblemCode,
	FieldError,
	SessionCreateRequest,
	User,
	Session,
	SessionCreated,
	UserList,
	RatingKey,
	Ratings,
	RatingsInput,
	RatingMetric,
	OverallRatingThreshold,
	BarAttributeKey,
	BarAttribute,
	BarAttributes,
	ReviewMetadata,
	ReviewSort,
	PublicationStatus,
	ReviewImage,
	Beer,
	Review,
	ReviewList,
	ImageContentType,
	ImageUpload,
	ImageFocus,
	BeerInput,
	ReviewFields,
	ReviewCreateRequest,
	ReviewUpdateRequest,
	ReviewFieldChange,
	ReviewHistoryEntry,
	ReviewHistory,
	MapMarker,
	ReviewMap,
	StatisticBar,
	NearbyReviews,
	NearbyReview,
	ReviewStatistics,
	ValueStatisticBar,
	BeerBrandValue,
	BeerBrandPrice,
	ReviewRequestCreateRequest,
	ReviewRequestAccepted
} satisfies Record<string, z.ZodType>;

type Components = typeof COMPONENT_SCHEMAS;
/** Response and request types of the contract, inferred from the schemas above. */
export type ApiSchemas = { [Name in keyof Components]: z.output<Components[Name]> };
export type ApiProblemCode = ApiSchemas['ProblemCode'];
export type ApiFieldError = ApiSchemas['FieldError'];
