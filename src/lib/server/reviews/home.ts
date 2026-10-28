import { error } from '@sveltejs/kit';
import { ObjectId, type Collection, type Filter, type Sort } from 'mongodb';
import { HOME_REVIEW_PAGE_SIZE, normalizeHomeReviewQuery } from '$lib/home-reviews';
import { normalizeBarAttributes } from '$lib/bar-attributes';
import { getReviewAuthors } from '$lib/utils/authors';
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

type ReviewCollection = Pick<Collection<BarReview>, 'find'>;
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
const CARD_PROJECTION = Object.fromEntries(
	['_id', 'author', 'coAuthors', ...CARD_FIELDS].map((field) => [field, 1])
);

export const parseHomeReviewQuery = (url: URL): HomeReviewQuery => {
	if (url.search.length > 2048) throw error(400, 'Sökningen är för lång.');
	const pages = url.searchParams.getAll('page');
	const page = pages[0] ?? '1';
	if (pages.length > 1 || !/^[1-9]\d{0,4}$/.test(page) || Number(page) > 10000) {
		throw error(400, 'Ogiltig sida.');
	}
	return { ...normalizeHomeReviewQuery(url.searchParams), page: Number(page) };
};

export const parseHomeReviewIds = (params: URLSearchParams): string[] | undefined => {
	const values = params.getAll('ids');
	if (!values.length) return undefined;
	const ids = values[0].split(',');
	if (
		values.length !== 1 ||
		ids.length > HOME_REVIEW_PAGE_SIZE ||
		ids.some((id) => !/^[a-f0-9]{24}$/.test(id)) ||
		new Set(ids).size !== ids.length
	) {
		throw error(400, 'Ogiltiga recensioner.');
	}
	return ids;
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
		authors: getReviewAuthors(review),
		attributes: normalizeBarAttributes(review.attributes),
		publicationStatus: getReviewPublicationStatus(review)
	}) as HomeReviewCard;

export const loadHomeReviewPage = async (
	collection: ReviewCollection,
	query: HomeReviewQuery,
	authenticated: boolean,
	ids?: string[]
): Promise<HomeReviewPage> => {
	const filter = listingFilter(query, authenticated);
	const direction = query.sort === 'oldest' ? 1 : -1;
	const sort: Sort =
		query.sort === 'score'
			? { rating: -1, createdAt: -1, _id: -1 }
			: { createdAt: direction, _id: direction };
	const rows = await collection
		.find(ids ? { $and: [filter, { _id: { $in: ids.map((id) => new ObjectId(id)) } }] } : filter, {
			projection: CARD_PROJECTION,
			sort,
			skip: ids ? 0 : (query.page - 1) * HOME_REVIEW_PAGE_SIZE,
			limit: ids ? HOME_REVIEW_PAGE_SIZE : HOME_REVIEW_PAGE_SIZE + 1
		})
		.toArray();
	if (!ids && query.page > 1 && !rows.length) throw error(404, 'Sidan finns inte.');
	const selected = ids
		? ids.flatMap((id) => rows.filter((row) => row._id.toHexString() === id))
		: rows.slice(0, HOME_REVIEW_PAGE_SIZE);
	return {
		bars: selected.map(toCard),
		coordinatesByReviewId: await loadReviewCoordinates(selected),
		page: query.page,
		nextPage: !ids && rows.length > HOME_REVIEW_PAGE_SIZE ? query.page + 1 : null
	};
};

export const loadHomeReviewIndex = async (
	collection: ReviewCollection,
	query: HomeReviewQuery,
	authenticated: boolean
): Promise<HomeReviewIndexEntry[]> => {
	const rows = await collection
		.find(listingFilter(query, authenticated), {
			projection: { _id: 1, createdAt: 1, location: 1 },
			sort: { createdAt: -1, _id: -1 }
		})
		.toArray();
	const coordinates = await loadReviewCoordinates(rows);
	return rows.map((row) => ({
		id: row._id.toHexString(),
		createdAt:
			row.createdAt instanceof Date && Number.isFinite(row.createdAt.getTime())
				? row.createdAt.toISOString()
				: new Date(0).toISOString(),
		coordinates: coordinates[row._id.toHexString()] ?? null
	}));
};
