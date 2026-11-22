import { readFile } from 'fs/promises';
import { readReviewImagePreview } from '$lib/server/review-image-previews';
import type { ReviewImageReadDependencies } from '$lib/server/review-image-response';
import { findVisibleReviewForImage } from './queries';

export const reviewImageReadDependencies: ReviewImageReadDependencies = {
	findVisibleReview: findVisibleReviewForImage,
	readImage: async (path) => new Uint8Array(await readFile(path)),
	readPreview: readReviewImagePreview
};
