import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_REVIEW_FILTER, ACTIVE_REVIEW_FILTER } from '$lib/server/review-publication';
import { ReviewImagePreviewCapacityError } from '$lib/server/review-image-previews';

const mocks = vi.hoisted(() => ({ findOne: vi.fn(), readFile: vi.fn(), preview: vi.fn() }));
vi.mock('$lib/db/bars', () => ({ bars: { findOne: mocks.findOne } }));
vi.mock('fs/promises', () => ({ readFile: mocks.readFile }));
vi.mock('$lib/server/review-image-previews', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/review-image-previews')>()),
	readReviewImagePreview: mocks.preview
}));

import { GET } from './+server';

const filename = '0123456789abcdef01234567.jpg';
const eventFor = (query = '', authenticated = false) =>
	({
		request: new Request(`http://localhost/api/v1/images/${filename}${query}`),
		url: new URL(`http://localhost/api/v1/images/${filename}${query}`),
		params: { filename },
		locals: { user: authenticated ? { username: 'editor' } : null }
	}) as unknown as Parameters<typeof GET>[0];

describe('API image responses', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.findOne.mockResolvedValue({ publicationStatus: 'published' });
		mocks.readFile.mockResolvedValue(new Uint8Array([1, 2, 3]));
		mocks.preview.mockResolvedValue(new Uint8Array([4, 5]));
	});

	it.each([false, true])(
		'authorizes original image reads (authenticated: %s)',
		async (authenticated) => {
			mocks.findOne.mockResolvedValue(authenticated ? { publicationStatus: 'draft' } : {});
			const response = await GET(eventFor('', authenticated));
			expect(response.status).toBe(200);
			expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
			expect(response.headers.get('content-type')).toBe('image/jpeg');
			expect(response.headers.get('vary')).toBe('Authorization');
			expect(response.headers.get('cache-control')).toBe(
				authenticated ? 'private, no-store' : 'public, max-age=31536000, immutable'
			);
			expect(mocks.findOne).toHaveBeenCalledWith(
				{
					$and: [{ image: filename }, authenticated ? ACTIVE_REVIEW_FILTER : PUBLIC_REVIEW_FILTER]
				},
				{ projection: { publicationStatus: 1, _id: 0 } }
			);
			expect(mocks.preview).not.toHaveBeenCalled();
		}
	);

	it('returns a WebP preview without reading the original', async () => {
		const response = await GET(eventFor('?preview=card-v1'));
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/webp');
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([4, 5]));
		expect(mocks.preview).toHaveBeenCalledWith(filename, 'card-v1');
		expect(mocks.readFile).not.toHaveBeenCalled();
	});

	it.each(['?preview=invalid', '?preview=card-v1&preview=card-v1'])(
		'rejects invalid preview parameters before protected work: %s',
		async (query) => {
			const response = await GET(eventFor(query));
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ code: 'bad_request' });
			expect(mocks.findOne).not.toHaveBeenCalled();
			expect(mocks.readFile).not.toHaveBeenCalled();
			expect(mocks.preview).not.toHaveBeenCalled();
		}
	);

	it('hides inaccessible images without reading files', async () => {
		mocks.findOne.mockResolvedValue(null);
		const response = await GET(eventFor());
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ code: 'not_found' });
		expect(mocks.readFile).not.toHaveBeenCalled();
	});

	it('returns retry guidance when preview capacity is exhausted', async () => {
		mocks.preview.mockRejectedValue(new ReviewImagePreviewCapacityError());
		const response = await GET(eventFor('?preview=card-v1'));
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ code: 'service_unavailable' });
		expect(response.headers.get('retry-after')).toBe('1');
		expect(response.headers.get('cache-control')).toBe('no-store');
	});

	it('returns a safe problem when image storage fails', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			mocks.readFile.mockRejectedValue(new Error('storage failure'));
			const response = await GET(eventFor());
			expect(response.status).toBe(500);
			expect(await response.json()).toMatchObject({ code: 'internal_error' });
		} finally {
			log.mockRestore();
		}
	});
});
