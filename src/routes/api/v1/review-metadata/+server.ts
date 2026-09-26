import { apiHandler, cachedJsonResponse } from '$lib/server/api/http';
import { buildReviewMetadata } from '$lib/server/api/metadata';

export const GET = apiHandler(async (event) => cachedJsonResponse(event, buildReviewMetadata()));
