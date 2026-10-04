import type { ObjectId } from 'mongodb';
import { bars } from '$lib/db/bars';
import { MAX_BEER_PRICE_KR } from '$lib/utils/price';
import { toPriceComparisonPoint } from '$lib/utils/price-comparison';
import type { PriceComparisonPoint } from '$lib/types/price-comparison';

// Loads every priced review, drafts included, for the authenticated review form's price chart.
// Failures degrade to an empty chart rather than breaking the form.
export const loadReviewPriceComparison = async (
	excludeId?: ObjectId
): Promise<PriceComparisonPoint[]> => {
	try {
		const documents = await bars
			.find(
				{
					beerPriceKr: { $gte: 1, $lte: MAX_BEER_PRICE_KR },
					...(excludeId ? { _id: { $ne: excludeId } } : {})
				},
				{
					projection: { _id: 0, title: 1, slug: 1, beerPriceKr: 1, isHappyHourPrice: 1, price: 1 }
				}
			)
			.toArray();

		return documents
			.map(toPriceComparisonPoint)
			.filter((point): point is PriceComparisonPoint => point !== null)
			.sort((a, b) => a.beerPriceKr - b.beerPriceKr || a.title.localeCompare(b.title, 'sv'));
	} catch (err) {
		console.error('Price comparison load failed:', err);
		return [];
	}
};
