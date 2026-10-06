import { describe, expect, it } from 'vitest';
import { toReviewFormData } from './review-input';
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
