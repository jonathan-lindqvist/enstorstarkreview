import { error, type RequestHandler } from '@sveltejs/kit';
import { getPublicReviewMapData, resolveOnePublicReviewMapMarker } from '#lib/server/review-map.js';

export const POST: RequestHandler = async ({ request, url, locals }) => {
	if (!locals.user) throw error(401, 'Du behöver vara inloggad för att uppdatera kartan.');

	const origin = request.headers.get('origin');
	if (origin !== url.origin) throw error(403);

	const marker = await resolveOnePublicReviewMapMarker();
	if (!marker) return new Response(null, { status: 204 });

	return Response.json({ map: await getPublicReviewMapData() });
};
