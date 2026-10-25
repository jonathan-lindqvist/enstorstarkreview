import { Schema } from 'effect';
import { BAR_ATTRIBUTES } from '$lib/bar-attributes';
import { ALLOWED_REVIEW_IMAGE_MIME_TYPES } from '$lib/constants';
import { REVIEW_RATING_METRICS } from '$lib/review-metadata';

/**
 * The `/api/v1` data contract. Every schema with an `identifier` becomes a component of the
 * generated `openapi/v1.yaml`; keep identifiers stable, because the iOS and Android clients
 * generate their models from the component names. Request schemas carry their body budget as
 * `x-max-body-bytes`, which the API door enforces on streamed bytes before parsing.
 */

const between = (minimum: number, maximum: number) => Schema.isBetween({ minimum, maximum });
const NumberBetween = (minimum: number, maximum: number) =>
	Schema.Finite.check(between(minimum, maximum));
const IntBetween = (minimum: number, maximum: number) =>
	Schema.Int.check(between(minimum, maximum));
const NonNegativeInt = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const DateTime = Schema.String.annotate({ format: 'date-time' });

export const ratingKeys = REVIEW_RATING_METRICS.map((metric) => metric.key) as [
	(typeof REVIEW_RATING_METRICS)[number]['key'],
	...(typeof REVIEW_RATING_METRICS)[number]['key'][]
];
const barAttributeKeys = BAR_ATTRIBUTES.map((attribute) => attribute.key) as [
	(typeof BAR_ATTRIBUTES)[number]['key'],
	...(typeof BAR_ATTRIBUTES)[number]['key'][]
];

// Shared building blocks

export const FieldError = Schema.Struct({
	pointer: Schema.String.annotate({
		description: 'JSON Pointer (RFC 6901) into the request body. Empty for the whole body.',
		examples: ['/title', '/beer/priceKr', '/ratings/atmosphere']
	}),
	detail: Schema.String.annotate({
		description: 'Swedish message that clients can show next to the field.'
	})
}).annotate({ identifier: 'FieldError' });

export const ProblemCode = Schema.Literals([
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
]).annotate({ identifier: 'ProblemCode' });
export type ProblemCode = typeof ProblemCode.Type;

export const Problem = Schema.Struct({
	status: Schema.Int,
	code: ProblemCode,
	title: Schema.String.annotate({ description: 'Short English summary for logs.' }),
	detail: Schema.String.annotate({ description: 'Swedish message that clients can show.' }),
	errors: Schema.optionalKey(Schema.Array(FieldError))
}).annotate({
	identifier: 'Problem',
	description: 'RFC 9457 problem details with a machine-readable `code`.'
});
export type Problem = typeof Problem.Type;

// Sessions and users

export const SessionCreateRequest = Schema.Struct({
	username: Schema.String.check(Schema.isMaxLength(256)),
	password: Schema.String.check(Schema.isMaxLength(1024))
}).annotate({ identifier: 'SessionCreateRequest', 'x-max-body-bytes': 16384 });

export const User = Schema.Struct({ username: Schema.String }).annotate({ identifier: 'User' });

export const Session = Schema.Struct({ user: User, expiresAt: DateTime }).annotate({
	identifier: 'Session'
});

export const SessionCreated = Schema.Struct({
	user: User,
	expiresAt: DateTime,
	token: Schema.String.annotate({
		description: 'Store it in the Keychain or Android encrypted storage.'
	})
}).annotate({ identifier: 'SessionCreated' });

export const UserList = Schema.Struct({ users: Schema.Array(User) }).annotate({
	identifier: 'UserList'
});

// Metadata

export const RatingKey = Schema.Literals(ratingKeys).annotate({ identifier: 'RatingKey' });
export const BarAttributeKey = Schema.Literals(barAttributeKeys).annotate({
	identifier: 'BarAttributeKey'
});
export const ImageContentType = Schema.Literals(ALLOWED_REVIEW_IMAGE_MIME_TYPES).annotate({
	identifier: 'ImageContentType'
});

