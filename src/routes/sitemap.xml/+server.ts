import { Effect } from 'effect';
import { loadPublicReviewSitemap } from '$lib/server/review-sitemap';
import { runWeb } from '$lib/server/web';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const xml = await runWeb(
		event,
		loadPublicReviewSitemap.pipe(Effect.catchTag('MongoError', () => Effect.succeed(null)))
	);
	if (xml === null) {
		return new Response('Kunde inte hämta webbplatskartan. Försök igen.', {
			status: 503,
			headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
		});
	}
	return new Response(xml, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': 'public, max-age=300'
		}
	});
};
