import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BarReview } from '$lib/types/bar-review';
import { createReviewRatingValues } from '$lib/review-metadata';
import { PUBLIC_REVIEW_FILTER } from '$lib/server/review-publication';

const mocks = vi.hoisted(() => ({
	find: vi.fn(),
	findOne: vi.fn(),
	rows: vi.fn(),
	geocodesFind: vi.fn(),
	geocodes: vi.fn(),
	write: vi.fn(),
	geocode: vi.fn()
}));
vi.mock('$lib/db/bars', () => ({ bars: mocks }));
vi.mock('$lib/db/map-geocodes', () => ({
	mapGeocodes: { find: mocks.geocodesFind, updateOne: mocks.write }
}));
vi.mock('$lib/server/reviews/production', () => ({ publishReviewDependencies: {} }));
vi.mock('$lib/server/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('$lib/server/review-map', () => ({ resolveOnePublicReviewMapMarker: mocks.geocode }));

import { load as homeLoad } from './+page.server';
import { load as detailLoad } from './[slug]/+page.server';

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
const event = (authenticated: boolean) => ({
	url: new URL('http://localhost/?sort=nearest'),
	locals: { user: authenticated ? { username: 'test' } : null },
	params: { slug: 'baren' }
});

beforeEach(() => {
	vi.resetAllMocks();
	mocks.find.mockImplementation(() => ({ toArray: mocks.rows }));
	mocks.geocodesFind.mockImplementation(() => ({ toArray: mocks.geocodes }));
	mocks.geocodes.mockResolvedValue([
		{ addressKey: 'måsgatan 4', status: 'resolved', latitude: 57.72, longitude: 12.03 }
	]);
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
				authenticated ? {} : { $and: [{}, PUBLIC_REVIEW_FILTER] }
			);
			expect(mocks.find.mock.invocationCallOrder[0]).toBeLessThan(
				mocks.geocodesFind.mock.invocationCallOrder[0]
			);
			expect(result).toHaveProperty('bars.0.location', 'Måsgatan 4');
			expect(result).not.toHaveProperty('bars.0.latitude');
			expect(mocks.write).not.toHaveBeenCalled();
			expect(mocks.geocode).not.toHaveBeenCalled();
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
		await expect(
			detailLoad({ ...event(false), params: { slug: '%' } } as never)
		).rejects.toMatchObject({ status: 404 });
		expect(mocks.findOne).not.toHaveBeenCalled();
		expect(mocks.geocodesFind).not.toHaveBeenCalled();
	});
	it.each([true, false])(
		'enriches details after visibility checks (authenticated: %s)',
		async (authenticated) => {
			mocks.findOne.mockResolvedValue(review(authenticated ? 'draft' : 'published'));
			const result = await detailLoad(event(authenticated) as never);
			expect(result).toMatchObject({ coordinates: { latitude: 57.72, longitude: 12.03 } });
			expect(mocks.findOne).toHaveBeenCalledWith(
				authenticated ? { slug: 'baren' } : { $and: [{ slug: 'baren' }, PUBLIC_REVIEW_FILTER] }
			);
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
		expect(mocks.geocode).not.toHaveBeenCalled();
	});
});