const ratingsOf = <S extends Schema.Top>(rating: S) =>
	Schema.Struct(
		Object.fromEntries(ratingKeys.map((key) => [key, rating])) as Record<
			(typeof ratingKeys)[number],
			S
		>
	);

export const Ratings = ratingsOf(NumberBetween(0, 5)).annotate({
	identifier: 'Ratings',
	description: 'Aspect ratings from 0 to 5.'
});
export const RatingsInput = ratingsOf(IntBetween(0, 5)).annotate({
	identifier: 'RatingsInput',
	description: 'Whole-number aspect ratings from 0 to 5.'
});

export const RatingMetric = Schema.Struct({
	key: RatingKey,
	label: Schema.String,
	description: Schema.String,
	weight: Schema.Finite
}).annotate({ identifier: 'RatingMetric' });

export const OverallRatingThreshold = Schema.Struct({
	minimumWeightedScore: Schema.Finite,
	rating: IntBetween(0, 3)
}).annotate({ identifier: 'OverallRatingThreshold' });

export const BarAttribute = Schema.Struct({
	key: BarAttributeKey,
	label: Schema.String.annotate({ description: 'Swedish label.' })
}).annotate({ identifier: 'BarAttribute' });

export const BarAttributes = Schema.Array(BarAttributeKey).check(Schema.isUnique()).annotate({
	identifier: 'BarAttributes',
	description: 'Bar features such as quiz or darts, in display order, without duplicates.'
});

export const ReviewMetadata = Schema.Struct({
	ratingMetrics: Schema.Array(RatingMetric).annotate({
		description: 'Aspects in display order. The weights add up to 1.'
	}),
	overallRating: Schema.Struct({
		minimum: Schema.Int,
		maximum: Schema.Int,
		thresholds: Schema.Array(OverallRatingThreshold)
	}).annotate({
		description:
			'The suggested overall rating is the highest `rating` whose `minimumWeightedScore` is at most the weighted sum of the aspect ratings, else 0. Reviewers may choose another value.'
	}),
	beerBrands: Schema.Array(Schema.String).annotate({
		description: 'Suggested brands. Any other brand name is also accepted.'
	}),
	barAttributes: Schema.Array(BarAttribute).annotate({
		description: 'Selectable bar attributes in display order.'
	}),
	limits: Schema.Struct({
		titleMaxLength: Schema.Int,
		descriptionMaxLength: Schema.Int,
		locationMaxLength: Schema.Int,
		slugMaxLength: Schema.Int,
		beerBrandMaxLength: Schema.Int,
		beerPriceMinKr: Schema.Int,
		beerPriceMaxKr: Schema.Int,
		beerVolumeMinCl: Schema.Int,
		beerVolumeMaxCl: Schema.Int,
		maxAuthors: Schema.Int,
		imageMaxBytes: Schema.Int.annotate({ description: 'Maximum decoded image size.' }),
		imageContentTypes: Schema.Array(ImageContentType)
	})
}).annotate({ identifier: 'ReviewMetadata' });

// Reviews

export const ReviewSort = Schema.Literals(['latest', 'oldest', 'score']).annotate({
	identifier: 'ReviewSort',
	default: 'latest'
});
export const PublicationStatus = Schema.Literals(['draft', 'published']).annotate({
	identifier: 'PublicationStatus'
});

export const ReviewImage = Schema.Struct({
	url: Schema.String.annotate({
		description: 'Path relative to the server origin, for example `/api/v1/images/<file>`.'
	}),
	focusX: NumberBetween(0, 100).annotate({
		description: 'Horizontal focus point in percent for cropping.'
	}),
	focusY: NumberBetween(0, 100).annotate({
		description: 'Vertical focus point in percent for cropping.'
	})
}).annotate({ identifier: 'ReviewImage' });

