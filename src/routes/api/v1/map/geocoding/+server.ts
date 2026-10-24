import { apiHandler, jsonResponse, requireUser } from '#lib/server/api/http.js';
import { toApiReviewMap } from '#lib/server/api/reviews.js';
import { getPublicReviewMapData, resolveOnePublicReviewMapMarker } from '#lib/server/review-map.js';

// Only reviewers may trigger geocoding; anonymous readers only see cached markers.
export const POST = apiHandler(async (event) => {
	const user = requireUser(event);
	if (user instanceof Response) return user;

	const marker = await resolveOnePublicReviewMapMarker();
	if (!marker) return new Response(null, { status: 204 });

	return jsonResponse(toApiReviewMap(await getPublicReviewMapData()));
});
