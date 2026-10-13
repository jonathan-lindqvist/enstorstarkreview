import type { Filter } from 'mongodb';
import type { BarReview } from '$lib/types/bar-review';
import {
	getReviewImageMimeType,
	getReviewImagePath,
	isReviewImageFilename
} from '$lib/server/review-images';
import { getReviewImageCacheControl, withReviewVisibility } from '$lib/server/review-publication';
import { isReviewImagePreview } from '$lib/review-image-previews';
import type { ReviewImagePreview } from '$lib/types/review-image';
import { ReviewImagePreviewCapacityError } from './review-image-previews';

export interface ReviewImageReadDependencies {
	findReview(filter: Filter<BarReview>): Promise<Pick<BarReview, 'publicationStatus'> | null>;
	readImage(path: string): Promise<Uint8Array>;
	readPreview?(filename: string, preview: ReviewImagePreview): Promise<Uint8Array>;
}

export type ReviewImageReadResult =
	| {
			ok: true;
			body: ArrayBuffer;
			contentType: string;
			cacheControl: ReturnType<typeof getReviewImageCacheControl>;
	  }
	| { ok: false; status: 400 | 404 | 500 | 503 };

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
	deps: ReviewImageReadDependencies,
	preview: string | null = null
): Promise<ReviewImageReadResult> => {
	if (preview !== null && !isReviewImagePreview(preview)) return { ok: false, status: 400 };
	if (!filename || !isReviewImageFilename(filename)) return { ok: false, status: 404 };

	const contentType = preview === null ? getReviewImageMimeType(filename) : 'image/webp';
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
		if (preview !== null) {
			if (!deps.readPreview) return { ok: false, status: 500 };
			bytes = await deps.readPreview(filename, preview);
		} else {
			bytes = await deps.readImage(getReviewImagePath(filename));
		}
	} catch (err) {
		if (err instanceof ReviewImagePreviewCapacityError) return { ok: false, status: 503 };
		if (isNotFoundError(err)) return { ok: false, status: 404 };
		console.error('Image read failed:', err);
		return { ok: false, status: 500 };
	}

	const body = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(body).set(bytes);

	return { ok: true, body, contentType, cacheControl: getReviewImageCacheControl(review) };
};
