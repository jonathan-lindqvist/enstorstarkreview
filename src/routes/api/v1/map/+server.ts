import { apiHandler, cachedJsonResponse } from '#lib/server/api/http.js';
import { toApiReviewMap } from '#lib/server/api/reviews.js';
import { getPublicReviewMapData } from '#lib/server/review-map.js';

export const GET = apiHandler(async (event) =>
	cachedJsonResponse(event, toApiReviewMap(await getPublicReviewMapData()))
);
