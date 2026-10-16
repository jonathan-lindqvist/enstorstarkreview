import { describe, expect, it } from 'vitest';
import {
	nextBeerBrandSort,
	sortBeerBrands,
	type BeerBrandSort,
	type SortableBeerBrand
} from './beer-brand-sort';

const row = (
	brand: string,
	averagePriceKr = 60,
	reviewCount = 1,
	averageClPerKr: number | null = 0.5
): SortableBeerBrand => ({ brand, averagePriceKr, reviewCount, averageClPerKr });

describe('beer brand sorting', () => {
	const brands = [row('Öl', 100, 2, null), row('Ånga', 60, 10, 2), row('Zebra', 9, 1, 0.5)];

	it.each<[BeerBrandSort, string[]]>([
		[{ column: 'brand', direction: 'asc' }, ['Zebra', 'Ånga', 'Öl']],
		[{ column: 'brand', direction: 'desc' }, ['Öl', 'Ånga', 'Zebra']],
		[{ column: 'averagePriceKr', direction: 'asc' }, ['Zebra', 'Ånga', 'Öl']],
		[{ column: 'averagePriceKr', direction: 'desc' }, ['Öl', 'Ånga', 'Zebra']],
		[{ column: 'reviewCount', direction: 'asc' }, ['Zebra', 'Öl', 'Ånga']],
		[{ column: 'reviewCount', direction: 'desc' }, ['Ånga', 'Öl', 'Zebra']],
		[{ column: 'averageClPerKr', direction: 'asc' }, ['Zebra', 'Ånga', 'Öl']],
		[{ column: 'averageClPerKr', direction: 'desc' }, ['Ånga', 'Zebra', 'Öl']]
	])('sorts %j', (sort, expected) => {
		expect(sortBeerBrands(brands, sort).map((entry) => entry.brand)).toEqual(expected);
	});

	it('uses Swedish order including Å, Ä and Ö', () => {
		expect(
			sortBeerBrands(
				['Öl', 'Älg', 'Ånga', 'Zebra'].map((brand) => row(brand)),
				{
					column: 'brand',
					direction: 'asc'
				}
			).map((entry) => entry.brand)
		).toEqual(['Zebra', 'Ånga', 'Älg', 'Öl']);
	});

	it.each(['averagePriceKr', 'reviewCount', 'averageClPerKr'] as const)(
		'breaks %s ties by ascending Swedish brand in both directions',
		(column) => {
			for (const direction of ['asc', 'desc'] as const) {
				expect(
					sortBeerBrands(
						['Öl', 'Älg', 'Ånga', 'Zebra'].map((brand) => row(brand)),
						{
							column,
							direction
						}
					).map((entry) => entry.brand)
				).toEqual(['Zebra', 'Ånga', 'Älg', 'Öl']);
			}
		}
	);

	it.each(['asc', 'desc'] as const)('keeps unknown values last when sorting %s', (direction) => {
		const result = sortBeerBrands(
			[row('Öl', 60, 1, null), row('Ånga', 60, 1, null), row('Zebra')],
			{ column: 'averageClPerKr', direction }
		);
		expect(result.map((entry) => entry.brand)).toEqual(['Zebra', 'Ånga', 'Öl']);
	});

	it('sorts unrounded prices and values even when their display values match', () => {
		const closeValues = [row('A', 60.04, 1, 0.504), row('Ö', 60.01, 1, 0.501)];
		for (const column of ['averagePriceKr', 'averageClPerKr'] as const) {
			expect(
				sortBeerBrands(closeValues, { column, direction: 'asc' }).map((entry) => entry.brand)
			).toEqual(['Ö', 'A']);
			expect(
				sortBeerBrands(closeValues, { column, direction: 'desc' }).map((entry) => entry.brand)
			).toEqual(['A', 'Ö']);
		}
	});

	it('returns a copy without changing input rows or extra sample counts', () => {
		const input = Object.freeze([
			Object.freeze({ ...row('Öl'), valueReviewCount: 2 }),
			Object.freeze({ ...row('Zebra'), valueReviewCount: 1 })
		]);
		const result = sortBeerBrands(input, { column: 'brand', direction: 'asc' });
		expect(result).not.toBe(input);
		expect(input.map((entry) => entry.brand)).toEqual(['Öl', 'Zebra']);
		expect(result).toEqual([input[1], input[0]]);
		expect(result[0]).toBe(input[1]);
	});

	it('handles empty and single-row input', () => {
		const sort = { column: 'averagePriceKr', direction: 'asc' } as const;
		expect(sortBeerBrands([], sort)).toEqual([]);
		const onlyRow = row('En öl');
		expect(sortBeerBrands([onlyRow], sort)).toEqual([onlyRow]);
	});

	it.each([
		['brand', 'asc'],
		['averagePriceKr', 'asc'],
		['reviewCount', 'desc'],
		['averageClPerKr', 'desc']
	] as const)('starts %s in %s order and reverses repeated selections', (column, direction) => {
		const current = {
			column: column === 'brand' ? 'reviewCount' : 'brand',
			direction: 'desc'
		} as const;
		const selected = nextBeerBrandSort(current, column);
		expect(selected).toEqual({ column, direction });
		const reversed = nextBeerBrandSort(selected, column);
		expect(reversed).toEqual({ column, direction: direction === 'asc' ? 'desc' : 'asc' });
		expect(nextBeerBrandSort(reversed, column)).toEqual(selected);
	});
});
