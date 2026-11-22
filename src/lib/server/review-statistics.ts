import { createAsyncCache } from './async-cache';
import type {
	BeerBrandPrice,
	BeerBrandValue,
	ReviewerSpending,
	ValueStatisticBar,
	PublicReviewStatistics,
	ReviewStatisticBar
} from '$lib/types/review-statistics';
import type { Document } from 'mongodb';
import { bars } from '$lib/db/bars';
import { mapGeocodes } from '$lib/db/map-geocodes';
import type { StatisticsRegion } from '$lib/statistics-regions';
import { MAX_BEER_PRICE_KR } from '$lib/utils/price';
import { MAX_BEER_VOLUME_CL, MIN_BEER_VOLUME_CL, beerClPerKr } from '$lib/utils/beer-value';
import { PUBLIC_REVIEW_FILTER } from '$lib/server/review-publication';
import { toPriceComparisonPoint } from '$lib/utils/price-comparison';
import type { PriceComparisonPoint } from '$lib/types/price-comparison';
import { createResolvedCoordinatesLoader } from './map/coordinates';
import { normalizeMapAddress } from '$lib/utils/map-address';
import { classifyStatisticsRegion } from './statistics-geography';

export const REVIEW_STATISTICS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface ReviewSummaryResult {
	totalReviews: number;
	gothenburgReviews: number;
	averageRating: number | null;
}

interface PriceSummaryResult {
	priceReviewCount: number;
	averageBeerPrice: number | null;
}

interface PriceExtremeResult {
	beerPriceKr: number;
	bars: ReviewStatisticBar[];
}

interface ReviewStatisticsAggregationResult {
	beerBrandPrices?: BeerBrandPrice[];
	valueSummary?: Array<{ valueReviewCount: number; averageClPerKr: number }>;
	bestValueBars?: ValueStatisticBar[];
	worstValueBars?: ValueStatisticBar[];
	beerBrandValues?: BeerBrandValue[];
	reviewSummary: ReviewSummaryResult[];
	reviewerSpending?: ReviewerSpending[];
	priceSummary: PriceSummaryResult[];
	happyHourSummary?: Array<{ happyHourReviewCount: number }>;
	cheapest: PriceExtremeResult[];
	mostExpensive: PriceExtremeResult[];
	priceComparison?: Document[];
}

const validBeerPriceMatch = {
	beerPriceKr: { $type: 'number', $gte: 1, $lte: MAX_BEER_PRICE_KR }
};

const regularBeerPriceMatch = {
	...validBeerPriceMatch,
	isHappyHourPrice: { $ne: true }
};

// Guard each arithmetic operation locally: Mongo may reorder filtering stages.
const boundedInteger = (field: string, minimum: number, maximum: number): Document => ({
	$cond: [
		{ $in: [{ $type: field }, ['double', 'int', 'long']] },
		{
			$cond: [
				{ $and: [{ $gte: [field, minimum] }, { $lte: [field, maximum] }] },
				{ $eq: [field, { $trunc: field }] },
				false
			]
		},
		false
	]
});

const creditedReviewers: Document = {
	$setUnion: [
		{
			$filter: {
				input: {
					$concatArrays: [
						['$author'],
						{
							$cond: [
								{ $isArray: '$coAuthors' },
								'$coAuthors',
								{ $cond: [{ $eq: [{ $type: '$coAuthors' }, 'string'] }, ['$coAuthors'], []] }
							]
						}
					]
				},
				as: 'reviewer',
				cond: {
					$cond: [
						{ $eq: [{ $type: '$$reviewer' }, 'string'] },
						{ $ne: [{ $trim: { input: '$$reviewer' } }, ''] },
						false
					]
				}
			}
		},
		[]
	]
};

const validValueMatch = {
	$match: { clPerKr: { $ne: null }, isHappyHourPrice: { $ne: true } }
};

const valueRankingPipeline = (direction: 1 | -1): Document[] => [
	validValueMatch,
	{ $sort: { clPerKr: direction, title: 1, slug: 1 } },
	{ $limit: 5 },
	{
		$project: {
			_id: 0,
			title: 1,
			slug: 1,
			beerPriceKr: 1,
			beerVolumeCl: 1,
			clPerKr: 1,
			isHappyHourPrice: { $eq: ['$isHappyHourPrice', true] }
		}
	}
];

