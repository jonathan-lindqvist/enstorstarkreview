import { describe, expect, it } from 'vitest';
import type { ReviewFormActionData } from '$lib/types/bar-review';
import { actionDataToReviewFormData } from './review-form';

describe('actionDataToReviewFormData', () => {
	it('restores submitted beer price fields after failed form actions', () => {
		const form = {
			barName: 'Focus Bar',
			beerPriceKr: 79,
			isHappyHourPrice: true
		} satisfies ReviewFormActionData;

		expect(actionDataToReviewFormData(form)).toMatchObject({
			barName: 'Focus Bar',
			beerPriceKr: 79,
			isHappyHourPrice: true
		});
	});
});
