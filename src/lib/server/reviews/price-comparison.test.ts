import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	find: vi.fn(),
	toArray: vi.fn()
}));

vi.mock('$lib/db/bars', () => ({
	bars: { find: mocks.find }
}));

import { loadReviewPriceComparison } from './price-comparison';

const storedReview = {
	title: 'Ölbaren',
	slug: 'olbaren',
	beerPriceKr: 65,
	price: 4,
	isHappyHourPrice: true
};
const comparisonPoint = {
	title: 'Ölbaren',
	slug: 'olbaren',
	beerPriceKr: 65,
	valueRating: 4,
	isHappyHourPrice: true
};

describe('review price comparison loading', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		mocks.find.mockReset();
		mocks.toArray.mockReset();
		mocks.find.mockReturnValue({ toArray: mocks.toArray });
		mocks.toArray.mockResolvedValue([storedReview]);
	});

	it('loads priced, non-deleted reviews without restricting publication status or exposing extra fields', async () => {
		await expect(loadReviewPriceComparison()).resolves.toEqual([comparisonPoint]);
		expect(mocks.find).toHaveBeenCalledWith(
			{ beerPriceKr: { $gte: 1, $lte: 999 }, deletedAt: { $exists: false } },
			{
				projection: { _id: 0, title: 1, slug: 1, beerPriceKr: 1, isHappyHourPrice: 1, price: 1 }
			}
		);
	});

	it('excludes the review currently being edited from the database query', async () => {
		const excludeId = new ObjectId();
		await loadReviewPriceComparison(excludeId);
		expect(mocks.find.mock.calls[0][0]).toEqual({
			beerPriceKr: { $gte: 1, $lte: 999 },
			deletedAt: { $exists: false },
			_id: { $ne: excludeId }
		});
	});

	it('drops invalid records and sorts by price then Swedish title, retaining unrated legacy prices', async () => {
		mocks.toArray.mockResolvedValueOnce([
			{ ...storedReview, title: 'Ölbaren', slug: 'olbaren', privateField: 'private' },
			{ ...storedReview, title: 'Åbaren', slug: 'abaren' },
			{ ...storedReview, title: 'Billig', slug: 'billig', beerPriceKr: 50, price: undefined },
			{ ...storedReview, beerPriceKr: 65.5 },
			{ ...storedReview, title: undefined }
		]);

		await expect(loadReviewPriceComparison()).resolves.toEqual([
			{ ...comparisonPoint, title: 'Billig', slug: 'billig', beerPriceKr: 50, valueRating: null },
			{ ...comparisonPoint, title: 'Åbaren', slug: 'abaren' },
			comparisonPoint
		]);
	});

	it.each(['find', 'toArray'] as const)(
		'returns an empty chart when %s fails',
		async (operation) => {
			const error = new Error('Database unavailable');
			const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
			if (operation === 'find') {
				mocks.find.mockImplementationOnce(() => {
					throw error;
				});
			} else {
				mocks.toArray.mockRejectedValueOnce(error);
			}

			await expect(loadReviewPriceComparison()).resolves.toEqual([]);
			expect(logError).toHaveBeenCalledWith('Price comparison load failed:', error);
		}
	);
});
