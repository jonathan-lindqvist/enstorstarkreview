import { apiHandler, cachedJsonResponse } from '$lib/server/api/http';
import { toApiStatistics } from '$lib/server/api/statistics';
import { getPublicReviewStatistics } from '$lib/server/review-statistics';

export const GET = apiHandler(async (event) =>
	cachedJsonResponse(event, toApiStatistics(await getPublicReviewStatistics()))
);
