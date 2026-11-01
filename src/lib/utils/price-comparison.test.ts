import { describe, expect, it } from 'vitest';
import { toPriceComparisonPoint } from './price-comparison';

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
});
