import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getStatistics } = vi.hoisted(() => ({ getStatistics: vi.fn() }));

vi.mock('$lib/server/review-statistics', () => ({
	getPublicReviewStatistics: getStatistics
}));

import { GET } from './+server';

const get = (query: string) => {
	const url = new URL(`/api/v1/statistics${query}`, 'http://localhost');
	return GET({ url, request: new Request(url), locals: {} } as Parameters<typeof GET>[0]);
};

beforeEach(() => {
	getStatistics.mockReset();
	getStatistics.mockResolvedValue({ priceComparison: [] });
});

describe('statistics regions', () => {
	it.each(['goteborg', 'sverige', 'varlden'])('loads statistics for %s', async (region) => {
		expect((await get(`?region=${region}`)).status).toBe(200);
		expect(getStatistics).toHaveBeenCalledWith(region);
	});

	it('defaults the API to worldwide statistics', async () => {
		expect((await get('')).status).toBe(200);
		expect(getStatistics).toHaveBeenCalledWith('varlden');
	});

	it.each(['?region=', '?region=unknown', '?region=sverige&region=varlden'])(
		'rejects %s before loading statistics',
		async (query) => {
			const response = await get(query);
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ code: 'bad_request' });
			expect(getStatistics).not.toHaveBeenCalled();
		}
	);
});
