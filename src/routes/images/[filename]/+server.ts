import { Effect } from 'effect';
import type { RequestHandler } from './$types';
import { readReviewImage } from '$lib/server/review-image-response';
import { runWeb } from '$lib/server/web';
import { httpStatusOf, messageOf } from '$lib/server/errors';

export const GET: RequestHandler = async (event) => {
	const result = await runWeb(
		event,
		readReviewImage(event.params.filename, event.url.searchParams.getAll('preview')).pipe(
			Effect.catch((failure) => Effect.succeed({ failure }))
		)
	);
	if ('failure' in result) {
		const status = httpStatusOf(result.failure) ?? 500;
		const message =
			status === 503
				? 'Kunde inte läsa bilden'
				: (messageOf(result.failure) ?? 'Kunde inte läsa bilden');
		return new Response(message, {
			status,
			headers: { 'cache-control': 'no-store', ...(status === 503 ? { 'retry-after': '1' } : {}) }
		});
	}

	return new Response(result.body, {
		headers: { 'cache-control': result.cacheControl, 'content-type': result.contentType }
	});
};
