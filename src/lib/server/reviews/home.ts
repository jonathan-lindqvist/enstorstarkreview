import { ObjectId, type Filter, type Sort } from 'mongodb';
import { Effect, Schema } from 'effect';
import { HOME_REVIEW_PAGE_SIZE, normalizeHomeReviewQuery } from '$lib/home-reviews';
import { normalizeBarAttributes } from '$lib/bar-attributes';
import type { BarReview } from '$lib/types/bar-review';
import type {
	HomeReviewCard,
	HomeReviewPage,
	HomeReviewQuery,
	HomeReviewIndexEntry
} from '$lib/types/home-reviews';
import { buildReviewSearchFilter } from './listing';
import { getReviewPublicationStatus, withReviewVisibility } from '../review-publication';
import { loadReviewCoordinates } from './coordinates';
import { BadRequest } from '$lib/server/errors';
import { Mongo, tryMongo } from '$lib/server/platform/mongo';
import { Viewer } from '$lib/server/request';

export class HomePageNotFound extends Schema.TaggedError<HomePageNotFound>()(
	'HomePageNotFound',
	{ message: Schema.String },
	{ httpApiStatus: 404 }
) {}
const CARD_FIELDS = [
	'title',
	'slug',
	'description',
	'location',
	'rating',
	'image',
	'imageFocusX',
	'imageFocusY',
	'beerBrand',
	'beerPriceKr',
	'isHappyHourPrice',
	'attributes',
	'publicationStatus',
	'createdAt'
] as const;
const CARD_PROJECTION = Object.fromEntries(['_id', ...CARD_FIELDS].map((field) => [field, 1]));

export const parseHomeReviewQuery = (url: URL): Effect.Effect<HomeReviewQuery, BadRequest> => {
	if (url.search.length > 2048)
		return Effect.fail(new BadRequest({ message: 'Sökningen är för lång.' }));
	const pages = url.searchParams.getAll('page');
	const page = pages[0] ?? '1';
	if (pages.length > 1 || !/^[1-9]\d{0,4}$/.test(page) || Number(page) > 10000) {
		return Effect.fail(new BadRequest({ message: 'Ogiltig sida.' }));
	}
	return Effect.succeed({ ...normalizeHomeReviewQuery(url.searchParams), page: Number(page) });
};

export const parseHomeReviewIds = (
	params: URLSearchParams
): Effect.Effect<string[] | undefined, BadRequest> => {
	const values = params.getAll('ids');
	if (!values.length) return Effect.succeed(undefined);
	const ids = values[0].split(',');
	if (
		values.length !== 1 ||
		ids.length > HOME_REVIEW_PAGE_SIZE ||
		ids.some((id) => !/^[a-f0-9]{24}$/.test(id)) ||
		new Set(ids).size !== ids.length
	) {
		return Effect.fail(new BadRequest({ message: 'Ogiltiga recensioner.' }));
	}
	return Effect.succeed(ids);
};

const listingFilter = (query: HomeReviewQuery, authenticated: boolean): Filter<BarReview> =>
	withReviewVisibility(
		{
			$and: [
				buildReviewSearchFilter(query.search),
				query.attributes.length ? { attributes: { $in: query.attributes } } : {}
			]
		},
		authenticated
	);

const toCard = (review: BarReview): HomeReviewCard =>
	({
		...Object.fromEntries(CARD_FIELDS.map((field) => [field, review[field]])),
		_id: review._id.toHexString(),
		attributes: normalizeBarAttributes(review.attributes),
		publicationStatus: getReviewPublicationStatus(review)
	}) as HomeReviewCard;

/** One bounded card batch, visibility-filtered before sorting and pagination. */
export const loadHomeReviewPage = Effect.fn('loadHomeReviewPage')(function* (
	query: HomeReviewQuery,
	ids?: string[]
) {
	const { bars } = (yield* Mongo).collections;
	const filter = listingFilter(query, yield* Viewer.isAuthenticated);
	const direction = query.sort === 'oldest' ? 1 : -1;
	const sort: Sort =
		query.sort === 'score'
			? { rating: -1, createdAt: -1, _id: -1 }
			: { createdAt: direction, _id: direction };
	const rows = yield* tryMongo(() =>
		bars
			.find(
				ids ? { $and: [filter, { _id: { $in: ids.map((id) => new ObjectId(id)) } }] } : filter,
				{
					projection: CARD_PROJECTION,
					sort,
					skip: ids ? 0 : (query.page - 1) * HOME_REVIEW_PAGE_SIZE,
					limit: ids ? HOME_REVIEW_PAGE_SIZE : HOME_REVIEW_PAGE_SIZE + 1
				}
			)
			.toArray()
	);
	if (!ids && query.page > 1 && !rows.length) {
		return yield* new HomePageNotFound({ message: 'Sidan finns inte.' });
	}
	const selected = ids
		? ids.flatMap((id) => rows.filter((row) => row._id.toHexString() === id))
		: rows.slice(0, HOME_REVIEW_PAGE_SIZE);
	return {
		bars: selected.map(toCard),
		coordinatesByReviewId: yield* loadReviewCoordinates(selected),
		page: query.page,
		nextPage: !ids && rows.length > HOME_REVIEW_PAGE_SIZE ? query.page + 1 : null
	} satisfies HomeReviewPage;
});

/** The whole authorized collection as IDs, dates and coordinates, for global nearest sorting. */
export const loadHomeReviewIndex = Effect.fn('loadHomeReviewIndex')(function* (
	query: HomeReviewQuery
) {
	const { bars } = (yield* Mongo).collections;
	const authenticated = yield* Viewer.isAuthenticated;
	const rows = yield* tryMongo(() =>
		bars
			.find(listingFilter(query, authenticated), {
				projection: { _id: 1, createdAt: 1, location: 1 },
				sort: { createdAt: -1, _id: -1 }
			})
			.toArray()
	);
	const coordinates = yield* loadReviewCoordinates(rows);
	return rows.map(
		(row): HomeReviewIndexEntry => ({
			id: row._id.toHexString(),
			createdAt:
				row.createdAt instanceof Date && Number.isFinite(row.createdAt.getTime())
					? row.createdAt.toISOString()
					: new Date(0).toISOString(),
			coordinates: coordinates[row._id.toHexString()] ?? null
		})
	);
});
