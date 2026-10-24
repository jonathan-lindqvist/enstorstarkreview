import { apiHandler, cachedJsonResponse } from '#lib/server/api/http.js';
import type { ApiSchemas } from '#lib/server/api/openapi.js';
import { getPublicReviewStatistics } from '#lib/server/review-statistics.js';

export const GET = apiHandler(async (event) => {
	const statistics: ApiSchemas['ReviewStatistics'] = await getPublicReviewStatistics();
	return cachedJsonResponse(event, statistics);
});