const priceExtremePipeline = (direction: 1 | -1): Document[] => [
	{ $match: regularBeerPriceMatch },
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

const REVIEW_STATISTICS_FACETS: Document[] = [
	{
		$set: {
			clPerKr: {
				$cond: [
					{
						$and: [
							boundedInteger('$beerVolumeCl', MIN_BEER_VOLUME_CL, MAX_BEER_VOLUME_CL),
							boundedInteger('$beerPriceKr', 1, MAX_BEER_PRICE_KR)
						]
					},
					{ $divide: ['$beerVolumeCl', '$beerPriceKr'] },
					null
				]
			}
		}
	},
	{
		$facet: {
			valueSummary: [
				validValueMatch,
				{
					$group: { _id: null, valueReviewCount: { $sum: 1 }, averageClPerKr: { $avg: '$clPerKr' } }
				}
			],
			bestValueBars: valueRankingPipeline(-1),
			worstValueBars: valueRankingPipeline(1),
			beerBrandValues: [
				validValueMatch,
				{
					$project: {
						brand: {
							$cond: [
								{ $eq: [{ $type: '$beerBrand' }, 'string'] },
								{ $trim: { input: '$beerBrand' } },
								''
							]
						},
						clPerKr: 1,
						isHappyHourPrice: 1
					}
				},
				{ $match: { brand: { $ne: '' } } },
				{
					$group: {
						_id: '$brand',
						averageClPerKr: { $avg: '$clPerKr' },
						reviewCount: { $sum: 1 },
						happyHourReviewCount: { $sum: { $cond: [{ $eq: ['$isHappyHourPrice', true] }, 1, 0] } }
					}
				},
				{
					$project: {
						_id: 0,
						brand: '$_id',
						averageClPerKr: 1,
						reviewCount: 1,
						happyHourReviewCount: 1
					}
				}
			],
			beerBrandPrices: [
				{
					$match: {
						isHappyHourPrice: { $ne: true },
						beerPriceKr: { ...validBeerPriceMatch.beerPriceKr, $type: ['double', 'int', 'long'] },
						beerBrand: { $type: 'string' }
					}
				},
				{
					$match: {
						$expr: {
							// Mongo can combine/reorder matches: guard arithmetic at its own boundary.
							$cond: [
								{ $isNumber: '$beerPriceKr' },
								{ $eq: ['$beerPriceKr', { $trunc: '$beerPriceKr' }] },
								false
							]
						}
					}
				},
				{
					$project: {
						brand: { $trim: { input: '$beerBrand' } },
						beerPriceKr: 1,
						isHappyHourPrice: 1
					}
				},
				{ $match: { brand: { $ne: '' } } },
				{
					$group: {
						_id: '$brand',
						averagePriceKr: { $avg: '$beerPriceKr' },
						reviewCount: { $sum: 1 },
						happyHourReviewCount: { $sum: { $cond: [{ $eq: ['$isHappyHourPrice', true] }, 1, 0] } }
					}
				},
				{
					$project: {
						_id: 0,
						brand: '$_id',
						averagePriceKr: 1,
						reviewCount: 1,
						happyHourReviewCount: 1
					}
				}
			],
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
											input: {
												$cond: [{ $eq: [{ $type: '$location' }, 'string'] }, '$location', '']
											},
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
			reviewerSpending: [
				{ $match: { $expr: boundedInteger('$beerPriceKr', 1, MAX_BEER_PRICE_KR) } },
				{ $project: { _id: 0, reviewers: creditedReviewers, beerPriceKr: 1 } },
				{ $unwind: '$reviewers' },
				{ $group: { _id: '$reviewers', totalSpentKr: { $sum: '$beerPriceKr' } } },
				{ $project: { _id: 0, username: '$_id', totalSpentKr: 1 } }
			],
			priceSummary: [
				{ $match: regularBeerPriceMatch },
				{
					$group: {
						_id: null,
						priceReviewCount: { $sum: 1 },
						averageBeerPrice: { $avg: '$beerPriceKr' }
					}
				}
			],
			happyHourSummary: [
				{ $match: { ...validBeerPriceMatch, isHappyHourPrice: true } },
				{ $count: 'happyHourReviewCount' }
			],
			cheapest: priceExtremePipeline(1),
			mostExpensive: priceExtremePipeline(-1),
			priceComparison: [
				{ $match: validBeerPriceMatch },
				{
					$project: {
						_id: 0,
						title: 1,
						slug: 1,
						beerPriceKr: 1,
						beerVolumeCl: 1,
						isHappyHourPrice: 1,
						price: 1
					}
				}
			]
		}
	}
];

const emptyStatistics = (): PublicReviewStatistics => ({
	totalReviews: 0,
	gothenburgReviews: 0,
	averageRating: null,
	priceReviewCount: 0,
	averageBeerPrice: null,
	totalReviewerSpendKr: 0,
	reviewerSpending: [],
	happyHourReviewCount: 0,
	happyHourPercentage: null,
	cheapestBars: [],
	mostExpensiveBars: [],
	beerBrandPrices: [],
	valueReviewCount: 0,
	averageClPerKr: null,
	bestValueBars: [],
	worstValueBars: [],
	beerBrandValues: [],
	priceComparison: []
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
	const reviewerSpending = (result.reviewerSpending ?? [])
		.filter(({ totalSpentKr }) => Number.isInteger(totalSpentKr) && totalSpentKr > 0)
		.sort((a, b) => b.totalSpentKr - a.totalSpentKr || a.username.localeCompare(b.username, 'sv'));
	const priceSummary = result.priceSummary[0];
	const priceReviewCount = asFiniteNumber(priceSummary?.priceReviewCount) ?? 0;
	const happyHourReviewCount =
		asFiniteNumber(result.happyHourSummary?.[0]?.happyHourReviewCount) ?? 0;
	const allPriceReviewCount = priceReviewCount + happyHourReviewCount;
	const valueSummary = result.valueSummary?.[0];
	const valueBars = (items: ValueStatisticBar[] | undefined) =>
		(items ?? []).filter(
			(bar) =>
				typeof bar.title === 'string' &&
				typeof bar.slug === 'string' &&
				beerClPerKr(bar.beerVolumeCl, bar.beerPriceKr) !== null &&
				asFiniteNumber(bar.clPerKr) !== null &&
				bar.clPerKr > 0
		);

	return {
		totalReviews: asFiniteNumber(reviewSummary?.totalReviews) ?? 0,
		gothenburgReviews: asFiniteNumber(reviewSummary?.gothenburgReviews) ?? 0,
		averageRating: asFiniteNumber(reviewSummary?.averageRating),
		priceReviewCount,
		averageBeerPrice: asFiniteNumber(priceSummary?.averageBeerPrice),
		totalReviewerSpendKr: reviewerSpending.reduce(
			(sum, reviewer) => sum + reviewer.totalSpentKr,
			0
		),
		reviewerSpending,
		happyHourReviewCount,
		happyHourPercentage:
			allPriceReviewCount > 0 ? (happyHourReviewCount / allPriceReviewCount) * 100 : null,
		cheapestBars: toStatisticBars(result.cheapest[0]?.bars),
		mostExpensiveBars: toStatisticBars(result.mostExpensive[0]?.bars),
		valueReviewCount: asFiniteNumber(valueSummary?.valueReviewCount) ?? 0,
		averageClPerKr: asFiniteNumber(valueSummary?.averageClPerKr),
		bestValueBars: valueBars(result.bestValueBars),
		worstValueBars: valueBars(result.worstValueBars),
		beerBrandValues: [...(result.beerBrandValues ?? [])].sort(
			(a, b) => b.averageClPerKr - a.averageClPerKr || a.brand.localeCompare(b.brand, 'sv')
		),
		beerBrandPrices: [...(result.beerBrandPrices ?? [])].sort(
			(a, b) => a.averagePriceKr - b.averagePriceKr || a.brand.localeCompare(b.brand, 'sv')
		),
		priceComparison: (result.priceComparison ?? [])
			.map(toPriceComparisonPoint)
			.filter((point): point is PriceComparisonPoint => point !== null)
			.sort((a, b) => a.beerPriceKr - b.beerPriceKr || a.title.localeCompare(b.title, 'sv'))
	};
};

const loadCoordinates = createResolvedCoordinatesLoader(mapGeocodes);

const loadRegionalAddresses = async () => {
	const addresses = (await bars.distinct('location', PUBLIC_REVIEW_FILTER)).filter(
		(address) => typeof address === 'string'
	);
	const coordinates = await loadCoordinates(addresses);
	const regions = { goteborg: [] as string[], sverige: [] as string[] };
	for (const address of addresses) {
		const position = coordinates.get(normalizeMapAddress(address));
		if (!position) continue;
		const region = classifyStatisticsRegion(position);
		if (region === 'goteborg') regions.goteborg.push(address);
		if (region !== 'varlden') regions.sverige.push(address);
	}
	return regions;
};

const addressCache = createAsyncCache({
	load: loadRegionalAddresses,
	ttlMs: REVIEW_STATISTICS_CACHE_TTL_MS
});

const loadPublicReviewStatistics = async (
	region: StatisticsRegion
): Promise<PublicReviewStatistics> => {
	const match: Document = { ...PUBLIC_REVIEW_FILTER };
	if (region !== 'varlden') {
		const addresses = (await addressCache.get())[region];
		if (!addresses.length) return mapAggregationResult(null);
		// Match the complete saved address so edits cannot reuse the previous address's region.
		match.$expr = { $in: ['$location', { $literal: addresses }] };
	}
	const result = await bars
		.aggregate<ReviewStatisticsAggregationResult>([{ $match: match }, ...REVIEW_STATISTICS_FACETS])
		.next();

	return mapAggregationResult(result);
};

const createStatisticsCache = (region: StatisticsRegion) =>
	createAsyncCache({
		load: () => loadPublicReviewStatistics(region),
		ttlMs: REVIEW_STATISTICS_CACHE_TTL_MS
	});

const regionalStatistics = {
	goteborg: createStatisticsCache('goteborg'),
	sverige: createStatisticsCache('sverige'),
	varlden: createStatisticsCache('varlden')
};

export const getPublicReviewStatistics = (region: StatisticsRegion = 'varlden') =>
	regionalStatistics[region].get();

export const invalidateRegionalReviewStatisticsCache = (): void => {
	addressCache.invalidate();
	regionalStatistics.goteborg.invalidate();
	regionalStatistics.sverige.invalidate();
};

export const invalidatePublicReviewStatisticsCache = (): void => {
	invalidateRegionalReviewStatisticsCache();
	regionalStatistics.varlden.invalidate();
};
