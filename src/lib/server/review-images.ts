import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ObjectId } from 'mongodb';
import { Context, Effect, Exit, Layer, Scope } from 'effect';
import {
	ALLOWED_REVIEW_IMAGE_MIME_TYPES,
	MAX_REVIEW_IMAGE_SIZE_BYTES,
	REVIEW_IMAGE_ALLOWED_TYPES_LABEL,
	REVIEW_IMAGE_TOO_LARGE_MESSAGE
} from '$lib/constants';
import type { ReviewImagePreview } from '$lib/types/review-image';
import { ReviewInvalid, StorageFailed } from '$lib/server/errors';
import { AppConfig } from '$lib/server/platform/config';
import { createReviewImagePreviewReader } from './review-image-previews';
export { isReviewImageFilename } from '$lib/utils/review-image';

const ALLOWED_IMAGE_MIME: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp'
};

export interface ReviewImageUpload {
	filename: string;
	path: string;
}

export interface ReviewImageUploadOptions {
	required: boolean;
	writeFailureMessage: string;
}

export const getImageExtension = (mimeType: string): string | undefined => {
	if (!(ALLOWED_REVIEW_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) return undefined;
	return ALLOWED_IMAGE_MIME[mimeType];
};

export const getReviewImageMimeType = (filename: string): string | undefined => {
	const extension = filename.toLowerCase().split('.').pop();

	if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
	if (extension === 'png') return 'image/png';
	if (extension === 'webp') return 'image/webp';
	return undefined;
};

export const sanitizeReviewImage = async (bytes: Uint8Array, mimeType: string): Promise<Buffer> => {
	const { default: sharp } = await import('sharp');
	const image = sharp(Buffer.from(bytes)).rotate();

	if (mimeType === 'image/jpeg') return image.jpeg({ quality: 90 }).toBuffer();
	if (mimeType === 'image/png') return image.png().toBuffer();
	if (mimeType === 'image/webp') return image.webp({ quality: 90 }).toBuffer();

	throw new Error(`Unsupported image type: ${mimeType}`);
};

export const matchesImageSignature = (bytes: Uint8Array, mimeType: string): boolean => {
	if (mimeType === 'image/jpeg') {
		return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
	}

	if (mimeType === 'image/png') {
		return (
			bytes.length >= 8 &&
			bytes[0] === 0x89 &&
			bytes[1] === 0x50 &&
			bytes[2] === 0x4e &&
			bytes[3] === 0x47 &&
			bytes[4] === 0x0d &&
			bytes[5] === 0x0a &&
			bytes[6] === 0x1a &&
			bytes[7] === 0x0a
		);
	}

	if (mimeType === 'image/webp') {
		return (
			bytes.length >= 12 &&
			String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
			String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
		);
	}

	return false;
};

const imageProblem = (message: string) => new ReviewInvalid({ message, pointer: '/image' });

const logged =
	(label: string, error: () => ReviewInvalid | StorageFailed) =>
	(cause: unknown): ReviewInvalid | StorageFailed => {
		console.error(label, cause);
		return error();
	};

/**
 * Review photos on disk. `upload` validates type, signature and size, re-encodes through
 * `sharp` (stripping metadata) and writes `<ObjectId>.<ext>`. The written file belongs to the
 * caller's `Scope`: when the scope closes with a failure (a later insert, an update conflict),
 * the file is removed, so a rejected write never leaves an orphan.
 */
export class ReviewImages extends Context.Service<
	ReviewImages,
	{
		readonly directory: string;
		upload(
			image: FormDataEntryValue | null,
			options: ReviewImageUploadOptions
		): Effect.Effect<ReviewImageUpload | null, ReviewInvalid | StorageFailed, Scope.Scope>;
		read(filename: string): Effect.Effect<Uint8Array, unknown>;
		readPreview(filename: string, preview: ReviewImagePreview): Effect.Effect<Uint8Array, unknown>;
	}
>()('enstorstark/server/ReviewImages') {
	static readonly make = (directory: string) => {
		const readPreview = createReviewImagePreviewReader({ directory: () => directory });

		const upload = Effect.fnUntraced(function* (
			image: FormDataEntryValue | null,
			options: ReviewImageUploadOptions
		) {
			if (!(image instanceof File) || image.size === 0) {
				if (options.required) return yield* imageProblem('Ogiltig fil');
				return null;
			}
			if (image.size > MAX_REVIEW_IMAGE_SIZE_BYTES) {
				return yield* imageProblem(REVIEW_IMAGE_TOO_LARGE_MESSAGE);
			}
			const extension = getImageExtension(image.type);
			if (!extension) {
				return yield* imageProblem(
					`Ogiltig filtyp. Endast ${REVIEW_IMAGE_ALLOWED_TYPES_LABEL} är tillåtna`
				);
			}

			const bytes = yield* Effect.tryPromise({
				try: () => image.bytes(),
				catch: logged('Image read failed:', () => imageProblem('Kunde inte läsa bilden'))
			});
			if (!matchesImageSignature(bytes, image.type)) {
				return yield* imageProblem('Bildens innehåll matchar inte filtypen');
			}
			const sanitized = yield* Effect.tryPromise({
				try: () => sanitizeReviewImage(bytes, image.type),
				catch: logged('Image processing failed:', () => imageProblem('Kunde inte bearbeta bilden'))
			});

			const filename = `${new ObjectId().toHexString()}.${extension}`;
			const path = join(directory, filename);
			return yield* Effect.acquireRelease(
				Effect.tryPromise({
					try: async () => {
						await mkdir(directory, { recursive: true });
						await writeFile(path, sanitized);
						return { filename, path };
					},
					catch: logged(
						'Image upload failed:',
						() => new StorageFailed({ message: options.writeFailureMessage })
					)
				}),
				(upload, exit) =>
					Exit.isSuccess(exit)
						? Effect.void
						: Effect.promise(() =>
								unlink(upload.path).catch((cause) => console.error('Image cleanup failed:', cause))
							)
			);
		});

		return ReviewImages.of({
			directory,
			upload,
			read: (filename) =>
				Effect.tryPromise({
					try: async () => new Uint8Array(await readFile(join(directory, filename))),
					catch: (cause) => cause
				}),
			readPreview: (filename, preview) =>
				Effect.tryPromise({ try: () => readPreview(filename, preview), catch: (cause) => cause })
		});
	};

	static readonly layer = Layer.effect(
		ReviewImages,
		Effect.gen(function* () {
			const { reviewImageDirectory } = yield* AppConfig;
			return ReviewImages.make(reviewImageDirectory);
		})
	);
}
