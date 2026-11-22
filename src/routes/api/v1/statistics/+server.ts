import { apiHandler, cachedJsonResponse } from '$lib/server/api/http';
import { problem } from '$lib/server/api/problem';
import { toApiStatistics } from '$lib/server/api/statistics';
import { getPublicReviewStatistics } from '$lib/server/review-statistics';
import { parseStatisticsRegion } from '$lib/statistics-regions';

export const GET = apiHandler(async (event) => {
	const regions = event.url.searchParams.getAll('region');
	const region = parseStatisticsRegion(regions);
	if (regions.length && !region) {
		return problem(
			400,
			'bad_request',
			'Välj ett statistikområde: Göteborg, Sverige eller Världen.'
		);
	}
	return cachedJsonResponse(
		event,
		toApiStatistics(await getPublicReviewStatistics(region ?? 'varlden'))
	);
});
