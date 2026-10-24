import { apiHandler, cachedJsonResponse } from '#lib/server/api/http.js';
import { buildReviewMetadata } from '#lib/server/api/metadata.js';

export const GET = apiHandler(async (event) => cachedJsonResponse(event, buildReviewMetadata()));
