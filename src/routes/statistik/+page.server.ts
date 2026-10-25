import { ReviewStatistics } from '$lib/server/review-statistics';
import { runWeb } from '$lib/server/web';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => ({
	statistics: await runWeb(
		event,
		ReviewStatistics.use((statistics) => statistics.get)
	)
});
