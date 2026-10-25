import { Effect, Exit } from 'effect';
import {
	getImageExtension,
	getReviewImageMimeType,
	isReviewImageFilename,
	matchesImageSignature,
	ReviewImages,
	sanitizeReviewImage,
	type ReviewImageUploadOptions
} from '$lib/server/review-images';
import { AppConfig } from '$lib/server/platform/config';
import { join } from 'path';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const createImageWithExif = async (mimeType: string): Promise<Buffer> => {
	const image = sharp({
		create: {
			width: 2,
			height: 2,
			channels: 3,
			background: { r: 220, g: 40, b: 40 }
		}
	}).withExif({
		IFD0: {
			Artist: 'tracking-data',
			Copyright: 'private-metadata'
		}
	});

	if (mimeType === 'image/jpeg') return image.jpeg().toBuffer();
	if (mimeType === 'image/png') return image.png().toBuffer();
	if (mimeType === 'image/webp') return image.webp().toBuffer();
	throw new Error(`Unsupported fixture type: ${mimeType}`);
};

const configuredDirectory = (env: Record<string, string>) =>
	Effect.runSync(
		AppConfig.use((config) => Effect.succeed(config.reviewImageDirectory)).pipe(
			Effect.provide(AppConfig.layerFromEnv({ MONGO_URI: 'mongodb://test', ...env }))
		)
	);

// Runs an upload in its own scope and returns the old result shape.
const uploadReviewImage = (
	image: FormDataEntryValue | null,
	options: ReviewImageUploadOptions,
	directory = '/nonexistent-review-images'
) =>
	Effect.runPromise(
		Effect.scoped(ReviewImages.make(directory).upload(image, options)).pipe(
			Effect.map((upload) => ({ ok: true as const, upload })),
			Effect.catch((problem) => Effect.succeed({ ok: false as const, problem }))
		)
	);

