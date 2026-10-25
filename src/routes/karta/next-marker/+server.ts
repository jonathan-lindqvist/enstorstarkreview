import { error, json } from '@sveltejs/kit';
import { Effect } from 'effect';
import { ReviewMap } from '$lib/server/map/service';
import { runWeb } from '$lib/server/web';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	if (!event.locals.user) error(401, 'Du behöver vara inloggad för att uppdatera kartan.');
	if (event.request.headers.get('origin') !== event.url.origin) error(403);

	const map = await runWeb(
		event,
		Effect.gen(function* () {
			const reviewMap = yield* ReviewMap;
			const marker = yield* reviewMap.resolveOne;
			return marker ? yield* reviewMap.get : null;
		})
	);
	if (!map) return new Response(null, { status: 204 });
	return json({ map });
};