export const Beer = Schema.Struct({
	brand: Schema.NullOr(Schema.String).annotate({
		description: 'Null for older reviews without a brand.'
	}),
	priceKr: Schema.NullOr(Schema.Int).annotate({
		description: 'Null for older reviews without a valid price.'
	}),
	volumeCl: Schema.NullOr(IntBetween(1, 200)).annotate({
		description: 'Serving size in centilitres, or null when unknown.'
	}),
	isHappyHourPrice: Schema.Boolean
}).annotate({ identifier: 'Beer' });

export const Review = Schema.Struct({
	id: Schema.String,
	slug: Schema.String,
	title: Schema.String,
	description: Schema.String.annotate({ description: 'Markdown.' }),
	location: Schema.String.annotate({ description: 'Street address.' }),
	ratings: Ratings,
	overallRating: IntBetween(0, 3),
	beer: Beer,
	attributes: BarAttributes,
	image: ReviewImage,
	author: Schema.String.annotate({ description: 'Primary author.' }),
	coAuthors: Schema.Array(Schema.String),
	publicationStatus: PublicationStatus,
	createdAt: DateTime,
	updatedAt: DateTime
}).annotate({ identifier: 'Review' });
export type Review = typeof Review.Type;

export const ReviewList = Schema.Struct({ reviews: Schema.Array(Review) }).annotate({
	identifier: 'ReviewList'
});

export const ImageUpload = Schema.Struct({
	contentType: ImageContentType,
	data: Schema.String.annotate({
		contentEncoding: 'base64',
		description: 'Standard base64 without a data-URL prefix. Convert HEIC to JPEG first.'
	})
}).annotate({ identifier: 'ImageUpload' });

export const ImageFocus = Schema.Struct({
	x: NumberBetween(0, 100),
	y: NumberBetween(0, 100)
}).annotate({ identifier: 'ImageFocus' });

export const BeerInput = Schema.Struct({
	brand: Schema.String.check(Schema.isMinLength(1)).annotate({
		description: 'A suggested brand from the metadata or another brand name.'
	}),
	priceKr: Schema.Int,
	volumeCl: Schema.optionalKey(Schema.NullOr(IntBetween(1, 200))).annotate({
		description:
			'Optional serving size. Omission preserves an existing value on update; null clears it.'
	}),
	isHappyHourPrice: Schema.Boolean
}).annotate({ identifier: 'BeerInput' });

const reviewFields = {
	title: Schema.String,
	description: Schema.String.annotate({ description: 'Markdown.' }),
	location: Schema.String,
	slug: Schema.optionalKey(
		Schema.String.annotate({
			description: 'Optional. The server derives a slug from the title when it is omitted.'
		})
	),
	ratings: RatingsInput,
	overallRating: Schema.optionalKey(
		IntBetween(0, 3).annotate({
			description: 'Optional. The server uses the suggested overall rating when it is omitted.'
		})
	),
	beer: BeerInput,
	attributes: Schema.optionalKey(
		BarAttributes.annotate({
			description:
				'Optional. When omitted, a new review gets no attributes and an edit keeps the current attributes. Send an empty array to remove all attributes.'
		})
	),
	authors: Schema.Array(Schema.String)
		.check(Schema.isMinLength(1, { detail: 'Välj minst ett värde' }))
		.annotate({
			description:
				'Credited reviewers. The signed-in user becomes the primary author when selected; otherwise an existing primary author, then the first selection.'
		}),
	imageFocus: ImageFocus
};

/** JSON reviews carry a base64 image: 22 MiB keeps a 15 MiB image plus fields below the proxy limit. */
const REVIEW_BODY_BYTES = 23068672;

export const ReviewCreateRequest = Schema.Struct({ ...reviewFields, image: ImageUpload }).annotate({
	identifier: 'ReviewCreateRequest',
	'x-max-body-bytes': REVIEW_BODY_BYTES
});
export const ReviewUpdateRequest = Schema.Struct({
	...reviewFields,
	image: Schema.optionalKey(ImageUpload)
}).annotate({ identifier: 'ReviewUpdateRequest', 'x-max-body-bytes': REVIEW_BODY_BYTES });
export type ReviewInput = typeof ReviewCreateRequest.Type | typeof ReviewUpdateRequest.Type;

