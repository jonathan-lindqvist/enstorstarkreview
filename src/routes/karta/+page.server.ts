import type { PageServerLoad } from './$types';
import { getPublicReviewMapData } from '$lib/server/review-map';

export const load: PageServerLoad = async () => ({
	map: await getPublicReviewMapData()
});
