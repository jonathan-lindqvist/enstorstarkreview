import { describe, expect, it } from 'vitest';
import { API_IMAGE_MAX_BYTES, toReviewFormData } from './review-input';
import { isProcedureError } from './errors';
import type { ApiSchemas } from './schemas';

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
	return toReviewFormData(body, options).getAll('attributes');
};

const rejection = (convert: () => unknown) => {
	try {
		convert();
	} catch (error) {
		if (isProcedureError(error)) return error;
		throw error;
	}
	throw new Error('Expected rejection');
};

describe('toReviewFormData attributes', () => {
	it('maps explicit, omitted and cleared serving sizes without erasing an older client edit', () => {
		for (const [volume, expected] of [
			[50, '50'],
			[null, ''],
			[undefined, '40']
		] as const) {
			const result = toReviewFormData(
				{
					...input,
					beer: { ...input.beer, ...(volume !== undefined ? { volumeCl: volume } : {}) }
				},
				{ currentBeerVolumeCl: 40 }
			);
			expect(result.get('beer-volume')).toBe(expected);
		}
	});
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
			const file = result.get('image') as File;
			expect(file.size).toBe(size);
			expect(file.type).toBe('image/png');
			expect(Buffer.from(await file.arrayBuffer()).equals(bytes)).toBe(true);
		}
	);

	it.each(['', 'a', 'abc', 'a===', 'ab=c', '!!!!', 'YWJj\n', 'äaaa', 'YWJj===='])(
		'rejects malformed base64 %j',
		(data) => {
			const error = rejection(() =>
				toReviewFormData({ ...input, image: { contentType: 'image/png', data } })
			);
			expect(error.status).toBe(422);
			expect(error.code).toBe('validation_failed');
			expect(error.data?.errors).toEqual([expect.objectContaining({ pointer: '/image/data' })]);
		}
	);

	it.each(['YQ==', 'YWI=', 'YWJj', 'YWJjZA=='])('accepts valid padding for %s', (data) => {
		const result = toReviewFormData({ ...input, image: { contentType: 'image/png', data } });
		expect((result.get('image') as File).size).toBe(Buffer.from(data, 'base64').length);
	});

	it('rejects a decoded image above the limit', () => {
		const error = rejection(() =>
			toReviewFormData({
				...input,
				image: {
					contentType: 'image/png',
					data: Buffer.alloc(API_IMAGE_MAX_BYTES + 1).toString('base64')
				}
			})
		);
		expect(error.status).toBe(413);
		expect(error.code).toBe('payload_too_large');
	});
});
