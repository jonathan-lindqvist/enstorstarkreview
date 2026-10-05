import { ObjectId } from 'mongodb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReviewFeed, type ReviewFeedDocument } from '$lib/server/review-feed';

const mocks = vi.hoisted(() => ({ find: vi.fn(), toArray: vi.fn() }));
vi.mock('$lib/db/bars', () => ({ bars: { find: mocks.find } }));

import { GET } from './+server';

const origin = 'https://reviews.example';
const review: ReviewFeedDocument = {
	_id: new ObjectId('000000000000000000000001'),
	title: 'Göteborgs bar',
	location: 'Ölgatan 1, Göteborg',
	rating: 2,
	slug: 'göteborgs-bar',
	createdAt: new Date('2025-01-01T12:00:00Z')
};

const makeEvent = (ifNoneMatch?: string): Parameters<typeof GET>[0] =>
	({
		url: new URL('/feed.xml', origin),
		request: new Request(new URL('/feed.xml', origin), {
			headers: ifNoneMatch ? { 'if-none-match': ifNoneMatch } : {}
		})
	}) as Parameters<typeof GET>[0];

describe('/feed.xml HTTP responses', () => {
	beforeEach(() => {
		mocks.find.mockReset().mockReturnValue({ toArray: mocks.toArray });
		mocks.toArray.mockReset().mockResolvedValue([review]);
	});
	afterEach(() => vi.restoreAllMocks());

	it('returns RSS with a five-minute cache and a deterministic content-based ETag', async () => {
		const response = await GET(makeEvent());
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
		expect(response.headers.get('cache-control')).toBe('public, max-age=300');
		expect(response.headers.get('etag')).toMatch(/^"[a-f0-9]{64}"$/);
		expect(await response.text()).toBe(buildReviewFeed([review], origin));
		expect((await GET(makeEvent())).headers.get('etag')).toBe(response.headers.get('etag'));
		mocks.toArray.mockResolvedValueOnce([]);
		expect((await GET(makeEvent())).headers.get('etag')).not.toBe(response.headers.get('etag'));
	});

	it('handles strong, weak, list, and wildcard validators with a bodyless 304', async () => {
		const etag = (await GET(makeEvent())).headers.get('etag')!;
		for (const validator of [etag, `W/${etag}`, `"other", W/${etag}`, '*']) {
			const response = await GET(makeEvent(validator));
			expect(response.status).toBe(304);
			expect(response.headers.get('etag')).toBe(etag);
			expect(response.headers.get('cache-control')).toBe('public, max-age=300');
			expect(await response.text()).toBe('');
		}
		expect((await GET(makeEvent('"different"'))).status).toBe(200);
	});

	it('returns a Swedish uncached error when MongoDB fails, even with a validator', async () => {
		mocks.find.mockImplementation(() => {
			throw new Error('private database failure');
		});
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const response = await GET(makeEvent('*'));
		expect(response.status).toBe(503);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('etag')).toBeNull();
		expect(await response.text()).toBe('Kunde inte hämta RSS-flödet. Försök igen om en stund.');
	});
});
