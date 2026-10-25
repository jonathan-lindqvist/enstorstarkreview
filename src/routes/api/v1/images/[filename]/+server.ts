import { readFile } from 'fs/promises';
import { bars } from '$lib/db/bars';
import { apiHandler } from '$lib/server/api/http';
import { internalErrorProblem, notFoundProblem, problem } from '$lib/server/api/problem';
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

const invalidPreviewProblem = () => problem(400, 'bad_request', 'Ogiltig bildförhandsvisning.');

export const GET = apiHandler(async (event) => {
	const previews = event.url.searchParams.getAll('preview');
	if (previews.length > 1) return invalidPreviewProblem();

	const image = await readReviewImage(
		event.params.filename,
		Boolean(event.locals.user),
		dependencies,
		previews[0] ?? null
	);
	if (!image.ok) {
		if (image.status === 400) return invalidPreviewProblem();
		if (image.status === 404) return notFoundProblem();
		if (image.status === 503) {
			return problem(503, 'service_unavailable', 'Försök igen om en stund.', {
				headers: { 'retry-after': '1' }
			});
		}
		return internalErrorProblem();
	}

	return new Response(image.body, {
		headers: {
			'cache-control': image.cacheControl,
			'content-type': image.contentType,
			vary: 'Authorization'
		}
	});
});
