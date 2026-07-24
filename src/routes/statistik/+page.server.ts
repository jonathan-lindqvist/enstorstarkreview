import type { PageServerLoad } from './$types';
import { getPublicReviewStatistics } from '$lib/server/review-statistics';

export const load: PageServerLoad = async () => ({
	statistics: await getPublicReviewStatistics()
});
