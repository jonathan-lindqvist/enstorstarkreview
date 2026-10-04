import { serializeReview } from '$lib/server/reviews/serialization';
import { stripControlCharacters } from '$lib/utils/review-text';
import { normalizeBarAttributes } from '$lib/bar-attributes';
import { bars } from '$lib/db/bars';
import { withReviewVisibility } from '$lib/server/review-publication';
import type { PageServerLoad } from './$types';

const MAX_SEARCH_LENGTH = 80;
const SORT_OPTIONS = ['latest', 'oldest', 'score'] as const;

type ReviewSort = (typeof SORT_OPTIONS)[number];

const sanitizeSearch = (value: string): string => {
	return stripControlCharacters(value).replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH_LENGTH);
};

const normalizeSort = (value: string | null): ReviewSort => {
	return SORT_OPTIONS.includes(value as ReviewSort) ? (value as ReviewSort) : 'latest';
};

export const load: PageServerLoad = async function ({ url, locals }) {
	const rawSearch = url.searchParams.get('search') ?? '';
	const search = sanitizeSearch(rawSearch);
	const sort = normalizeSort(url.searchParams.get('sort'));

	// Keep the complete visible collection so clearing a direct-link filter restores all bars.
	const data = await bars.find(withReviewVisibility({}, Boolean(locals.user))).toArray();

	const serializedData = data.map((item) => serializeReview(item));

	return {
		bars: serializedData,
		search,
		sort,
		attributes: normalizeBarAttributes(url.searchParams.getAll('attributes')),
		showPublicationStatus: Boolean(locals.user)
	};
};
