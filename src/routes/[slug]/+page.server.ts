import type { PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, locals }) => {
	const bar = await bars.findOne({ slug: params.slug });
	if (!bar) throw error(404);

	return {
		bar: {
			...bar,
			_id: bar._id.toString()
		},
		user: locals.user ?? null
	};
};
