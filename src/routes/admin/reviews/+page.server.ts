import { serializeReview } from '$lib/server/reviews/serialization';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listActiveReviews } from '$lib/server/reviews/queries';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const data = await listActiveReviews();
	const serializedData = data.map((bar) => serializeReview(bar));

	return {
		username: locals.user.username,
		bars: serializedData
	};
};
