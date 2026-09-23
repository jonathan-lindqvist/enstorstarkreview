import { describe, expect, it } from 'vitest';
import type { ReviewFormActionData } from '$lib/types/bar-review';
import { actionDataToReviewFormData } from './review-form';

describe('actionDataToReviewFormData', () => {
	it.each([{ authors: [] }, { authors: ['other-author'] }])(
		'restores the exact author selection $authors',
		({ authors }) => {
			expect(actionDataToReviewFormData({ barName: 'Focus Bar', authors })?.authors).toEqual(
				authors
			);
		}
	);

	it('restores submitted beer brand and price fields after failed form actions', () => {
		const form = {
			barName: 'Focus Bar',
			beerBrandSelection: '__other_beer__',
			customBeerBrand: 'Husets Lager',
			beerPriceKr: 79,
			isHappyHourPrice: true
		} satisfies ReviewFormActionData;

		expect(actionDataToReviewFormData(form)).toMatchObject({
			barName: 'Focus Bar',
			beerBrandSelection: '__other_beer__',
			customBeerBrand: 'Husets Lager',
			beerPriceKr: 79,
			isHappyHourPrice: true
		});
	});
});
