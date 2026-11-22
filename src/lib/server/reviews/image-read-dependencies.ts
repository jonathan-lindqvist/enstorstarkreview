import { readFile } from 'fs/promises';
import { bars } from '$lib/db/bars';
import { readReviewImagePreview } from '$lib/server/review-image-previews';
import type { ReviewImageReadDependencies } from '$lib/server/review-image-response';
import { withReviewVisibility } from '$lib/server/review-publication';

export const reviewImageReadDependencies: ReviewImageReadDependencies = {
	findVisibleReview: (filename, isAuthenticated) =>
		bars.findOne(withReviewVisibility({ image: filename }, isAuthenticated), {
			projection: { publicationStatus: 1, _id: 0 }
		}),
	readImage: async (path) => new Uint8Array(await readFile(path)),
	readPreview: readReviewImagePreview
};
