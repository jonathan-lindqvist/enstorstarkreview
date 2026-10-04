import { buildReviewFormData } from '$lib/server/reviews/form';
import { buildReviewPersistenceFields } from '$lib/server/reviews/persistence';
import { describe, expect, it } from 'vitest';

import { createValidReviewForm } from '$lib/server/reviews/test-fixtures';

describe('persistence', () => {
	it('buildReviewPersistenceFields includes beer brand and price fields', () => {
		const fields = buildReviewPersistenceFields(
			buildReviewFormData(createValidReviewForm({ 'beer-price': '89', 'happy-hour-price': 'on' })),
			'current'
		);

		expect(fields).toMatchObject({
			beerBrand: 'Falcon Export',
			beerPriceKr: 89,
			isHappyHourPrice: true
		});
	});
});
