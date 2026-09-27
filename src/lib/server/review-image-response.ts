import type { Filter } from 'mongodb';
import type { BarReview } from '$lib/types/bar-review';
import {
	getReviewImageMimeType,
	getReviewImagePath,
	isReviewImageFilename
} from '$lib/server/review-images';
import { getReviewImageCacheControl, withReviewVisibility } from '$lib/server/review-publication';

export interface ReviewImageReadDependencies {
	findReview(filter: Filter<BarReview>): Promise<BarReview | null>;
	readImage(path: string): Promise<Uint8Array>;
}

export type ReviewImageReadResult =
	| {
			ok: true;
			body: ArrayBuffer;
			contentType: string;
			cacheControl: ReturnType<typeof getReviewImageCacheControl>;
	  }
	| { ok: false; status: 404 | 500 };

const isNotFoundError = (err: unknown): boolean =>
	typeof err === 'object' &&
	err !== null &&
	'code' in err &&
	(err as { code?: unknown }).code === 'ENOENT';

/**
 * Reads a review image after authorizing it through the review that references it. Drafts
 * are visible only to authenticated users; unknown and unauthorized files are both 404.
 */
export const readReviewImage = async (
	filename: string | undefined,
	isAuthenticated: boolean,
	deps: ReviewImageReadDependencies
): Promise<ReviewImageReadResult> => {
	if (!filename || !isReviewImageFilename(filename)) return { ok: false, status: 404 };

	const contentType = getReviewImageMimeType(filename);
	if (!contentType) return { ok: false, status: 404 };

	let review;
	try {
		review = await deps.findReview(withReviewVisibility({ image: filename }, isAuthenticated));
	} catch (err) {
		console.error('Image authorization failed:', err);
		return { ok: false, status: 500 };
	}
	if (!review) return { ok: false, status: 404 };

	let bytes: Uint8Array;
	try {
		bytes = await deps.readImage(getReviewImagePath(filename));
	} catch (err) {
		if (isNotFoundError(err)) return { ok: false, status: 404 };
		console.error('Image read failed:', err);
		return { ok: false, status: 500 };
	}

	const body = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(body).set(bytes);

	return { ok: true, body, contentType, cacheControl: getReviewImageCacheControl(review) };
};
