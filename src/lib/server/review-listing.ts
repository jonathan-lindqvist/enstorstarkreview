import type { Filter, Sort } from 'mongodb';
import type { BarReview } from '$lib/types/bar-review';

export const REVIEW_LIST_PAGE_SIZE = 12;
export const REVIEW_LIST_SORT_OPTIONS = ['latest', 'oldest', 'score'] as const;

export type ReviewListSort = (typeof REVIEW_LIST_SORT_OPTIONS)[number];

export interface ReviewListParameters {
	search: string;
	sort: ReviewListSort;
	page: number;
}

export interface ReviewListPagination {
	page: number;
	pageCount: number;
	skip: number;
}

const MAX_SEARCH_LENGTH = 80;

const isControlCharacter = (value: string): boolean => {
	const code = value.charCodeAt(0);
	return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
};

export const sanitizeReviewSearch = (value: string): string => {
	return Array.from(value)
		.filter((character) => !isControlCharacter(character))
		.join('')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_SEARCH_LENGTH);
};

const normalizeSort = (value: string | null): ReviewListSort => {
	return REVIEW_LIST_SORT_OPTIONS.includes(value as ReviewListSort)
		? (value as ReviewListSort)
		: 'latest';
};

const normalizePage = (value: string | null): number => {
	if (!value || !/^[1-9]\d*$/.test(value)) return 1;

	const page = Number(value);
	return Number.isSafeInteger(page) ? page : 1;
};

export const parseReviewListParameters = (searchParams: URLSearchParams): ReviewListParameters => ({
	search: sanitizeReviewSearch(searchParams.get('search') ?? ''),
	sort: normalizeSort(searchParams.get('sort')),
	page: normalizePage(searchParams.get('page'))
});

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const buildReviewSearchFilter = (search: string): Filter<BarReview> => {
	if (!search) return {};

	const expression = { $regex: escapeRegex(search), $options: 'i' };

	return {
		$or: [
			{ title: expression },
			{ location: expression },
			{ description: expression },
			{ author: expression },
			{ coAuthors: expression }
		]
	};
};

const REVIEW_LIST_SORTS = {
	latest: { createdAt: -1, _id: -1 },
	oldest: { createdAt: 1, _id: 1 },
	score: { rating: -1, createdAt: -1, _id: -1 }
} as const satisfies Record<ReviewListSort, Sort>;

export const getReviewListSort = (sort: ReviewListSort): Sort => REVIEW_LIST_SORTS[sort];

export const getReviewListPagination = (
	totalResults: number,
	requestedPage: number
): ReviewListPagination => {
	const pageCount = Math.ceil(totalResults / REVIEW_LIST_PAGE_SIZE);
	const page = Math.min(requestedPage, Math.max(pageCount, 1));

	return {
		page,
		pageCount,
		skip: (page - 1) * REVIEW_LIST_PAGE_SIZE
	};
};
