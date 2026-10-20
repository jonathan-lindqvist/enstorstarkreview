import { beforeEach, expect, it, vi } from 'vitest';
import { ObjectId } from 'mongodb';

const mocks = vi.hoisted(() => ({ find: vi.fn(), coordinates: vi.fn() }));
vi.mock('$lib/db/bars', () => ({ bars: { find: mocks.find } }));
vi.mock('$lib/server/reviews/coordinates', () => ({ loadReviewCoordinates: mocks.coordinates }));
import { load } from './+page.server';
import { GET } from './recensioner/data/+server';
import { PUBLIC_REVIEW_FILTER, ACTIVE_REVIEW_FILTER } from '$lib/server/review-publication';

const rows = Array.from({ length: 25 }, (_, index) => ({
	_id: new ObjectId(),
	title: `Bar ${index}`,
	slug: `bar-${index}`,
	description: 'En recension',
	location: 'Göteborg',
	image: 'bar.jpg',
	rating: 2,
	author: 'test',
	createdAt: new Date(),
	changeLog: [{ updatedBy: 'private-history' }]
}));
const event = (query = '') =>
	({
		url: new URL(`https://example.test/${query}`),
		locals: { user: null },
		setHeaders: vi.fn()
	}) as unknown as Parameters<typeof load>[0];

beforeEach(() => {
	vi.resetAllMocks();
	mocks.find.mockReturnValue({ toArray: async () => rows });
	mocks.coordinates.mockResolvedValue({});
});

it('renders only the first 24 cards and exposes the next crawlable batch', async () => {
	const result = await load(event());
	expect(result?.bars).toHaveLength(24);
	expect(result?.nextPage).toBe(2);
	expect(result?.bars[0]).not.toHaveProperty('changeLog');
	expect(mocks.coordinates).toHaveBeenCalledWith(rows.slice(0, 24));
});

it('does not relabel an authenticated unknown-status card as public', async () => {
	mocks.find.mockReturnValue({ toArray: async () => [{ ...rows[0], publicationStatus: null }] });
	const input = event();
	input.locals.user = { username: 'editor' } as App.AuthUser;
	const result = await load(input);
	expect(result?.bars[0].publicationStatus).not.toBe('published');
});

it('rejects malformed or excessive pages before reading reviews', async () => {
	for (const query of ['?page=0', '?page=-1', '?page=1.5', '?page=10001', '?page=1&page=2']) {
		await expect(load(event(query))).rejects.toMatchObject({ status: 400 });
	}
	expect(mocks.find).not.toHaveBeenCalled();
});

it('filters and sorts the full collection before selecting the requested page', async () => {
	const input = event('?page=2&search=.*&sort=score&attributes=darts&attributes=unknown');
	const result = await load(input);
	expect(result).toMatchObject({ page: 2, search: '.*', sort: 'score', attributes: ['darts'] });
	expect(mocks.find).toHaveBeenCalledWith(
		{
			$and: [
				{
					$and: [
						expect.objectContaining({ $or: expect.any(Array) }),
						{ attributes: { $in: ['darts'] } }
					]
				},
				PUBLIC_REVIEW_FILTER
			]
		},
		expect.objectContaining({ sort: { rating: -1, createdAt: -1, _id: -1 }, skip: 24, limit: 25 })
	);
	expect(JSON.stringify(mocks.find.mock.calls[0][0])).toContain('\\\\.\\\\*');
	expect(input.setHeaders).toHaveBeenCalledWith({ 'cache-control': 'private, no-store' });
});

it('returns 404 for empty later pages but permits an empty first page', async () => {
	mocks.find.mockReturnValue({ toArray: async () => [] });
	await expect(load(event('?page=2'))).rejects.toMatchObject({ status: 404 });
	expect((await load(event()))?.bars).toEqual([]);
});

it('rejects oversized URLs, malformed IDs, repeated IDs and invalid views before queries', async () => {
	const id = rows[0]._id.toHexString();
	for (const query of [
		`?search=${'a'.repeat(2050)}`,
		'?ids=invalid',
		`?ids=${id},${id}`,
		`?ids=${Array.from({ length: 25 }, () => new ObjectId().toHexString()).join(',')}`,
		`?ids=${id}&ids=${id}`,
		'?view=unknown',
		`?view=index&ids=${id}`
	]) {
		await expect(GET(event(query) as never)).rejects.toMatchObject({ status: 400 });
	}
	expect(mocks.find).not.toHaveBeenCalled();
});

it('uses web-session visibility and preserves requested nearest-card order', async () => {
	const ids = [rows[1]._id.toHexString(), rows[0]._id.toHexString()];
	const input = event(`?ids=${ids.join(',')}`);
	input.locals.user = { username: 'editor' } as App.AuthUser;
	const response = await GET(input as never);
	expect(response.headers.get('cache-control')).toBe('private, no-store');
	expect(response.headers.get('x-robots-tag')).toBe('noindex');
	expect((await response.json()).bars.map((bar: { _id: string }) => bar._id)).toEqual(ids);
	expect(mocks.find.mock.calls[0][0].$and[0].$and[1]).toEqual(ACTIVE_REVIEW_FILTER);
	expect(mocks.find.mock.calls[0][1].limit).toBe(24);
});

it('provides only IDs, dates and optional saved coordinates for nearest ordering', async () => {
	mocks.coordinates.mockResolvedValue({
		[rows[0]._id.toHexString()]: { latitude: 57, longitude: 12 }
	});
	const response = await GET(event('?view=index') as never);
	const body = await response.json();
	expect(body.index[0]).toEqual({
		id: rows[0]._id.toHexString(),
		createdAt: rows[0].createdAt.toISOString(),
		coordinates: { latitude: 57, longitude: 12 }
	});
	expect(body.index[1].coordinates).toBeNull();
	expect(mocks.find.mock.calls[0][1].projection).toEqual({ _id: 1, createdAt: 1, location: 1 });
	expect(mocks.find.mock.calls[0][0].$and[1]).toEqual(PUBLIC_REVIEW_FILTER);
});

it('returns a private generic failure without exposing dependency details', async () => {
	mocks.find.mockImplementation(() => {
		throw new Error('secret database credentials');
	});
	const response = await GET(event() as never);
	expect(response.status).toBe(503);
	expect(response.headers.get('cache-control')).toBe('private, no-store');
	expect(await response.text()).not.toContain('secret');
});
