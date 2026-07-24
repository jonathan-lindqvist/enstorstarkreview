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
	reviewSummary: [{ totalReviews: 7, gothenburgReviews: 3, averageRating: 2.2857142857 }],
	priceSummary: [{ priceReviewCount: 5, averageBeerPrice: 72.4, happyHourReviewCount: 2 }],
	cheapest: [
		{
			beerPriceKr: 55,
			bars: [
				{ title: 'Billig bar', slug: 'billig-bar', beerPriceKr: 55, isHappyHourPrice: true },
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

	it('returns public review metrics, including shared price extremes', async () => {
		await expect(getPublicReviewStatistics()).resolves.toEqual({
			totalReviews: 7,
			gothenburgReviews: 3,
			averageRating: 2.2857142857,
			priceReviewCount: 5,
			averageBeerPrice: 72.4,
			happyHourReviewCount: 2,
			happyHourPercentage: 40,
			cheapestBars: aggregationResult.cheapest[0].bars,
			mostExpensiveBars: aggregationResult.mostExpensive[0].bars
		});

		const pipeline = mocks.aggregate.mock.calls[0][0];
		expect(pipeline[0]).toEqual({
			$match: {
				$or: [{ publicationStatus: 'published' }, { publicationStatus: { $exists: false } }]
			}
		});
		expect(
			pipeline[1].$facet.reviewSummary[0].$group.gothenburgReviews.$sum.$cond[0].$regexMatch
		).toMatchObject({ regex: 'Göteborg', options: 'i' });
		expect(pipeline[1].$facet.priceSummary[0]).toEqual({
			$match: { beerPriceKr: { $type: 'number', $gte: 1, $lte: 999 } }
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
			happyHourReviewCount: 0,
			happyHourPercentage: null,
			cheapestBars: [],
			mostExpensiveBars: []
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
				reviewSummary: [{ ...aggregationResult.reviewSummary[0], totalReviews: 8 }]
			});

		const staleRequest = getPublicReviewStatistics();
		invalidatePublicReviewStatisticsCache();
		await expect(getPublicReviewStatistics()).resolves.toMatchObject({ totalReviews: 8 });
		resolveStaleResult!(aggregationResult);
		await staleRequest;
		await expect(getPublicReviewStatistics()).resolves.toMatchObject({ totalReviews: 8 });

		expect(mocks.aggregate).toHaveBeenCalledTimes(2);
	});
});
