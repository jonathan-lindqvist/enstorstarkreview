import { bars } from '$lib/db/bars';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const searchQuery = url.searchParams.get('query')?.toLowerCase() || '';

	const data = await bars.find({
		$or: [
			{ title: { $regex: searchQuery, $options: 'i' } },
			{ description: { $regex: searchQuery, $options: 'i' } },
			{ location: { $regex: searchQuery, $options: 'i' } }
		]
	}).toArray();

	const serializedData = data.map((item) => ({
		...item,
		_id: item._id.toString()
	}));

	return {
		bars: serializedData
	};
};
