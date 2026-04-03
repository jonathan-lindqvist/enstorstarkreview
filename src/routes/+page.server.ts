import { bars } from '$lib/db/bars';
import type { PageServerLoad } from './$types';

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MAX_SEARCH_LENGTH = 80;

const sanitizeSearch = (value: string): string => {
	return value.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH_LENGTH);
};

const escapeRegex = (value: string): string => {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const load: PageServerLoad = async function ({ url }) {
	const rawSearch = url.searchParams.get('search') ?? '';
	const search = sanitizeSearch(rawSearch);

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

	const data = await bars.find(filter).toArray();

	const serializedData = data.map((item) => ({
		...item,
		_id: item._id.toString()
	}));

	return {
		bars: serializedData,
		search
	};
};
