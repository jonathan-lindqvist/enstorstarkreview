import { apiHandler, cachedJsonResponse } from '$lib/server/api/http';
import { toApiReviewMap } from '$lib/server/api/reviews';
import { getPublicReviewMapData } from '$lib/server/review-map';

export const GET = apiHandler(async (event) =>
	cachedJsonResponse(event, toApiReviewMap(await getPublicReviewMapData()))
);
