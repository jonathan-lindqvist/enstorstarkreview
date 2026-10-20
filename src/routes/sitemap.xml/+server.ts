import { bars } from '$lib/db/bars';
import { loadPublicReviewSitemap } from '$lib/server/review-sitemap';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		return new Response(await loadPublicReviewSitemap(bars), {
			headers: {
				'content-type': 'application/xml; charset=utf-8',
				'cache-control': 'public, max-age=300'
			}
		});
	} catch {
		return new Response('Kunde inte hämta webbplatskartan. Försök igen.', {
			status: 503,
			headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
		});
	}
};
