import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { REVIEW_IMAGE_PREVIEW_WIDTHS } from '#lib/review-image-previews.js';
import type { ReviewImagePreview } from '#lib/types/review-image.js';
import { getReviewImageDirectory } from './review-images';

const MAX_GENERATIONS = 2;
const MAX_WAITING_GENERATIONS = 16;
const MAX_INPUT_PIXELS = 64_000_000;

export class ReviewImagePreviewCapacityError extends Error {
	constructor() {
		super('Image preview generation is busy');
	}
}

const generatePreview = async (path: string, width: number): Promise<Uint8Array> => {
	const { default: sharp } = await import('sharp');
	return sharp(path, { limitInputPixels: MAX_INPUT_PIXELS })
		.rotate()
		.resize({ width, withoutEnlargement: true })
		.webp({ quality: 80 })
		.toBuffer();
};

interface PreviewReaderOptions {
	directory?: () => string;
	generate?: typeof generatePreview;
}

/** Disk stores completed previews; only admitted, pending work stays in memory. */
export const createReviewImagePreviewReader = ({
	directory = getReviewImageDirectory,
	generate = generatePreview
}: PreviewReaderOptions = {}) => {
	const pending = new Map<string, Promise<Uint8Array>>();
	const waiting: Array<() => void> = [];
	let active = 0;

	const acquire = (): Promise<void> => {
		if (active < MAX_GENERATIONS) {
			active += 1;
			return Promise.resolve();
		}
		if (waiting.length >= MAX_WAITING_GENERATIONS) {
			return Promise.reject(new ReviewImagePreviewCapacityError());
		}
		return new Promise((resolve) => waiting.push(resolve));
	};

	const release = () => {
		const next = waiting.shift();
		if (next) next();
		else active -= 1;
	};

	return async (filename: string, preview: ReviewImagePreview): Promise<Uint8Array> => {
		const root = directory();
		const path = join(root, 'previews', 'v1', `${filename}.${preview}.webp`);
		try {
			return await readFile(path);
		} catch (err) {
			if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) throw err;
		}
		const existing = pending.get(path);
		if (existing) return existing;

		const work = async () => {
			await acquire();
			const temporary = `${path}.${randomUUID()}.tmp`;
			try {
				const bytes = await generate(join(root, filename), REVIEW_IMAGE_PREVIEW_WIDTHS[preview]);
				await mkdir(dirname(path), { recursive: true });
				await writeFile(temporary, bytes, { flag: 'wx' });
				await rename(temporary, path);
				return bytes;
			} finally {
				await unlink(temporary).catch(() => undefined);
				release();
			}
		};
		const promise = work().finally(() => pending.delete(path));
		pending.set(path, promise);
		return promise;
	};
};

export const readReviewImagePreview = createReviewImagePreviewReader();
