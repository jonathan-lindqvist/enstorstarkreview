import { describe, expect, it } from 'vitest';
import { API_IMAGE_MAX_BYTES, toReviewFormData } from './review-input';
import type { ApiSchemas } from './openapi';

const input: ApiSchemas['ReviewUpdateRequest'] = {
	title: 'Baren',
	description: 'Text',
	location: 'Gatan 1',
	ratings: {
		atmosphere: 4,
		service: 4,
		selection: 3,
		quality: 5,
		price: 3,
		cleanliness: 4,
		soundLevel: 2,
		barhopPotential: 5
	},
	beer: { brand: 'Falcon Export', priceKr: 59, isHappyHourPrice: false },
	authors: ['editor'],
	imageFocus: { x: 50, y: 50 }
};

const attributesOf = (
	body: ApiSchemas['ReviewUpdateRequest'],
	options?: Parameters<typeof toReviewFormData>[1]
) => {
	const result = toReviewFormData(body, options);
	if (!result.ok) throw new Error('Expected form data');
	return result.data.getAll('attributes');
};

describe('toReviewFormData attributes', () => {
	it('sends the requested attributes', () => {
		expect(attributesOf({ ...input, attributes: ['quiz', 'darts'] })).toEqual(['quiz', 'darts']);
	});

	it('gives a new review no attributes when they are omitted', () => {
		expect(attributesOf(input)).toEqual([]);
	});

	it('keeps the current attributes when an edit omits them', () => {
		expect(attributesOf(input, { currentAttributes: ['karaoke'] })).toEqual(['karaoke']);
	});

	it('removes all attributes when an edit sends an empty array', () => {
		expect(attributesOf({ ...input, attributes: [] }, { currentAttributes: ['karaoke'] })).toEqual(
			[]
		);
	});
});

describe('API image decoding', () => {
	it.each([4 * 1024 * 1024, API_IMAGE_MAX_BYTES])(
		'decodes %i bytes without overflowing the regex stack',
		async (size) => {
			const bytes = Buffer.alloc(size, 0xab);
			const result = toReviewFormData({
				...input,
				image: { contentType: 'image/png', data: bytes.toString('base64') }
			});
			if (!result.ok) throw new Error('Expected a decoded file');
			const file = result.data.get('image') as File;
			expect(file.size).toBe(size);
			expect(file.type).toBe('image/png');
			expect(Buffer.from(await file.arrayBuffer()).equals(bytes)).toBe(true);
		}
	);

	it.each(['', 'a', 'abc', 'a===', 'ab=c', '!!!!', 'YWJj\n', 'äaaa', 'YWJj===='])(
		'rejects malformed base64 %j',
		async (data) => {
			const result = toReviewFormData({ ...input, image: { contentType: 'image/png', data } });
			if (result.ok) throw new Error('Expected rejection');
			expect(result.response.status).toBe(422);
			expect(await result.response.json()).toMatchObject({
				code: 'validation_failed',
				errors: [{ pointer: '/image/data' }]
			});
		}
	);

	it.each(['YQ==', 'YWI=', 'YWJj', 'YWJjZA=='])('accepts valid padding for %s', (data) => {
		const result = toReviewFormData({ ...input, image: { contentType: 'image/png', data } });
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('Expected a decoded file');
		expect((result.data.get('image') as File).size).toBe(Buffer.from(data, 'base64').length);
	});

	it('rejects a decoded image above the limit', async () => {
		const result = toReviewFormData({
			...input,
			image: {
				contentType: 'image/png',
				data: Buffer.alloc(API_IMAGE_MAX_BYTES + 1).toString('base64')
			}
		});
		if (result.ok) throw new Error('Expected rejection');
		expect(result.response.status).toBe(413);
		expect(await result.response.json()).toMatchObject({ code: 'payload_too_large' });
	});
});
