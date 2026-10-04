import { buildReviewFormData } from '$lib/server/reviews/form';
import { buildReviewPersistenceFields } from '$lib/server/reviews/persistence';
import { describe, expect, it } from 'vitest';

import { createValidReviewForm } from '$lib/server/reviews/test-fixtures';

describe('persistence', () => {
	it('persists selected attributes and an explicit empty selection', () => {
		const data = createValidReviewForm();
		data.append('attributes', 'quiz');
		data.append('attributes', 'darts');
		expect(buildReviewPersistenceFields(buildReviewFormData(data), 'current').attributes).toEqual([
			'quiz',
			'darts'
		]);
		data.delete('attributes');
		expect(buildReviewPersistenceFields(buildReviewFormData(data), 'current').attributes).toEqual(
			[]
		);
	});

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
