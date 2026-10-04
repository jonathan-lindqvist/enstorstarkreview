import { UNKNOWN_BEER_BRAND_LABEL } from '$lib/beer-brands';
import { buildReviewChangeLog } from '$lib/server/reviews/history';
import { describe, expect, it } from 'vitest';

import {
	buildValidPersistenceFields,
	createExistingReview
} from '$lib/server/reviews/test-fixtures';

describe('history', () => {
	it('buildReviewChangeLog omits unchanged fields and treats missing focus as default', () => {
		const existingReview = createExistingReview({
			imageFocusX: undefined,
			imageFocusY: undefined
		});
		const changeLog = buildReviewChangeLog(
			existingReview,
			buildValidPersistenceFields(),
			new Date('2026-01-03T00:00:00Z'),
			'editor'
		);

		expect(changeLog).toEqual([]);
	});

	it('buildReviewChangeLog records scalar, array, rating, and image changes', () => {
		const changeLog = buildReviewChangeLog(
			createExistingReview(),
			{
				...buildValidPersistenceFields({ 'bar-name': 'New Bar', atmosphere: '5' }),
				coAuthors: ['sara'],
				image: 'new.jpg'
			},
			new Date('2026-01-03T00:00:00Z'),
			'editor'
		);

		expect(changeLog).toHaveLength(1);
		expect(changeLog[0]).toMatchObject({
			updatedBy: 'editor',
			changes: expect.arrayContaining([
				{ field: 'title', label: 'Barens namn', before: 'Focus Bar', after: 'New Bar' },
				{ field: 'coAuthors', label: 'Medförfattare', before: 'Inga', after: 'sara' },
				{ field: 'atmosphere', label: 'Atmosfär', before: '1', after: '5' },
				{ field: 'image', label: 'Bild', before: 'old.jpg', after: 'new.jpg' }
			])
		});
	});

	it('buildReviewChangeLog records primary author changes', () => {
		const changeLog = buildReviewChangeLog(
			createExistingReview({ author: 'a' }),
			{
				...buildValidPersistenceFields(),
				author: 'c'
			},
			new Date('2026-01-03T00:00:00Z'),
			'c'
		);

		expect(changeLog).toHaveLength(1);
		expect(changeLog[0]).toMatchObject({
			updatedBy: 'c',
			changes: expect.arrayContaining([
				{ field: 'author', label: 'Författare', before: 'a', after: 'c' }
			])
		});
	});

	it('buildReviewChangeLog records beer price and happy hour changes', () => {
		const changeLog = buildReviewChangeLog(
			createExistingReview({ beerPriceKr: 79, isHappyHourPrice: false }),
			buildValidPersistenceFields({ 'beer-price': '89', 'happy-hour-price': 'on' }),
			new Date('2026-01-03T00:00:00Z'),
			'editor'
		);

		expect(changeLog).toHaveLength(1);
		expect(changeLog[0]).toMatchObject({
			updatedBy: 'editor',
			changes: expect.arrayContaining([
				{
					field: 'beerPriceKr',
					label: 'Pris för en stor stark',
					before: '79 kr',
					after: '89 kr'
				},
				{
					field: 'isHappyHourPrice',
					label: 'Happy hour',
					before: 'Nej',
					after: 'Ja'
				}
			])
		});
	});

	it('buildReviewChangeLog records beer changes including the legacy placeholder', () => {
		const changeLog = buildReviewChangeLog(
			createExistingReview({ beerBrand: undefined }),
			buildValidPersistenceFields({ 'beer-brand': 'Mariestads Export' }),
			new Date('2026-01-03T00:00:00Z'),
			'editor'
		);

		expect(changeLog).toHaveLength(1);
		expect(changeLog[0]).toMatchObject({
			updatedBy: 'editor',
			changes: expect.arrayContaining([
				{
					field: 'beerBrand',
					label: 'Öl för en stor stark',
					before: UNKNOWN_BEER_BRAND_LABEL,
					after: 'Mariestads Export'
				}
			])
		});
	});
});
