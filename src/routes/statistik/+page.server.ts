import type { PageServerLoad } from './$types';
import { getPublicReviewStatistics } from '$lib/server/review-statistics';
import { parseStatisticsRegion } from '$lib/statistics-regions';

export const load: PageServerLoad = async ({ url }) => {
	const region = parseStatisticsRegion(url.searchParams.getAll('region')) ?? 'goteborg';
	return { region, statistics: await getPublicReviewStatistics(region) };
};
