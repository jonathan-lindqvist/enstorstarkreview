import { serializeReview } from '$lib/server/reviews/serialization';
import { bars } from '$lib/db/bars';
import { withReviewVisibility } from '$lib/server/review-publication';
import { buildReviewSearchFilter, sanitizeReviewSearch } from '$lib/server/reviews/listing';
import { normalizeReviewSort } from '$lib/utils/review-sort';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async function ({ url, locals }) {
	const search = sanitizeReviewSearch(url.searchParams.get('search'));
	const sort = normalizeReviewSort(url.searchParams.get('sort'));

	const data = await bars
		.find(withReviewVisibility(buildReviewSearchFilter(search), Boolean(locals.user)))
		.toArray();

	const serializedData = data.map((item) => serializeReview(item));

	return {
		bars: serializedData,
		search,
		sort,
		showPublicationStatus: Boolean(locals.user)
	};
};
