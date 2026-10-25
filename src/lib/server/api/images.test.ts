import { describe, expect, it, vi } from 'vitest';
import type { BarReview } from '$lib/types/bar-review';
import { ReviewImagePreviewCapacityError } from '$lib/server/review-image-previews';
import { reviewImageResponse } from './images';

const filename = '6a1e9d487d43112acf4a0c36.png';
const publicReview = { publicationStatus: 'published' } as BarReview;

const dependencies = (review: BarReview | null = publicReview) => ({
	findReview: vi.fn().mockResolvedValue(review),
	readImage: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
	readPreview: vi.fn().mockResolvedValue(new Uint8Array([4, 5]))
});

const expectProblem = async (response: Response, status: number, code: string) => {
	expect(response.status).toBe(status);
	expect(response.headers.get('content-type')).toBe('application/problem+json');
	expect(response.headers.get('cache-control')).toBe('no-store');
	expect(await response.json()).toMatchObject({ status, code });
};

describe('reviewImageResponse', () => {
	it('serves the original image with its cache policy and an authorization vary', async () => {
		const response = await reviewImageResponse(filename, false, [], dependencies());

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
		expect(response.headers.get('vary')).toBe('Authorization');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
	});

	it('serves a requested preview as WebP without reading the original', async () => {
		const deps = dependencies();
		const response = await reviewImageResponse(filename, false, ['card-v1'], deps);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/webp');
		expect(deps.readPreview).toHaveBeenCalledWith(filename, 'card-v1');
		expect(deps.readImage).not.toHaveBeenCalled();
	});

	it('keeps an authenticated draft image private', async () => {
		const deps = dependencies({ publicationStatus: 'draft' } as BarReview);
		const response = await reviewImageResponse(filename, true, [], deps);

		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it('rejects repeated previews before any protected work', async () => {
		const deps = dependencies();
		const response = await reviewImageResponse(filename, true, ['card-v1', 'detail-v1'], deps);

		await expectProblem(response, 400, 'bad_request');
		expect(deps.findReview).not.toHaveBeenCalled();
		expect(deps.readPreview).not.toHaveBeenCalled();
	});

	it('rejects an unknown preview before any protected work', async () => {
		const deps = dependencies();
		const response = await reviewImageResponse(filename, true, ['huge'], deps);

		await expectProblem(response, 400, 'bad_request');
		expect(deps.findReview).not.toHaveBeenCalled();
	});

	it('hides an unknown or unauthorized image as not found', async () => {
		const deps = dependencies(null);
		const response = await reviewImageResponse(filename, false, ['card-v1'], deps);

		await expectProblem(response, 404, 'not_found');
		expect(deps.readPreview).not.toHaveBeenCalled();
	});

	it('asks the client to retry when preview capacity is exhausted', async () => {
		const deps = dependencies();
		deps.readPreview.mockRejectedValue(new ReviewImagePreviewCapacityError());
		const response = await reviewImageResponse(filename, false, ['card-v1'], deps);

		await expectProblem(response, 503, 'service_unavailable');
		expect(response.headers.get('retry-after')).toBe('1');
	});

	it('reports a failed authorization lookup as an internal error', async () => {
		const deps = dependencies();
		deps.findReview.mockRejectedValue(new Error('database unavailable'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			const response = await reviewImageResponse(filename, true, [], deps);

			await expectProblem(response, 500, 'internal_error');
			expect(deps.readImage).not.toHaveBeenCalled();
		} finally {
			log.mockRestore();
		}
	});
});
