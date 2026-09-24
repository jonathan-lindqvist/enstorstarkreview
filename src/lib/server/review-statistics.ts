import { createAsyncCache } from './async-cache';
import type { PublicReviewStatistics, ReviewStatisticBar } from '$lib/types/review-statistics';
import type { Document } from 'mongodb';
import { bars } from '$lib/db/bars';
import { MAX_BEER_PRICE_KR } from '$lib/utils/price';
import { PUBLIC_REVIEW_FILTER } from '$lib/server/review-publication';

export const REVIEW_STATISTICS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface ReviewSummaryResult {
	totalReviews: number;
	gothenburgReviews: number;
	averageRating: number | null;
}

interface PriceSummaryResult {
	priceReviewCount: number;
	averageBeerPrice: number | null;
	happyHourReviewCount: number;
}

interface PriceExtremeResult {
	beerPriceKr: number;
	bars: ReviewStatisticBar[];
}

interface ReviewStatisticsAggregationResult {
	reviewSummary: ReviewSummaryResult[];
	priceSummary: PriceSummaryResult[];
	cheapest: PriceExtremeResult[];
	mostExpensive: PriceExtremeResult[];
}

const validBeerPriceMatch = {
	beerPriceKr: { $type: 'number', $gte: 1, $lte: MAX_BEER_PRICE_KR }
};

const priceExtremePipeline = (direction: 1 | -1): Document[] => [
	{ $match: validBeerPriceMatch },
	{ $sort: { beerPriceKr: direction, title: 1, slug: 1 } },
	{
		$group: {
			_id: '$beerPriceKr',
			bars: {
				$push: {
					title: '$title',
					slug: '$slug',
					beerPriceKr: '$beerPriceKr',
					isHappyHourPrice: { $eq: ['$isHappyHourPrice', true] }
				}
			}
		}
	},
	{ $sort: { _id: direction } },
	{ $limit: 1 },
	{ $project: { _id: 0, beerPriceKr: '$_id', bars: 1 } }
];

const REVIEW_STATISTICS_PIPELINE: Document[] = [
	{ $match: PUBLIC_REVIEW_FILTER },
	{
		$facet: {
			reviewSummary: [
				{
					$group: {
						_id: null,
						totalReviews: { $sum: 1 },
						gothenburgReviews: {
							$sum: {
								$cond: [
									{
										$regexMatch: {
											input: { $ifNull: ['$location', ''] },
											regex: 'Göteborg',
											options: 'i'
										}
									},
									1,
									0
								]
							}
						},
						averageRating: { $avg: '$rating' }
					}
				}
			],
			priceSummary: [
				{ $match: validBeerPriceMatch },
				{
					$group: {
						_id: null,
						priceReviewCount: { $sum: 1 },
						averageBeerPrice: { $avg: '$beerPriceKr' },
						happyHourReviewCount: {
							$sum: { $cond: [{ $eq: ['$isHappyHourPrice', true] }, 1, 0] }
						}
					}
				}
			],
			cheapest: priceExtremePipeline(1),
			mostExpensive: priceExtremePipeline(-1)
		}
	}
];

const emptyStatistics = (): PublicReviewStatistics => ({
	totalReviews: 0,
	gothenburgReviews: 0,
	averageRating: null,
	priceReviewCount: 0,
	averageBeerPrice: null,
	happyHourReviewCount: 0,
	happyHourPercentage: null,
	cheapestBars: [],
	mostExpensiveBars: []
});

const asFiniteNumber = (value: unknown): number | null =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;

const toStatisticBars = (value: ReviewStatisticBar[] | undefined): ReviewStatisticBar[] =>
	(value ?? []).filter(
		(bar): bar is ReviewStatisticBar =>
			typeof bar.title === 'string' &&
			typeof bar.slug === 'string' &&
			asFiniteNumber(bar.beerPriceKr) !== null
	);

const mapAggregationResult = (
	result: ReviewStatisticsAggregationResult | null
): PublicReviewStatistics => {
	if (!result) return emptyStatistics();

	const reviewSummary = result.reviewSummary[0];
	const priceSummary = result.priceSummary[0];
	const priceReviewCount = asFiniteNumber(priceSummary?.priceReviewCount) ?? 0;
	const happyHourReviewCount = asFiniteNumber(priceSummary?.happyHourReviewCount) ?? 0;

	return {
		totalReviews: asFiniteNumber(reviewSummary?.totalReviews) ?? 0,
		gothenburgReviews: asFiniteNumber(reviewSummary?.gothenburgReviews) ?? 0,
		averageRating: asFiniteNumber(reviewSummary?.averageRating),
		priceReviewCount,
		averageBeerPrice: asFiniteNumber(priceSummary?.averageBeerPrice),
		happyHourReviewCount,
		happyHourPercentage:
			priceReviewCount > 0 ? (happyHourReviewCount / priceReviewCount) * 100 : null,
		cheapestBars: toStatisticBars(result.cheapest[0]?.bars),
		mostExpensiveBars: toStatisticBars(result.mostExpensive[0]?.bars)
	};
};

const loadPublicReviewStatistics = async (): Promise<PublicReviewStatistics> => {
	const result = await bars
		.aggregate<ReviewStatisticsAggregationResult>(REVIEW_STATISTICS_PIPELINE)
		.next();

	return mapAggregationResult(result);
};

const cache = createAsyncCache({
	load: loadPublicReviewStatistics,
	ttlMs: REVIEW_STATISTICS_CACHE_TTL_MS
});
export const getPublicReviewStatistics = cache.get;
export const invalidatePublicReviewStatisticsCache = cache.invalidate;
