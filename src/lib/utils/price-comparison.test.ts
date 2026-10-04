import { describe, expect, it } from 'vitest';
import { fitValueTrend, predictValueRating, toPriceComparisonPoint } from './price-comparison';
import type { PriceComparisonPoint } from '$lib/types/price-comparison';

const point = (beerPriceKr: number, valueRating: number | null): PriceComparisonPoint => ({
	title: `Bar ${beerPriceKr}`,
	slug: `bar-${beerPriceKr}`,
	beerPriceKr,
	isHappyHourPrice: false,
	valueRating
});

describe('price comparison', () => {
	it('maps stored reviews and drops invalid prices', () => {
		expect(
			toPriceComparisonPoint({
				title: 'Bar',
				slug: 'bar',
				beerPriceKr: 65,
				isHappyHourPrice: true,
				price: 4
			})
		).toEqual({
			title: 'Bar',
			slug: 'bar',
			beerPriceKr: 65,
			isHappyHourPrice: true,
			valueRating: 4
		});
		expect(toPriceComparisonPoint({ title: 'Bar', slug: 'bar', beerPriceKr: 0 })).toBeNull();
		expect(toPriceComparisonPoint({ title: 'Bar', slug: 'bar', beerPriceKr: 65.5 })).toBeNull();
		expect(toPriceComparisonPoint({ slug: 'bar', beerPriceKr: 65 })).toBeNull();
		expect(
			toPriceComparisonPoint({ title: 'Bar', slug: 'bar', beerPriceKr: 65, price: 9 })
		).toMatchObject({ valueRating: null, isHappyHourPrice: false });
	});

	it('fits and clamps a value-rating trend', () => {
		const trend = fitValueTrend([point(50, 5), point(70, 3), point(90, 1), point(60, null)]);
		expect(trend?.slope).toBeCloseTo(-0.1);
		expect(predictValueRating(trend!, 70)).toBeCloseTo(3);
		expect(predictValueRating(trend!, 200)).toBe(0);
		expect(predictValueRating(trend!, 1)).toBe(5);
		expect(fitValueTrend([point(50, 5), point(70, 3)])).toBeNull();
		expect(fitValueTrend([point(70, 5), point(70, 3), point(70, 1)])).toBeNull();
	});
});
