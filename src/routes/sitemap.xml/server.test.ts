import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PUBLIC_REVIEW_FILTER } from '$lib/server/review-publication';
import { makeTestWorld, useTestApp, webEvent } from '$lib/server/testing';
import { GET } from './+server';

const mocks = { find: vi.fn(), rows: vi.fn() };
const event = (user: { username: string } | null = null) =>
	webEvent<Parameters<typeof GET>[0]>({ url: '/sitemap.xml', user });

let restore: () => Promise<void>;
beforeEach(() => {
	vi.resetAllMocks();
	mocks.find.mockReturnValue({ toArray: mocks.rows });
	restore = useTestApp(makeTestWorld(), { collections: { bars: { find: mocks.find } as never } });
});
afterEach(async () => {
	vi.restoreAllMocks();
	await restore();
});
it('always queries public reviews and supplies canonical URLs, dates and all listing batches', async () => {
	mocks.rows.mockResolvedValue(
		Array.from({ length: 50 }, (_, index) => ({
			slug: `öl-${index}&<`,
			updatedAt: index ? null : new Date('2026-01-01')
		}))
	);
	const response = await GET(event({ username: 'editor' }));
	const text = await response.text();
	expect(response.status).toBe(200);
	expect(response.headers.get('content-type')).toContain('application/xml');
	expect(text).toContain('https://enstorstarkreview.se/?page=3');
	expect(text).toContain('2026-01-01T00:00:00.000Z');
	expect(text).toContain('%C3%B6l-0%26%3C');
	expect(text).not.toContain('<lastmod>null');
	expect(mocks.find).toHaveBeenCalledWith(
		PUBLIC_REVIEW_FILTER,
		expect.objectContaining({ projection: { slug: 1, updatedAt: 1, createdAt: 1 } })
	);
});
it('omits invalid dates and uses a stored creation date when no update date exists', async () => {
	mocks.rows.mockResolvedValue([
		{ slug: 'valid', createdAt: new Date('2026-02-01') },
		{ slug: 'invalid', updatedAt: new Date('invalid') }
	]);
	const response = await GET(event());
	const text = await response.text();
	expect(text.match(/<lastmod>/g)).toHaveLength(1);
	expect(text).toContain('2026-02-01');
});
it('returns an uncached generic 503 when Mongo is unavailable', async () => {
	mocks.rows.mockRejectedValue(new Error('secret credentials'));
	const response = await GET(event());
	expect(response.status).toBe(503);
	expect(response.headers.get('cache-control')).toBe('no-store');
	expect(await response.text()).not.toContain('secret');
});
