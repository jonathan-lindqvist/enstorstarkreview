import { apiHandler, cachedJsonResponse } from '$lib/server/api/http';
import type { ApiSchemas } from '$lib/server/api/openapi';
import { getPublicReviewStatistics } from '$lib/server/review-statistics';

export const GET = apiHandler(async (event) => {
	// The price chart points are web-only and not part of the API contract.
	const { priceComparison: _priceComparison, ...rest } = await getPublicReviewStatistics();
	const statistics: ApiSchemas['ReviewStatistics'] = rest;
	return cachedJsonResponse(event, statistics);
});
