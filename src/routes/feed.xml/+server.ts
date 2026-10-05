import { createHash } from 'node:crypto';
import { bars } from '$lib/db/bars';
import { loadPublicReviewFeed } from '$lib/server/review-feed';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const xml = await loadPublicReviewFeed(bars, url.origin);
		const etag = `"${createHash('sha256').update(xml).digest('hex')}"`;
		const headers = {
			'content-type': 'application/rss+xml; charset=utf-8',
			'cache-control': 'public, max-age=300',
			etag
		};
		const unchanged = request.headers
			.get('if-none-match')
			?.split(',')
			.some((candidate) => {
				const tag = candidate.trim();
				return tag === '*' || tag === etag || tag === `W/${etag}`;
			});
		return new Response(unchanged ? null : xml, { status: unchanged ? 304 : 200, headers });
	} catch (error) {
		console.error('Review feed failed:', error);
		return new Response('Kunde inte hämta RSS-flödet. Försök igen om en stund.', {
			status: 503,
			headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
		});
	}
};
