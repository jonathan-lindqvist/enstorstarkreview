import { readFile } from 'fs/promises';
import { bars } from '$lib/db/bars';
import { apiHandler } from '$lib/server/api/http';
import { reviewImageResponse } from '$lib/server/api/images';
import type { ReviewImageReadDependencies } from '$lib/server/review-image-response';
import { readReviewImagePreview } from '$lib/server/review-image-previews';

const dependencies: ReviewImageReadDependencies = {
	findReview: (filter) => bars.findOne(filter, { projection: { publicationStatus: 1, _id: 0 } }),
	readImage: async (path) => new Uint8Array(await readFile(path)),
	readPreview: readReviewImagePreview
};

export const GET = apiHandler((event) =>
	reviewImageResponse(
		event.params.filename,
		Boolean(event.locals.user),
		event.url.searchParams.getAll('preview'),
		dependencies
	)
);
