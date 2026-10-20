import { normalizeBarAttributes, setBarAttributeParams } from './bar-attributes';
import { normalizeHomeReviewSort } from './utils/home-review-sort';
import { sanitizeReviewSearch } from './utils/review-search';
import type { HomeReviewQuery } from './types/home-reviews';

export const HOME_REVIEW_PAGE_SIZE = 24;

export const normalizeHomeReviewQuery = (params: URLSearchParams): HomeReviewQuery => ({
	search: sanitizeReviewSearch(params.get('search')),
	sort: normalizeHomeReviewSort(params.get('sort')),
	attributes: normalizeBarAttributes(params.getAll('attributes')),
	page: 1
});

export const homeReviewParams = (query: HomeReviewQuery): URLSearchParams => {
	const params = new URLSearchParams();
	if (query.search) params.set('search', sanitizeReviewSearch(query.search));
	if (query.sort !== 'latest') params.set('sort', query.sort);
	setBarAttributeParams(params, query.attributes);
	if (query.page > 1) params.set('page', String(query.page));
	return params;
};

export const homeReviewHref = (query: HomeReviewQuery): '/' | `/?${string}` => {
	const params = homeReviewParams(query).toString();
	return params ? `/?${params}` : '/';
};
