import { Effect, Schema } from 'effect';
import { isReviewImagePreview } from '$lib/review-image-previews';
import { Mongo, tryMongo } from '$lib/server/platform/mongo';
import { getReviewImageCacheControl, withReviewVisibility } from '$lib/server/review-publication';
import { Viewer } from '$lib/server/request';
import {
	getReviewImageMimeType,
	isReviewImageFilename,
	ReviewImages
} from '$lib/server/review-images';
import { ReviewImagePreviewCapacityError } from './review-image-previews';

export class ImageNotFound extends Schema.TaggedError<ImageNotFound>()(
	'ImageNotFound',
	{ message: Schema.String },
	{ httpApiStatus: 404 }
) {}

export class InvalidImagePreview extends Schema.TaggedError<InvalidImagePreview>()(
	'InvalidImagePreview',
	{ message: Schema.String },
	{ httpApiStatus: 400, description: 'The `preview` value is unknown or given more than once.' }
) {}

export class ImagePreviewBusy extends Schema.TaggedError<ImagePreviewBusy>()(
	'ImagePreviewBusy',
	{ message: Schema.String },
	{
		httpApiStatus: 503,
		description: 'Too many previews are being generated. Retry after the given time.'
	}
) {}

export class ImageReadFailed extends Schema.TaggedError<ImageReadFailed>()(
	'ImageReadFailed',
	{ message: Schema.String },
	{ httpApiStatus: 500 }
) {}

export interface ReviewImageRead {
	body: ArrayBuffer;
	contentType: string;
	cacheControl: ReturnType<typeof getReviewImageCacheControl>;
}

const notFound = () => new ImageNotFound({ message: 'Bilden finns inte' });
const readFailed = (label: string) => (cause: unknown) => {
	console.error(label, cause);
	return new ImageReadFailed({ message: 'Kunde inte läsa bilden' });
};
const isMissingFile = (cause: unknown) =>
	typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT';

/**
 * Reads a review image after authorizing it through the review that references it. Drafts are
 * visible only to signed-in viewers; unknown, unauthorized and deleted-review files are all 404.
 * Authorization runs before even a cached preview is read. `previews` are the raw query values.
 */
export const readReviewImage = Effect.fn('readReviewImage')(function* (
	filename: string | undefined,
	previews: readonly string[]
) {
	if (previews.length > 1) {
		return yield* new InvalidImagePreview({ message: 'Ogiltig bildförhandsvisning' });
	}
	const preview = previews[0] ?? null;
	if (preview !== null && !isReviewImagePreview(preview)) {
		return yield* new InvalidImagePreview({ message: 'Ogiltig bildförhandsvisning' });
	}
	if (!filename || !isReviewImageFilename(filename)) return yield* notFound();

	const contentType = preview === null ? getReviewImageMimeType(filename) : 'image/webp';
	if (!contentType) return yield* notFound();

	const { bars } = (yield* Mongo).collections;
	const authenticated = yield* Viewer.isAuthenticated;
	const review = yield* tryMongo(() =>
		bars.findOne(withReviewVisibility({ image: filename }, authenticated), {
			projection: { publicationStatus: 1, _id: 0 }
		})
	).pipe(Effect.mapError((error) => readFailed('Image authorization failed:')(error.cause)));
	if (!review) return yield* notFound();

	const images = yield* ReviewImages;
	const bytes = yield* (
		preview === null ? images.read(filename) : images.readPreview(filename, preview)
	).pipe(
		Effect.mapError((cause) => {
			if (cause instanceof ReviewImagePreviewCapacityError) {
				return new ImagePreviewBusy({ message: 'Försök igen om en stund.' });
			}
			if (isMissingFile(cause)) return notFound();
			return readFailed('Image read failed:')(cause);
		})
	);

	const body = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(body).set(bytes);
	return {
		body,
		contentType,
		cacheControl: getReviewImageCacheControl(review)
	} satisfies ReviewImageRead;
});
