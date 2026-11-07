import { describe, expect, it } from 'vitest';
import type { PublicReviewStatistics } from '$lib/types/review-statistics';
import { toApiStatistics } from './statistics';

const statistics: PublicReviewStatistics = {
	totalReviews: 3,
	gothenburgReviews: 3,
	averageRating: 1,
	priceReviewCount: 2,
	averageBeerPrice: 70,
	totalReviewerSpendKr: 210,
	happyHourReviewCount: 1,
	happyHourPercentage: 33.3,
	cheapestBars: [],
	mostExpensiveBars: [],
	beerBrandPrices: [],
	valueReviewCount: 1,
	averageClPerKr: 0.6,
	bestValueBars: [],
	worstValueBars: [],
	beerBrandValues: [],
	priceComparison: [
		{
			title: 'Baren',
			slug: 'baren',
			beerPriceKr: 70,
			beerVolumeCl: 50,
			isHappyHourPrice: false,
			valueRating: 4
		},
		{ title: 'Puben', slug: 'puben', beerPriceKr: 80, isHappyHourPrice: false, valueRating: null },
		{
			title: 'Krogen',
			slug: 'krogen',
			beerPriceKr: 45,
			beerVolumeCl: null,
			isHappyHourPrice: true,
			valueRating: 5
		}
	]
};

describe('toApiStatistics', () => {
	it('includes every price comparison point, happy hour too, with a null unknown volume', () => {
		expect(toApiStatistics(statistics).priceComparison).toEqual([
			{
				title: 'Baren',
				slug: 'baren',
				beerPriceKr: 70,
				beerVolumeCl: 50,
				isHappyHourPrice: false,
				valueRating: 4
			},
			{
				title: 'Puben',
				slug: 'puben',
				beerPriceKr: 80,
				beerVolumeCl: null,
				isHappyHourPrice: false,
				valueRating: null
			},
			{
				title: 'Krogen',
				slug: 'krogen',
				beerPriceKr: 45,
				beerVolumeCl: null,
				isHappyHourPrice: true,
				valueRating: 5
			}
		]);
	});

	it('keeps the other statistics unchanged', () => {
		const { priceComparison: _points, ...rest } = toApiStatistics(statistics);
		const { priceComparison: _source, ...expected } = statistics;
		expect(rest).toEqual(expected);
	});
});
