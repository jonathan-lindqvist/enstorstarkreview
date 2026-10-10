import { serializeReview } from '$lib/server/reviews/serialization';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { ACTIVE_REVIEW_FILTER } from '$lib/server/review-publication';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const data = await bars.find(ACTIVE_REVIEW_FILTER).toArray();
	const serializedData = data.map((bar) => serializeReview(bar));

	return {
		username: locals.user.username,
		bars: serializedData
	};
};
