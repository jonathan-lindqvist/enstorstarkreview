import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import {
	createReviewImagePreviewReader,
	ReviewImagePreviewCapacityError
} from './review-image-previews';

const filename = '6a1e9d487d43112acf4a0c36.jpg';
let directory: string;

beforeEach(async () => {
	directory = await mkdtemp(join(tmpdir(), 'review-image-previews-'));
});

afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

describe('review image previews', () => {
	it('reduces photo bytes, preserves aspect ratio, and strips metadata', async () => {
		const original = await sharp('src/lib/images/image.png')
			.resize(1920, 1280, { fit: 'fill' })
			.withExif({ IFD0: { Artist: 'private-metadata' } })
			.jpeg({ quality: 95 })
			.toBuffer();
		await writeFile(join(directory, filename), original);
		const read = createReviewImagePreviewReader({ directory: () => directory });
		for (const [preset, width] of [
			['card-v1', 768],
			['detail-v1', 1280]
		] as const) {
			const bytes = await read(filename, preset);
			const metadata = await sharp(bytes).metadata();
			expect(metadata).toMatchObject({ format: 'webp', width });
			expect(metadata.width! / metadata.height!).toBeCloseTo(1.5, 2);
			expect(metadata.exif).toBeUndefined();
			expect(bytes.length).toBeLessThan(original.length / 2);
		}
		expect(await readFile(join(directory, filename))).toEqual(original);
	});

	it('does not enlarge small originals', async () => {
		await writeFile(
			join(directory, filename),
			await sharp('src/lib/images/image.png').jpeg().toBuffer()
		);
		const read = createReviewImagePreviewReader({ directory: () => directory });
		expect((await sharp(await read(filename, 'detail-v1')).metadata()).width).toBe(450);
	});

	it('shares pending generation and reuses the disk cache across readers', async () => {
		let finish!: (bytes: Uint8Array) => void;
		const generate = vi.fn(() => new Promise<Uint8Array>((resolve) => (finish = resolve)));
		const read = createReviewImagePreviewReader({ directory: () => directory, generate });
		const first = read(filename, 'card-v1');
		const second = read(filename, 'card-v1');
		await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
		finish(new Uint8Array([1, 2, 3]));
		expect(await Promise.all([first, second])).toEqual([
			new Uint8Array([1, 2, 3]),
			new Uint8Array([1, 2, 3])
		]);
		const next = createReviewImagePreviewReader({ directory: () => directory, generate });
		expect([...(await next(filename, 'card-v1'))]).toEqual([1, 2, 3]);
		expect(generate).toHaveBeenCalledTimes(1);
		expect(
			(await readdir(join(directory, 'previews', 'v1'))).some((name) => name.endsWith('.tmp'))
		).toBe(false);
	});

	it('recovers after failed generation without caching the failure', async () => {
		const generate = vi
			.fn()
			.mockRejectedValueOnce(new Error('decoder offline'))
			.mockResolvedValue(new Uint8Array([1]));
		const read = createReviewImagePreviewReader({ directory: () => directory, generate });
		await expect(read(filename, 'card-v1')).rejects.toThrow('decoder offline');
		await expect(read(filename, 'card-v1')).resolves.toEqual(new Uint8Array([1]));
		expect(generate).toHaveBeenCalledTimes(2);
	});

	it('removes partial files after storage failure and permits a retry', async () => {
		const target = join(directory, 'previews', 'v1', `${filename}.card-v1.webp`);
		const generate = vi
			.fn()
			.mockImplementationOnce(async () => {
				await mkdir(target, { recursive: true });
				return new Uint8Array([1]);
			})
			.mockResolvedValue(new Uint8Array([1]));
		const read = createReviewImagePreviewReader({ directory: () => directory, generate });
		await expect(read(filename, 'card-v1')).rejects.toThrow();
		expect(await readdir(join(directory, 'previews', 'v1'))).toEqual([`${filename}.card-v1.webp`]);
		await rm(target, { recursive: true });
		await expect(read(filename, 'card-v1')).resolves.toEqual(new Uint8Array([1]));
	});

	it('supports the accepted decoded-pixel boundary', async () => {
		await sharp({ create: { width: 8000, height: 8000, channels: 3, background: 'red' } })
			.jpeg()
			.toFile(join(directory, filename));
		const read = createReviewImagePreviewReader({ directory: () => directory });
		expect((await sharp(await read(filename, 'card-v1')).metadata()).width).toBe(768);
	});

	it('limits expensive work to two active and sixteen waiting generations', async () => {
		const finishers: Array<(bytes: Uint8Array) => void> = [];
		const generate = vi.fn(() => new Promise<Uint8Array>((resolve) => finishers.push(resolve)));
		const read = createReviewImagePreviewReader({ directory: () => directory, generate });
		const errors: unknown[] = [];
		const requests = Array.from({ length: 19 }, (_, index) =>
			read(`${index.toString(16).padStart(24, '0')}.png`, 'card-v1').catch((err) => {
				errors.push(err);
				return null;
			})
		);
		await vi.waitFor(() => expect(errors).toHaveLength(1));
		expect(errors[0]).toBeInstanceOf(ReviewImagePreviewCapacityError);
		expect(generate).toHaveBeenCalledTimes(2);
		for (let batch = 0; batch < 9; batch += 1) {
			await vi.waitFor(() => expect(finishers).toHaveLength(2));
			for (const finish of finishers.splice(0)) finish(new Uint8Array([1]));
		}
		await Promise.all(requests);
		expect(generate).toHaveBeenCalledTimes(18);
	});

	it('rejects images above the decoded pixel limit before writing a preview', async () => {
		const original = await sharp({
			create: { width: 2, height: 2, channels: 3, background: 'red' }
		})
			.jpeg()
			.toBuffer();
		const frame = original.indexOf(Buffer.from([0xff, 0xc0]));
		expect(frame).toBeGreaterThan(0);
		original.writeUInt16BE(8001, frame + 5);
		original.writeUInt16BE(8001, frame + 7);
		await writeFile(join(directory, filename), original);
		const read = createReviewImagePreviewReader({ directory: () => directory });
		await expect(read(filename, 'card-v1')).rejects.toThrow(/pixel limit/i);
		expect(await readdir(directory)).toEqual([filename]);
	});
});
