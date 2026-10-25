import { error, json, type RequestHandler } from '@sveltejs/kit';
import { getPublicReviewMapData } from '$lib/server/review-map';
import { webClient } from '$lib/server/rpc/web';

export const POST: RequestHandler = async (event) => {
	const { request, url, locals } = event;
	if (!locals.user) throw error(401, 'Du behöver vara inloggad för att uppdatera kartan.');

	const origin = request.headers.get('origin');
	if (origin !== url.origin) throw error(403);

	// The procedure owns the authorization and the single geocoding attempt. The browser map
	// renders the web projection of the markers, not the API's.
	const result = await webClient(event).map.resolveNextMarker();
	if (result.status === 204) return new Response(null, { status: 204 });

	return json({ map: await getPublicReviewMapData() });
};
