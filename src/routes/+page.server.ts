import { bars } from '$lib/db/bars';
import { getReviewPublicationStatus, withReviewVisibility } from '$lib/server/review-publication';
import {
	buildReviewSearchFilter,
	getReviewListPagination,
	getReviewListSort,
	parseReviewListParameters,
	REVIEW_LIST_PAGE_SIZE
} from '$lib/server/review-listing';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async function ({ url, locals }) {
	const { search, sort, page: requestedPage } = parseReviewListParameters(url.searchParams);
	const filter = withReviewVisibility(buildReviewSearchFilter(search), Boolean(locals.user));
	const totalResults = await bars.countDocuments(filter);
	const { page, pageCount, skip } = getReviewListPagination(totalResults, requestedPage);
	const data = await bars
		.find(filter)
		.sort(getReviewListSort(sort))
		.skip(skip)
		.limit(REVIEW_LIST_PAGE_SIZE)
		.toArray();

	const serializedData = data.map((item) => ({
		...item,
		_id: item._id.toString(),
		publicationStatus: getReviewPublicationStatus(item)
	}));

	return {
		bars: serializedData,
		search,
		sort,
		page,
		pageCount,
		pageSize: REVIEW_LIST_PAGE_SIZE,
		totalResults,
		showPublicationStatus: Boolean(locals.user)
	};
};
