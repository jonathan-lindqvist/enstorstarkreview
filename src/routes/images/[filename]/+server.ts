import { readFile } from 'fs/promises';
import type { RequestHandler } from '@sveltejs/kit';
import { bars } from '$lib/db/bars';
import {
	readReviewImage,
	type ReviewImageReadDependencies
} from '$lib/server/review-image-response';
import { readReviewImagePreview } from '$lib/server/review-image-previews';

const dependencies: ReviewImageReadDependencies = {
	findReview: (filter) => bars.findOne(filter, { projection: { publicationStatus: 1, _id: 0 } }),
	readImage: async (path) => new Uint8Array(await readFile(path)),
	readPreview: readReviewImagePreview
};

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
		dependencies,
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