export const ReviewFieldChange = Schema.Struct({
	field: Schema.String,
	label: Schema.String.annotate({ description: 'Swedish field label.' }),
	before: Schema.String,
	after: Schema.String
}).annotate({ identifier: 'ReviewFieldChange' });

export const ReviewHistoryEntry = Schema.Struct({
	updatedAt: DateTime,
	updatedBy: Schema.String,
	changes: Schema.Array(ReviewFieldChange)
}).annotate({ identifier: 'ReviewHistoryEntry' });

export const ReviewHistory = Schema.Struct({
	slug: Schema.String,
	title: Schema.String,
	entries: Schema.Array(ReviewHistoryEntry)
}).annotate({ identifier: 'ReviewHistory' });

// Map, nearby reviews and statistics

export const MapMarker = Schema.Struct({
	slug: Schema.String,
	title: Schema.String,
	overallRating: Schema.Finite,
	location: Schema.String,
	latitude: NumberBetween(-90, 90),
	longitude: NumberBetween(-180, 180),
	beer: Schema.NullOr(
		Schema.Struct({ priceKr: Schema.Int, isHappyHourPrice: Schema.Boolean })
	).annotate({ description: 'Null when the review has no valid price.' }),
	attributes: BarAttributes
}).annotate({ identifier: 'MapMarker' });

export const ReviewMap = Schema.Struct({ markers: Schema.Array(MapMarker) }).annotate({
	identifier: 'ReviewMap'
});

export const NearbyReview = Schema.Struct({
	slug: Schema.String,
	title: Schema.String,
	distanceMetres: NonNegativeInt
}).annotate({ identifier: 'NearbyReview' });

export const NearbyReviews = Schema.Struct({
	addressKnown: Schema.Boolean.annotate({
		description: 'False when no review with this address has a saved position.'
	}),
	radiiMetres: Schema.Array(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))).annotate({
		description: 'The radii that `summary.counts` refers to, in order.'
	}),
	// An inline nullable object rather than a referenced one: swift-openapi-generator drops a
	// oneOf that mixes null and a reference, which breaks decoding in the iOS app.
	summary: Schema.NullOr(
		Schema.Struct({
			counts: Schema.Array(NonNegativeInt).annotate({
				description: 'Cumulative number of other reviews within each radius, including drafts.'
			}),
			nearest: Schema.Array(NearbyReview)
				.check(Schema.isMaxLength(5))
				.annotate({ description: 'Up to five reviews within the largest radius, nearest first.' }),
			locatedCount: NonNegativeInt.annotate({
				description: 'Other reviews with a known position.'
			}),
			totalCount: NonNegativeInt.annotate({
				description: 'All other active reviews, located or not.'
			})
		})
	).annotate({
		description: 'Null when the address is unknown or no other review has a known position.'
	})
}).annotate({ identifier: 'NearbyReviews' });

export const StatisticBar = Schema.Struct({
	slug: Schema.String,
	title: Schema.String,
	beerPriceKr: Schema.Int,
	isHappyHourPrice: Schema.Boolean
}).annotate({ identifier: 'StatisticBar' });

export const ValueStatisticBar = Schema.Struct({
	slug: Schema.String,
	title: Schema.String,
	beerPriceKr: Schema.Int,
	isHappyHourPrice: Schema.Boolean,
	beerVolumeCl: IntBetween(1, 200),
	clPerKr: Schema.Finite.check(Schema.isGreaterThan(0))
}).annotate({ identifier: 'ValueStatisticBar' });

export const BeerBrandValue = Schema.Struct({
	brand: Schema.String.check(Schema.isMinLength(1)),
	averageClPerKr: Schema.Finite.check(Schema.isGreaterThan(0)),
	reviewCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
	happyHourReviewCount: NonNegativeInt
}).annotate({
	identifier: 'BeerBrandValue',
	description:
		'Value statistics for regular prices only. The legacy happyHourReviewCount field is always zero.'
});

