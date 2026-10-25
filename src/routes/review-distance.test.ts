import { ObjectId } from 'mongodb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layer } from 'effect';
import { Geocoder } from '$lib/server/map/nominatim';
import { ReviewStore } from '$lib/server/reviews/store';
import { makeTestWorld, useTestApp, webEvent } from '$lib/server/testing';
import type { BarReview } from '$lib/types/bar-review';
import { createReviewRatingValues } from '$lib/review-metadata';
import { ACTIVE_REVIEW_FILTER, PUBLIC_REVIEW_FILTER } from '$lib/server/review-publication';
import { load as homeLoad } from './+page.server';
import { load as detailLoad } from './[slug]/+page.server';

const mocks = {
	find: vi.fn(),
	findOne: vi.fn(),
	rows: vi.fn(),
	geocodesFind: vi.fn(),
	geocodes: vi.fn(),
	write: vi.fn(),
	fetch: vi.fn()
};

let restore: () => Promise<void>;
afterEach(() => restore());
const review = (status?: 'draft' | 'published'): BarReview => ({
	_id: new ObjectId(),
	slug: 'baren',
	title: 'Baren',
	description: 'En recension.',
	location: 'Måsgatan 4',
	image: 'image.png',
	author: 'test',
	rating: 2,
	...createReviewRatingValues(3),
	...(status ? { publicationStatus: status } : {}),
	createdAt: new Date(),
	updatedAt: new Date()
});
const event = (authenticated: boolean, slug = 'baren') => {
	const input = webEvent<{ setHeaders: unknown }>({
		url: 'http://localhost/?sort=nearest',
		user: authenticated ? { username: 'test' } : null,
		params: { slug }
	});
	input.setHeaders = vi.fn();
	return input;
};

beforeEach(() => {
	vi.resetAllMocks();
	mocks.find.mockImplementation(() => ({ toArray: mocks.rows }));
	mocks.geocodesFind.mockImplementation(() => ({ toArray: mocks.geocodes }));
	mocks.geocodes.mockResolvedValue([
		{ addressKey: 'måsgatan 4', status: 'resolved', latitude: 57.72, longitude: 12.03 }
	]);
	// The real review store over stub collections, so the visibility filters are asserted. A
	// geocoder call would fail the test: pages only read saved coordinates.
	restore = useTestApp(makeTestWorld(), {
		collections: {
			bars: { find: mocks.find, findOne: mocks.findOne } as never,
			mapGeocodes: { find: mocks.geocodesFind, updateOne: mocks.write } as never
		},
		overrides: Layer.mergeAll(
			ReviewStore.layer,
			Layer.succeed(Geocoder, Geocoder.of({ findCoordinates: mocks.fetch as never }))
		)
	});
});

describe('authorized distance presentation data', () => {
	it.each([undefined, 'published', 'draft'] as const)(
		'enriches an already-visible %s review without adding stored fields',
		async (status) => {
			const bar = review(status);
			const authenticated = status === 'draft';
			mocks.rows.mockResolvedValue([bar]);
			const result = await homeLoad(event(authenticated) as never);
			expect(result).toMatchObject({
				sort: 'nearest',
				coordinatesByReviewId: { [bar._id.toString()]: { latitude: 57.72, longitude: 12.03 } }
			});
			expect(mocks.find).toHaveBeenCalledWith(
				{
					$and: [{ $and: [{}, {}] }, authenticated ? ACTIVE_REVIEW_FILTER : PUBLIC_REVIEW_FILTER]
				},
				expect.objectContaining({ limit: 25 })
			);
			expect(mocks.find.mock.invocationCallOrder[0]).toBeLessThan(
				mocks.geocodesFind.mock.invocationCallOrder[0]
			);
			expect(result).toHaveProperty('bars.0.location', 'Måsgatan 4');
			expect(result).not.toHaveProperty('bars.0.latitude');
			expect(mocks.write).not.toHaveBeenCalled();
			expect(mocks.fetch).not.toHaveBeenCalled();
		}
	);
	it('does not load coordinates for anonymous drafts, unknown states or missing detail reviews', async () => {
		mocks.rows.mockResolvedValue([]);
		mocks.findOne.mockResolvedValue(null);
		await expect(homeLoad(event(false) as never)).resolves.toMatchObject({
			bars: [],
			coordinatesByReviewId: {}
		});
		await expect(detailLoad(event(false) as never)).rejects.toMatchObject({ status: 404 });
		expect(mocks.findOne).toHaveBeenCalledWith({ $and: [{ slug: 'baren' }, PUBLIC_REVIEW_FILTER] });
		expect(mocks.geocodesFind).not.toHaveBeenCalled();
	});
	it('checks the detail slug before loading a review or coordinates', async () => {
		await expect(detailLoad(event(false, '%') as never)).rejects.toMatchObject({ status: 404 });
		expect(mocks.findOne).not.toHaveBeenCalled();
		expect(mocks.geocodesFind).not.toHaveBeenCalled();
	});
	it.each([true, false])(
		'enriches details after visibility checks (authenticated: %s)',
		async (authenticated) => {
			mocks.findOne.mockResolvedValue(review(authenticated ? 'draft' : 'published'));
			const result = await detailLoad(event(authenticated) as never);
			expect(result).toMatchObject({ coordinates: { latitude: 57.72, longitude: 12.03 } });
			expect(mocks.findOne).toHaveBeenCalledWith({
				$and: [{ slug: 'baren' }, authenticated ? ACTIVE_REVIEW_FILTER : PUBLIC_REVIEW_FILTER]
			});
			expect(mocks.findOne.mock.invocationCallOrder[0]).toBeLessThan(
				mocks.geocodesFind.mock.invocationCallOrder[0]
			);
		}
	);
	it('keeps both pages readable when coordinates are missing or their lookup fails', async () => {
		const bar = review();
		mocks.rows.mockResolvedValue([bar]);
		mocks.findOne.mockResolvedValue(bar);
		for (const fail of [false, true]) {
			if (fail) mocks.geocodes.mockRejectedValue(new Error('database offline'));
			else mocks.geocodes.mockResolvedValue([]);
			await expect(homeLoad(event(false) as never)).resolves.toMatchObject({
				bars: [{ title: 'Baren' }],
				coordinatesByReviewId: {}
			});
			await expect(detailLoad(event(false) as never)).resolves.toMatchObject({
				bar: { title: 'Baren' },
				coordinates: null
			});
		}
		expect(mocks.write).not.toHaveBeenCalled();
		expect(mocks.fetch).not.toHaveBeenCalled();
	});
});
