import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	aggregate: vi.fn(),
	next: vi.fn()
}));

vi.mock('$lib/db/db', () => ({
	default: {
		collection: vi.fn(() => ({
			aggregate: mocks.aggregate
		}))
	}
}));

import {
	getPublicReviewStatistics,
	invalidatePublicReviewStatisticsCache,
	REVIEW_STATISTICS_CACHE_TTL_MS
} from './review-statistics';

const aggregationResult = {
	beerBrandPrices: [
		{ brand: 'Åbro Original', averagePriceKr: 70, reviewCount: 2, happyHourReviewCount: 0 },
		{ brand: 'Husets lager', averagePriceKr: 60, reviewCount: 1, happyHourReviewCount: 0 }
	],
	reviewSummary: [
		{
			totalReviews: 7,
			gothenburgReviews: 3,
			averageRating: 2.2857142857,
			totalReviewerSpendKr: 260
		}
	],
	priceSummary: [{ priceReviewCount: 5, averageBeerPrice: 72.4 }],
	happyHourSummary: [{ happyHourReviewCount: 2 }],
	cheapest: [
		{
			beerPriceKr: 55,
			bars: [
				{ title: 'Billig bar', slug: 'billig-bar', beerPriceKr: 55, isHappyHourPrice: false },
				{ title: 'Lika billig', slug: 'lika-billig', beerPriceKr: 55, isHappyHourPrice: false }
			]
		}
	],
	mostExpensive: [
		{
			beerPriceKr: 99,
			bars: [{ title: 'Dyr bar', slug: 'dyr-bar', beerPriceKr: 99, isHappyHourPrice: false }]
		}
	]
};

