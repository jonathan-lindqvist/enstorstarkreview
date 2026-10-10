import { serializeReview } from '$lib/server/reviews/serialization';
import { normalizeBarAttributes } from '$lib/bar-attributes';
import { bars } from '$lib/db/bars';
import { withReviewVisibility } from '$lib/server/review-publication';
import { sanitizeReviewSearch } from '$lib/server/reviews/listing';
import { normalizeHomeReviewSort } from '$lib/utils/home-review-sort';
import { loadReviewCoordinates } from '$lib/server/reviews/coordinates';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async function ({ url, locals }) {
	const search = sanitizeReviewSearch(url.searchParams.get('search'));
	const sort = normalizeHomeReviewSort(url.searchParams.get('sort'));

	// Keep the complete visible collection so clearing a direct-link filter restores all bars.
	const data = await bars.find(withReviewVisibility({}, Boolean(locals.user))).toArray();

	const serializedData = data.map((item) => serializeReview(item));

	return {
		bars: serializedData,
		coordinatesByReviewId: await loadReviewCoordinates(data),
		search,
		sort,
		attributes: normalizeBarAttributes(url.searchParams.getAll('attributes')),
		showPublicationStatus: Boolean(locals.user)
	};
};
