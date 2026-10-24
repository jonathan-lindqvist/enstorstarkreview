import { describe, expect, it, vi } from 'vitest';
import type { BarReview } from '#lib/types/bar-review.js';
import { readReviewImage } from './review-image-response';
import { ReviewImagePreviewCapacityError } from './review-image-previews';

const filename = '6a1e9d487d43112acf4a0c36.png';
const publicReview = { publicationStatus: 'published' } as BarReview;

const dependencies = (review: BarReview | null = publicReview) => ({
	findReview: vi.fn().mockResolvedValue(review),
	readImage: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
	readPreview: vi.fn().mockResolvedValue(new Uint8Array([4, 5]))
});

describe('review image responses', () => {
	it.each(['../secret.png', 'arbitrary.png', undefined])(
		'rejects filename %j before any protected work',
		async (invalid) => {
			const deps = dependencies();
			expect(await readReviewImage(invalid, true, deps, 'card-v1')).toEqual({
				ok: false,
				status: 404
			});
			expect(deps.findReview).not.toHaveBeenCalled();
			expect(deps.readPreview).not.toHaveBeenCalled();
		}
	);

	it('returns service unavailable when generation capacity is exhausted', async () => {
		const deps = dependencies();
		deps.readPreview.mockRejectedValue(new ReviewImagePreviewCapacityError());
		expect(await readReviewImage(filename, false, deps, 'card-v1')).toEqual({
			ok: false,
			status: 503
		});
	});

	it('reports a missing source without returning cached success headers', async () => {
		const deps = dependencies();
		deps.readPreview.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
		expect(await readReviewImage(filename, false, deps, 'card-v1')).toEqual({
			ok: false,
			status: 404
		});
	});

	it('denies image work when authorization lookup fails', async () => {
		const deps = dependencies();
		deps.findReview.mockRejectedValue(new Error('database unavailable'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			expect(await readReviewImage(filename, true, deps, 'card-v1')).toEqual({
				ok: false,
				status: 500
			});
			expect(deps.readPreview).not.toHaveBeenCalled();
			expect(deps.readImage).not.toHaveBeenCalled();
		} finally {
			log.mockRestore();
		}
	});
	it('serves a compressed preview after authorizing the referencing review', async () => {
		const deps = dependencies();
		const result = await readReviewImage(filename, false, deps, 'card-v1');
		expect(result).toMatchObject({
			ok: true,
			contentType: 'image/webp',
			cacheControl: 'public, max-age=31536000, immutable'
		});
		if (result.ok) expect(new Uint8Array(result.body)).toEqual(new Uint8Array([4, 5]));
		expect(deps.readImage).not.toHaveBeenCalled();
		expect(deps.readPreview).toHaveBeenCalledWith(filename, 'card-v1');
		expect(deps.findReview.mock.invocationCallOrder[0]).toBeLessThan(
			deps.readPreview.mock.invocationCallOrder[0]
		);
	});

	it.each(['', 'original', 'card', '1280', '../card-v1'])(
		'rejects invalid preview %j before work',
		async (preview) => {
			const deps = dependencies();
			expect(await readReviewImage(filename, true, deps, preview)).toEqual({
				ok: false,
				status: 400
			});
			expect(deps.findReview).not.toHaveBeenCalled();
			expect(deps.readPreview).not.toHaveBeenCalled();
			expect(deps.readImage).not.toHaveBeenCalled();
		}
	);

	it('does not access cached previews or originals for an unauthorized image', async () => {
		const deps = dependencies(null);
		expect(await readReviewImage(filename, false, deps, 'detail-v1')).toEqual({
			ok: false,
			status: 404
		});
		expect(deps.readImage).not.toHaveBeenCalled();
		expect(deps.readPreview).not.toHaveBeenCalled();
	});

	it('keeps authenticated draft previews private', async () => {
		const result = await readReviewImage(
			filename,
			true,
			dependencies({ publicationStatus: 'draft' } as BarReview),
			'detail-v1'
		);
		expect(result).toMatchObject({
			ok: true,
			contentType: 'image/webp',
			cacheControl: 'private, no-store'
		});
	});

	it('never marks an authenticated unknown-status image as publicly cacheable', async () => {
		const deps = dependencies({ publicationStatus: 'unknown' } as unknown as BarReview);
		const result = await readReviewImage(filename, true, deps, 'card-v1');
		expect(result).toMatchObject({ ok: true, cacheControl: 'private, no-store' });
	});

	it('keeps original downloads unchanged', async () => {
		const deps = dependencies();
		const result = await readReviewImage(filename, false, deps);
		expect(result).toMatchObject({ ok: true, contentType: 'image/png' });
		if (result.ok) expect(new Uint8Array(result.body)).toEqual(new Uint8Array([1, 2, 3]));
		expect(deps.readPreview).not.toHaveBeenCalled();
	});
});
