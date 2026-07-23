import { bars } from '$lib/db/bars';
import { getReviewPublicationStatus, withReviewVisibility } from '$lib/server/review-publication';
import type { PageServerLoad } from './$types';

const MAX_SEARCH_LENGTH = 80;
const SORT_OPTIONS = ['latest', 'oldest', 'score'] as const;

type ReviewSort = (typeof SORT_OPTIONS)[number];

const isControlCharacter = (value: string): boolean => {
	const code = value.charCodeAt(0);
	return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127;
};

const sanitizeSearch = (value: string): string => {
	return Array.from(value)
		.filter((character) => !isControlCharacter(character))
		.join('')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_SEARCH_LENGTH);
};

const normalizeSort = (value: string | null): ReviewSort => {
	return SORT_OPTIONS.includes(value as ReviewSort) ? (value as ReviewSort) : 'latest';
};

const escapeRegex = (value: string): string => {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const load: PageServerLoad = async function ({ url, locals }) {
	const rawSearch = url.searchParams.get('search') ?? '';
	const search = sanitizeSearch(rawSearch);
	const sort = normalizeSort(url.searchParams.get('sort'));

	const filter = search
		? {
				$or: [
					{ title: { $regex: escapeRegex(search), $options: 'i' } },
					{ location: { $regex: escapeRegex(search), $options: 'i' } },
					{ description: { $regex: escapeRegex(search), $options: 'i' } },
					{ author: { $regex: escapeRegex(search), $options: 'i' } },
					{ coAuthors: { $regex: escapeRegex(search), $options: 'i' } }
				]
			}
		: {};

	const data = await bars.find(withReviewVisibility(filter, Boolean(locals.user))).toArray();

	const serializedData = data.map((item) => ({
		...item,
		_id: item._id.toString(),
		publicationStatus: getReviewPublicationStatus(item)
	}));

	return {
		bars: serializedData,
		search,
		sort,
		showPublicationStatus: Boolean(locals.user)
	};
};
