import { readFile } from 'fs/promises';
import { bars } from '$lib/db/bars';
import { apiHandler } from '$lib/server/api/http';
import { internalErrorProblem, notFoundProblem } from '$lib/server/api/problem';
import {
	readReviewImage,
	type ReviewImageReadDependencies
} from '$lib/server/review-image-response';

const dependencies: ReviewImageReadDependencies = {
	findReview: (filter) => bars.findOne(filter),
	readImage: async (path) => new Uint8Array(await readFile(path))
};

export const GET = apiHandler(async (event) => {
	const image = await readReviewImage(
		event.params.filename,
		Boolean(event.locals.user),
		dependencies
	);
	if (!image.ok) return image.status === 404 ? notFoundProblem() : internalErrorProblem();

	return new Response(image.body, {
		headers: {
			'cache-control': image.cacheControl,
			'content-type': image.contentType,
			vary: 'Authorization'
		}
	});
});