describe('images', () => {
	it('getImageExtension returns extension for allowed mime types', () => {
		expect(getImageExtension('image/jpeg')).toBe('jpg');
		expect(getImageExtension('image/png')).toBe('png');
		expect(getImageExtension('image/webp')).toBe('webp');
		expect(getImageExtension('image/gif')).toBeUndefined();
		expect(getImageExtension('application/pdf')).toBeUndefined();
	});

	it('recognizes persisted review image filenames and MIME types', () => {
		expect(isReviewImageFilename('6a1e9d487d43112acf4a0c36.jpg')).toBe(true);
		expect(isReviewImageFilename('6a1e9d487d43112acf4a0c36.jpeg')).toBe(true);
		expect(isReviewImageFilename('6a1e9d487d43112acf4a0c36.png')).toBe(true);
		expect(isReviewImageFilename('6a1e9d487d43112acf4a0c36.webp')).toBe(true);
		expect(isReviewImageFilename('../6a1e9d487d43112acf4a0c36.jpg')).toBe(false);
		expect(isReviewImageFilename('not-an-object-id.jpg')).toBe(false);
		expect(isReviewImageFilename('6a1e9d487d43112acf4a0c36.gif')).toBe(false);

		expect(getReviewImageMimeType('6a1e9d487d43112acf4a0c36.jpg')).toBe('image/jpeg');
		expect(getReviewImageMimeType('6a1e9d487d43112acf4a0c36.jpeg')).toBe('image/jpeg');
		expect(getReviewImageMimeType('6a1e9d487d43112acf4a0c36.png')).toBe('image/png');
		expect(getReviewImageMimeType('6a1e9d487d43112acf4a0c36.webp')).toBe('image/webp');
		expect(getReviewImageMimeType('6a1e9d487d43112acf4a0c36.gif')).toBeUndefined();
	});

	it('uses the production uploads directory for persisted review images', () => {
		expect(configuredDirectory({ NODE_ENV: 'production' })).toBe('/app/uploads/images');
	});

	it('keeps development uploads outside the publicly served static directory', () => {
		expect(configuredDirectory({ NODE_ENV: 'development' })).toBe(
			join(process.cwd(), 'uploads', 'images')
		);
	});

	it('matchesImageSignature validates jpeg/png/webp magic bytes and rejects gif', () => {
		expect(matchesImageSignature(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg')).toBe(
			true
		);
		expect(
			matchesImageSignature(
				new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
				'image/png'
			)
		).toBe(true);

		const riffWebp = new Uint8Array([
			0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
		]);
		expect(matchesImageSignature(riffWebp, 'image/webp')).toBe(true);
		expect(
			matchesImageSignature(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), 'image/gif')
		).toBe(false);
		expect(matchesImageSignature(new Uint8Array([0x00, 0x01, 0x02]), 'image/jpeg')).toBe(false);
	});

	it('sanitizeReviewImage strips exif metadata and keeps valid image signatures', async () => {
		for (const mimeType of ['image/jpeg', 'image/png', 'image/webp']) {
			const original = await createImageWithExif(mimeType);
			expect((await sharp(original).metadata()).exif).toBeDefined();

			const sanitized = await sanitizeReviewImage(original, mimeType);
			const sanitizedMetadata = await sharp(sanitized).metadata();

			expect(matchesImageSignature(sanitized, mimeType)).toBe(true);
			expect(sanitizedMetadata.exif).toBeUndefined();
		}
	});

	it('uploadReviewImage maps missing optional and required images to expected results', async () => {
		await expect(
			uploadReviewImage(null, {
				required: false,
				writeFailureMessage: 'Kunde inte uppdatera recensionen'
			})
		).resolves.toEqual({ ok: true, upload: null });

		await expect(
			uploadReviewImage(null, {
				required: true,
				writeFailureMessage: 'Kunde inte ladda upp bilden'
			})
		).resolves.toMatchObject({
			ok: false,
			problem: { pointer: '/image', message: 'Ogiltig fil' }
		});
	});

	it('uploadReviewImage rejects unsupported image types before writing', async () => {
		const result = await uploadReviewImage(new File(['gif'], 'image.gif', { type: 'image/gif' }), {
			required: true,
			writeFailureMessage: 'Kunde inte ladda upp bilden'
		});

		expect(result).toMatchObject({
			ok: false,
			problem: {
				pointer: '/image',
				message: 'Ogiltig filtyp. Endast JPEG, PNG och WebP är tillåtna'
			}
		});
	});

	const unsupportedImages = [
		{
			format: 'SVG',
			mimeType: 'image/svg+xml',
			bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" /></svg>')
		},
		{
			format: 'HEIC',
			mimeType: 'image/heic',
			bytes: Buffer.from('000000186674797068656963000000006d69663168656963', 'hex')
		}
	];

	for (const { format, mimeType, bytes } of unsupportedImages) {
		it.each([mimeType, 'image/jpeg', 'image/png', 'image/webp'])(
			`rejects ${format} content advertised as %s without writing files`,
			async (advertisedMimeType) => {
				const directory = await mkdtemp(join(tmpdir(), 'review-image-rejection-'));
				try {
					const result = await uploadReviewImage(
						new File([bytes], 'upload', { type: advertisedMimeType }),
						{ required: true, writeFailureMessage: 'Kunde inte ladda upp bilden' },
						directory
					);
					expect(result).toMatchObject({
						ok: false,
						problem: {
							_tag: 'ReviewInvalid',
							pointer: '/image',
							message:
								advertisedMimeType === mimeType
									? 'Ogiltig filtyp. Endast JPEG, PNG och WebP är tillåtna'
									: 'Bildens innehåll matchar inte filtypen'
						}
					});
					expect(await readdir(directory)).toEqual([]);
				} finally {
					await rm(directory, { recursive: true, force: true });
				}
			}
		);
	}

	it('removes a written image when the surrounding write fails, and keeps it on success', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'review-image-scope-'));
		const images = ReviewImages.make(directory);
		const file = async () =>
			new File([await createImageWithExif('image/png')], 'bar.png', { type: 'image/png' });
		const options = { required: true, writeFailureMessage: 'Kunde inte ladda upp bilden' };
		try {
			const failed = await Effect.runPromiseExit(
				Effect.scoped(
					images.upload(await file(), options).pipe(Effect.andThen(Effect.fail('insert failed')))
				)
			);
			expect(Exit.isFailure(failed)).toBe(true);
			expect(await readdir(directory)).toEqual([]);

			const kept = await Effect.runPromise(Effect.scoped(images.upload(await file(), options)));
			expect(await readdir(directory)).toEqual([kept?.filename]);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
