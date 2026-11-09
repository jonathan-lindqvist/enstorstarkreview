import { describe, expect, it } from 'vitest';
import { createExistingReview } from '$lib/server/reviews/test-fixtures';
import { buildReviewNotification } from './message';

describe('review notification text', () => {
	it('names the bar and gives the stamps and the price', () => {
		const review = createExistingReview({
			title: 'Bar Himmel',
			slug: 'bar-himmel',
			rating: 2,
			beerPriceKr: 69,
			isHappyHourPrice: false
		});
		expect(buildReviewNotification(review)).toEqual({
			title: 'Ny recension: Bar Himmel',
			body: 'Två stämplar · Stor stark för 69 kr',
			slug: 'bar-himmel'
		});
	});

	it.each([
		[0, 'Ingen stämpel'],
		[1, 'En stämpel'],
		[3, 'Tre stämplar']
	])('words a rating of %i as "%s"', (rating, words) => {
		const review = createExistingReview({ rating, beerPriceKr: undefined });
		expect(buildReviewNotification(review).body).toBe(words);
	});

	it('marks a happy-hour price', () => {
		const review = createExistingReview({ rating: 1, beerPriceKr: 45, isHappyHourPrice: true });
		expect(buildReviewNotification(review).body).toBe(
			'En stämpel · Stor stark för 45 kr (happy hour)'
		);
	});

	it('leaves out malformed stored values and still says something', () => {
		const review = createExistingReview({ rating: 7, beerPriceKr: 12.5 });
		expect(buildReviewNotification(review).body).toBe('Läs vad vi tyckte.');
	});

	it('shortens a very long bar name and collapses whitespace', () => {
		const review = createExistingReview({ title: `  Baren\n${'x'.repeat(200)}  ` });
		const { title } = buildReviewNotification(review);
		expect(title.startsWith('Ny recension: Baren x')).toBe(true);
		expect(title.endsWith('…')).toBe(true);
		expect(title.length).toBeLessThanOrEqual(100);
	});
});
