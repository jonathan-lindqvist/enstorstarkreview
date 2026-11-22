import { expect, it, vi } from 'vitest';

const { getStatistics } = vi.hoisted(() => ({ getStatistics: vi.fn() }));

vi.mock('$lib/server/review-statistics', () => ({
	getPublicReviewStatistics: getStatistics
}));

import { load } from './+page.server';

it.each([
	['', 'goteborg'],
	['?region=goteborg', 'goteborg'],
	['?region=unknown', 'goteborg'],
	['?region=sverige&region=varlden', 'goteborg'],
	['?region=sverige', 'sverige'],
	['?region=varlden', 'varlden']
])('uses the selected region for %s', async (query, region) => {
	const url = new URL(`/statistik${query}`, 'http://localhost');
	getStatistics.mockResolvedValue({ totalReviews: 1 });
	expect(await load({ url } as Parameters<typeof load>[0])).toEqual({
		region,
		statistics: { totalReviews: 1 }
	});
	expect(getStatistics).toHaveBeenLastCalledWith(region);
});