describe('public review statistics', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		mocks.aggregate.mockReset();
		mocks.next.mockReset();
		mocks.aggregate.mockReturnValue({ next: mocks.next });
		mocks.next.mockResolvedValue(aggregationResult);
		invalidatePublicReviewStatisticsCache();
	});
	it('returns estimated reviewer spending independently of regular-price averages', async () => {
		await expect(getPublicReviewStatistics()).resolves.toMatchObject({
			totalReviewerSpendKr: 260
		});
	});
	it.each([undefined, null, -1, 0.5, NaN, Infinity, '260'])(
		'returns zero for a missing or invalid spending total (%s)',
		async (totalReviewerSpendKr) => {
			mocks.next.mockResolvedValueOnce({
				...aggregationResult,
				reviewSummary: [{ ...aggregationResult.reviewSummary[0], totalReviewerSpendKr }]
			});
			await expect(getPublicReviewStatistics()).resolves.toMatchObject({ totalReviewerSpendKr: 0 });
		}
	);
	it('returns value summaries and ranked bars independently of price-only counts', async () => {
		const bar = {
			title: 'Stor öl',
			slug: 'stor-ol',
			beerPriceKr: 50,
			beerVolumeCl: 50,
			clPerKr: 1,
			isHappyHourPrice: false
		};
		mocks.next.mockResolvedValueOnce({
			...aggregationResult,
			valueSummary: [{ valueReviewCount: 2, averageClPerKr: 0.75 }],
			bestValueBars: [bar],
			worstValueBars: [bar],
			beerBrandValues: [
				{ brand: 'Husets lager', averageClPerKr: 0.75, reviewCount: 2, happyHourReviewCount: 0 }
			]
		});
		expect(await getPublicReviewStatistics()).toMatchObject({
			priceReviewCount: 5,
			valueReviewCount: 2,
			averageClPerKr: 0.75,
			bestValueBars: [bar],
			worstValueBars: [bar],
			beerBrandValues: [
				{ brand: 'Husets lager', averageClPerKr: 0.75, reviewCount: 2, happyHourReviewCount: 0 }
			]
		});
	});

	it('returns public review metrics, including shared price extremes', async () => {
		await expect(getPublicReviewStatistics()).resolves.toEqual({
			totalReviews: 7,
			gothenburgReviews: 3,
			averageRating: 2.2857142857,
			priceReviewCount: 5,
			averageBeerPrice: 72.4,
			totalReviewerSpendKr: 260,
			happyHourReviewCount: 2,
			happyHourPercentage: (2 / 7) * 100,
			cheapestBars: aggregationResult.cheapest[0].bars,
			mostExpensiveBars: aggregationResult.mostExpensive[0].bars,
			beerBrandPrices: [...aggregationResult.beerBrandPrices].reverse(),
			valueReviewCount: 0,
			averageClPerKr: null,
			bestValueBars: [],
			worstValueBars: [],
			beerBrandValues: [],
			priceComparison: []
		});

		const pipeline = mocks.aggregate.mock.calls[0][0];
		expect(pipeline[0]).toEqual({
			$match: {
				$and: [
					{ deletedAt: { $exists: false } },
					{ $or: [{ publicationStatus: 'published' }, { publicationStatus: { $exists: false } }] }
				]
			}
		});
		expect(
			pipeline[2].$facet.reviewSummary[0].$group.gothenburgReviews.$sum.$cond[0].$regexMatch
		).toMatchObject({ regex: 'Göteborg', options: 'i' });
		expect(pipeline[2].$facet.priceSummary[0]).toEqual({
			$match: {
				beerPriceKr: { $type: 'number', $gte: 1, $lte: 999 },
				isHappyHourPrice: { $ne: true }
			}
		});
	});

	it('returns sorted price comparison points from public reviews, dropping invalid records', async () => {
		const point = {
			title: 'Ölbaren',
			slug: 'olbaren',
			beerPriceKr: 65,
			isHappyHourPrice: true,
			price: 4
		};
		mocks.next.mockResolvedValueOnce({
			...aggregationResult,
			priceComparison: [
				point,
				{ ...point, title: 'Åbaren', slug: 'abaren' },
				{ ...point, title: 'Billig', slug: 'billig', beerPriceKr: 50, price: undefined },
				{ ...point, slug: 'decimal', beerPriceKr: 65.5 },
				{ ...point, title: undefined }
			]
		});

		await expect(getPublicReviewStatistics()).resolves.toMatchObject({
			priceComparison: [
				{
					title: 'Billig',
					slug: 'billig',
					beerPriceKr: 50,
					isHappyHourPrice: true,
					valueRating: null
				},
				{
					title: 'Åbaren',
					slug: 'abaren',
					beerPriceKr: 65,
					isHappyHourPrice: true,
					valueRating: 4
				},
				{
					title: 'Ölbaren',
					slug: 'olbaren',
					beerPriceKr: 65,
					isHappyHourPrice: true,
					valueRating: 4
				}
			]
		});
		const pipeline = mocks.aggregate.mock.calls[0][0];
		expect(pipeline[2].$facet.priceComparison).toEqual([
			{ $match: { beerPriceKr: { $type: 'number', $gte: 1, $lte: 999 } } },
			{ $project: { _id: 0, title: 1, slug: 1, beerPriceKr: 1, isHappyHourPrice: 1, price: 1 } }
		]);
	});

	it('keeps happy hour findings and review metrics when no regular prices are available', async () => {
		mocks.next.mockResolvedValueOnce({
			reviewSummary: [
				{ totalReviews: 2, gothenburgReviews: 1, averageRating: 2.5, totalReviewerSpendKr: 80 }
			],
			priceSummary: [],
			happyHourSummary: [{ happyHourReviewCount: 2 }],
			cheapest: [],
			mostExpensive: []
		});
		await expect(getPublicReviewStatistics()).resolves.toMatchObject({
			totalReviews: 2,
			gothenburgReviews: 1,
			averageRating: 2.5,
			priceReviewCount: 0,
			averageBeerPrice: null,
			totalReviewerSpendKr: 80,
			happyHourReviewCount: 2,
			happyHourPercentage: 100,
			valueReviewCount: 0,
			averageClPerKr: null,
			cheapestBars: [],
			mostExpensiveBars: [],
			bestValueBars: [],
			worstValueBars: [],
			beerBrandPrices: [],
			beerBrandValues: []
		});
	});

	it('returns an empty result when there are no public reviews', async () => {
		mocks.next.mockResolvedValueOnce({
			reviewSummary: [],
			priceSummary: [],
			cheapest: [],
			mostExpensive: []
		});

		await expect(getPublicReviewStatistics()).resolves.toEqual({
			totalReviews: 0,
			gothenburgReviews: 0,
			averageRating: null,
			priceReviewCount: 0,
			averageBeerPrice: null,
			totalReviewerSpendKr: 0,
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
	});

	it('reuses a cached result until the 24-hour TTL expires', async () => {
		let now = 1_000;
		vi.spyOn(Date, 'now').mockImplementation(() => now);

		await getPublicReviewStatistics();
		now += REVIEW_STATISTICS_CACHE_TTL_MS - 1;
		await getPublicReviewStatistics();
		expect(mocks.aggregate).toHaveBeenCalledTimes(1);

		now += 1;
		await getPublicReviewStatistics();
		expect(mocks.aggregate).toHaveBeenCalledTimes(2);
	});

	it('clears the cache when explicitly invalidated', async () => {
		await getPublicReviewStatistics();
		invalidatePublicReviewStatisticsCache();
		await getPublicReviewStatistics();

		expect(mocks.aggregate).toHaveBeenCalledTimes(2);
	});

	it('shares an in-flight calculation between requests', async () => {
		let resolveResult: (value: typeof aggregationResult) => void;
		mocks.next.mockImplementationOnce(
			() => new Promise<typeof aggregationResult>((resolve) => (resolveResult = resolve))
		);

		const firstRequest = getPublicReviewStatistics();
		const secondRequest = getPublicReviewStatistics();
		expect(mocks.aggregate).toHaveBeenCalledTimes(1);

		resolveResult!(aggregationResult);
		await expect(Promise.all([firstRequest, secondRequest])).resolves.toHaveLength(2);
	});

	it('does not let an invalidated in-flight calculation replace fresh statistics', async () => {
		let resolveStaleResult: (value: typeof aggregationResult) => void;
		mocks.next
			.mockImplementationOnce(
				() =>
					new Promise<typeof aggregationResult>((resolve) => {
						resolveStaleResult = resolve;
					})
			)
			.mockResolvedValueOnce({
				...aggregationResult,
				reviewSummary: [
					{ ...aggregationResult.reviewSummary[0], totalReviews: 8, totalReviewerSpendKr: 300 }
				]
			});

		const staleRequest = getPublicReviewStatistics();
		invalidatePublicReviewStatisticsCache();
		await expect(getPublicReviewStatistics()).resolves.toMatchObject({
			totalReviews: 8,
			totalReviewerSpendKr: 300
		});
		resolveStaleResult!(aggregationResult);
		await staleRequest;
		await expect(getPublicReviewStatistics()).resolves.toMatchObject({
			totalReviews: 8,
			totalReviewerSpendKr: 300
		});

		expect(mocks.aggregate).toHaveBeenCalledTimes(2);
	});
});
