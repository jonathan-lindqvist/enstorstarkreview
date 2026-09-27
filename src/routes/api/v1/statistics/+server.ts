import { apiHandler, cachedJsonResponse } from '$lib/server/api/http';
import type { ApiSchemas } from '$lib/server/api/openapi';
import { getPublicReviewStatistics } from '$lib/server/review-statistics';

export const GET = apiHandler(async (event) => {
	const statistics: ApiSchemas['ReviewStatistics'] = await getPublicReviewStatistics();
	return cachedJsonResponse(event, statistics);
});
