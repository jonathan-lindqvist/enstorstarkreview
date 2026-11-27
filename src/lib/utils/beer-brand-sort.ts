export interface SortableBeerBrand {
	brand: string;
	averagePriceKr: number;
	reviewCount: number;
	averageKrPerCl: number | null;
}

export type BeerBrandSortColumn = keyof SortableBeerBrand;

export interface BeerBrandSort {
	column: BeerBrandSortColumn;
	direction: 'asc' | 'desc';
}

export const nextBeerBrandSort = (
	current: BeerBrandSort,
	column: BeerBrandSortColumn
): BeerBrandSort => {
	if (current.column === column) {
		return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
	}
	return { column, direction: column === 'reviewCount' ? 'desc' : 'asc' };
};

export const sortBeerBrands = <T extends SortableBeerBrand>(
	brands: readonly T[],
	{ column, direction }: BeerBrandSort
): T[] =>
	[...brands].sort((first, second) => {
		const brandOrder = first.brand.localeCompare(second.brand, 'sv');
		if (column === 'brand') return direction === 'asc' ? brandOrder : -brandOrder;
		const a = first[column];
		const b = second[column];
		if (a === null) return b === null ? brandOrder : 1;
		if (b === null) return -1;
		return (direction === 'asc' ? a - b : b - a) || brandOrder;
	});
