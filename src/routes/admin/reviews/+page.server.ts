import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { bars } from '$lib/db/bars';
import { getReviewPublicationStatus } from '$lib/server/review-publication';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const data = await bars.find().toArray();
	const serializedData = data.map((bar) => ({
		...bar,
		_id: bar._id.toString(),
		publicationStatus: getReviewPublicationStatus(bar)
	}));

	return {
		username: locals.user.username,
		bars: serializedData
	};
};
