import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findOne: vi.fn(), comparison: vi.fn() }));
vi.mock('$lib/db/bars', () => ({ bars: { findOne: mocks.findOne } }));
vi.mock('$lib/server/reviews/nearby-comparison', () => ({
	loadNearbyReviewComparison: mocks.comparison
}));

import { GET } from './api/v1/nearby-reviews/+server';

const event = (username: string | null, query = 'address=Gatan%201') =>
	({
		locals: { user: username ? { username } : null },
		request: new Request(`http://localhost/api/v1/nearby-reviews?${query}`),
		url: new URL(`http://localhost/api/v1/nearby-reviews?${query}`)
	}) as unknown as Parameters<typeof GET>[0];

beforeEach(() => {
	vi.resetAllMocks();
	mocks.comparison.mockResolvedValue({ available: true, coordinatesByAddress: {}, reviews: [] });
});

describe('API nearby reviews route', () => {
	it('rejects anonymous requests before reading reviews', async () => {
		expect((await GET(event(null))).status).toBe(401);
		expect(mocks.comparison).not.toHaveBeenCalled();
		expect(mocks.findOne).not.toHaveBeenCalled();
	});

	it('rejects malformed input before reading reviews', async () => {
		for (const query of ['', 'address=%20', 'address=a&exclude=%25']) {
			expect((await GET(event('bob', query))).status).toBe(400);
		}
		expect(mocks.comparison).not.toHaveBeenCalled();
	});

	it('reports an unavailable comparison instead of empty counts', async () => {
		mocks.comparison.mockResolvedValue({ available: false, coordinatesByAddress: {}, reviews: [] });

		const response = await GET(event('bob'));

		expect(response.status).toBe(503);
		expect((await response.json()).code).toBe('service_unavailable');
	});
});
