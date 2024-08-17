import { bars } from '$lib/db/bars';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async function () {
	const data = await bars.find().toArray();

	const serializedData = data.map((item) => ({
		...item,
		_id: item._id.toString()
	}));

	return {
		bars: serializedData
	};
};
