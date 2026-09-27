import { readFile } from 'fs/promises';
import { error, type RequestHandler } from '@sveltejs/kit';
import { bars } from '$lib/db/bars';
import {
	readReviewImage,
	type ReviewImageReadDependencies
} from '$lib/server/review-image-response';

const dependencies: ReviewImageReadDependencies = {
	findReview: (filter) => bars.findOne(filter),
	readImage: async (path) => new Uint8Array(await readFile(path))
};

export const GET: RequestHandler = async ({ params, locals }) => {
	const image = await readReviewImage(params.filename, Boolean(locals.user), dependencies);
	if (!image.ok) {
		throw image.status === 404 ? error(404) : error(500, 'Kunde inte läsa bilden');
	}

	return new Response(image.body, {
		headers: {
			'cache-control': image.cacheControl,
			'content-type': image.contentType
		}
	});
};
