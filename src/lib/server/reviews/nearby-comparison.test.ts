import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ find: vi.fn(), toArray: vi.fn(), coordinates: vi.fn() }));
vi.mock('#lib/db/bars.js', () => ({ bars: { find: mocks.find } }));
vi.mock('./coordinates', () => ({ loadReviewCoordinates: mocks.coordinates }));
import { loadNearbyReviewComparison } from './nearby-comparison';

const id = new ObjectId();
const otherId = new ObjectId();
const center = { latitude: 57.7, longitude: 12 };
const documents = [
	{ _id: id, title: 'Här', slug: 'har', location: ' Gatan 1 ', secret: 'never expose' },
	{
		_id: otherId,
		title: 'Annat utkast',
		slug: 'utkast',
		location: 'Gatan 2',
		publicationStatus: 'draft'
	}
];
beforeEach(() => {
	vi.resetAllMocks();
	mocks.find.mockReturnValue({ toArray: mocks.toArray });
	mocks.toArray.mockResolvedValue(documents);
	mocks.coordinates.mockResolvedValue({ [id.toString()]: center });
});
describe('authenticated nearby comparison loader', () => {
	it('keeps drafts, projects minimal fields, and excludes the edited bar without losing its saved center', async () => {
		await expect(loadNearbyReviewComparison(id)).resolves.toEqual({
			available: true,
			coordinatesByAddress: { 'gatan 1': center },
			reviews: [
				{ id: otherId.toString(), title: 'Annat utkast', slug: 'utkast', coordinates: null }
			]
		});
		expect(mocks.find).toHaveBeenCalledWith(
			{ deletedAt: { $exists: false } },
			{ projection: { _id: 1, title: 1, slug: 1, location: 1 } }
		);
	});
	it('distinguishes storage failure from an empty collection', async () => {
		mocks.toArray.mockRejectedValueOnce(new Error('offline'));
		await expect(loadNearbyReviewComparison()).resolves.toMatchObject({
			available: false,
			reviews: []
		});
		expect(mocks.coordinates).not.toHaveBeenCalled();
		mocks.toArray.mockResolvedValueOnce([]);
		await expect(loadNearbyReviewComparison()).resolves.toMatchObject({
			available: true,
			reviews: []
		});
	});
	it('retains unlocated reviews when the saved-coordinate lookup has no results', async () => {
		mocks.coordinates.mockResolvedValueOnce({});
		const result = await loadNearbyReviewComparison();
		expect(result.reviews).toHaveLength(2);
		expect(result.reviews.every((review) => review.coordinates === null)).toBe(true);
		expect(result.coordinatesByAddress).toEqual({});
	});
});
