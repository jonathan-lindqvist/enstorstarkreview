import type { ObjectId } from 'mongodb';
import { Effect } from 'effect';
import type { PriceComparisonPoint } from '$lib/types/price-comparison';
import { MAX_BEER_PRICE_KR } from '$lib/utils/price';
import { toPriceComparisonPoint } from '$lib/utils/price-comparison';
import { Mongo, tryMongo } from '$lib/server/platform/mongo';
import { PUBLIC_REVIEW_FILTER } from '$lib/server/review-publication';

/**
 * Every priced public review, excluding drafts, for the authenticated review form's price chart.
 * Failures degrade to an empty chart rather than breaking the form.
 */
export const loadReviewPriceComparison = (
	excludeId?: ObjectId
): Effect.Effect<PriceComparisonPoint[], never, Mongo> =>
	Effect.gen(function* () {
		const { bars } = (yield* Mongo).collections;
		const documents = yield* tryMongo(() =>
			bars
				.find(
					{
						$and: [
							PUBLIC_REVIEW_FILTER,
							{
								beerPriceKr: { $gte: 1, $lte: MAX_BEER_PRICE_KR },
								...(excludeId ? { _id: { $ne: excludeId } } : {})
							}
						]
					},
					{
						projection: { _id: 0, title: 1, slug: 1, beerPriceKr: 1, isHappyHourPrice: 1, price: 1 }
					}
				)
				.toArray()
		);
		return documents
			.map(toPriceComparisonPoint)
			.filter((point): point is PriceComparisonPoint => point !== null)
			.sort((a, b) => a.beerPriceKr - b.beerPriceKr || a.title.localeCompare(b.title, 'sv'));
	}).pipe(
		Effect.catchTag('MongoError', (error) =>
			Effect.sync(() => {
				console.error('Price comparison load failed:', error.cause);
				return [];
			})
		)
	);
