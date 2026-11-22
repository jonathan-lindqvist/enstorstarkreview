import type { RequestHandler } from '@sveltejs/kit';
import { readReviewImage } from '$lib/server/review-image-response';
import { reviewImageReadDependencies } from '$lib/server/reviews/image-read-dependencies';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (url.searchParams.getAll('preview').length > 1) {
		return new Response('Ogiltig bildförhandsvisning', {
			status: 400,
			headers: { 'cache-control': 'no-store' }
		});
	}
	const image = await readReviewImage(
		params.filename,
		Boolean(locals.user),
		reviewImageReadDependencies,
		url.searchParams.get('preview')
	);
	if (!image.ok) {
		const message =
			image.status === 404
				? 'Bilden finns inte'
				: image.status === 400
					? 'Ogiltig bildförhandsvisning'
					: 'Kunde inte läsa bilden';
		return new Response(message, {
			status: image.status,
			headers: {
				'cache-control': 'no-store',
				...(image.status === 503 ? { 'retry-after': '1' } : {})
			}
		});
	}

	return new Response(image.body, {
		headers: {
			'cache-control': image.cacheControl,
			'content-type': image.contentType
		}
	});
};