export const BeerBrandPrice = Schema.Struct({
	brand: Schema.String.check(Schema.isMinLength(1)),
	averagePriceKr: NumberBetween(1, 999),
	reviewCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
	happyHourReviewCount: NonNegativeInt
}).annotate({
	identifier: 'BeerBrandPrice',
	description:
		'Price statistics for regular prices only. The legacy happyHourReviewCount field is always zero.'
});

export const ReviewStatistics = Schema.Struct({
	totalReviews: Schema.Int,
	gothenburgReviews: Schema.Int,
	averageRating: Schema.NullOr(Schema.Finite),
	priceReviewCount: Schema.Int.annotate({
		description: 'Number of valid regular-price entries, excluding happy hour.'
	}),
	averageBeerPrice: Schema.NullOr(Schema.Finite),
	totalReviewerSpendKr: NonNegativeInt.annotate({
		description:
			"Estimated spending in SEK: each public active review's valid whole-krona price (1–999), including happy hour, multiplied by its distinct credited reviewer count. Counts the primary author and co-authors, including legacy string co-authors and credits for deleted accounts. Blank or malformed credits and invalid prices contribute zero. Returns zero when no spending qualifies."
	}),
	happyHourReviewCount: Schema.Int.annotate({
		description: 'Number of public active happy hour reviews with a valid price.'
	}),
	happyHourPercentage: Schema.NullOr(Schema.Finite).annotate({
		description:
			'Happy hour findings as a percentage of all valid price entries, including happy hour; null when none exist.'
	}),
	cheapestBars: Schema.Array(StatisticBar),
	mostExpensiveBars: Schema.Array(StatisticBar),
	beerBrandPrices: Schema.Array(BeerBrandPrice),
	valueReviewCount: NonNegativeInt,
	averageClPerKr: Schema.NullOr(Schema.Finite).annotate({
		description:
			"Arithmetic mean of each eligible regular-price review's volume divided by its price, excluding happy hour."
	}),
	bestValueBars: Schema.Array(ValueStatisticBar).check(Schema.isMaxLength(5)),
	worstValueBars: Schema.Array(ValueStatisticBar).check(Schema.isMaxLength(5)),
	beerBrandValues: Schema.Array(BeerBrandValue)
}).annotate({
	identifier: 'ReviewStatistics',
	description:
		'Statistics for public active reviews. Price and value averages, sample counts, rankings and brand aggregates exclude happy hour prices. Review counts and ratings include happy hour reviews; happy hour findings are counted separately. Estimated reviewer spending includes happy hour prices.'
});

// Review requests

export const ReviewRequestCreateRequest = Schema.Struct({
	barName: Schema.String,
	location: Schema.String,
	motivation: Schema.optionalKey(Schema.String)
}).annotate({ identifier: 'ReviewRequestCreateRequest', 'x-max-body-bytes': 16384 });

export const ReviewRequestAccepted = Schema.Struct({
	message: Schema.String.annotate({ description: 'Swedish confirmation for the user.' })
}).annotate({ identifier: 'ReviewRequestAccepted' });

/** The JSON request bodies, by component name. */
export const requestSchemas = {
	SessionCreateRequest,
	ReviewCreateRequest,
	ReviewUpdateRequest,
	ReviewRequestCreateRequest
} as const;
export type RequestSchemaName = keyof typeof requestSchemas;

/** The body budget of a request schema, from its `x-max-body-bytes` annotation. */
export const requestBodyLimit = (name: RequestSchemaName): number => {
	const limit = (requestSchemas[name].ast.annotations as Record<string, unknown> | undefined)?.[
		'x-max-body-bytes'
	];
	if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit <= 0) {
		throw new Error(`Missing JSON body limit for ${name}`);
	}
	return limit;
};
