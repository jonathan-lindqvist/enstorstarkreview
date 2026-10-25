import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeApiHandler } from '$lib/server/api/server';
import { makeTestAppLayer, makeTestWorld } from '$lib/server/testing';

const mocks = { find: vi.fn() };

const request = (token: string | null, query = 'address=Gatan%201') =>
	makeApiHandler(
		makeTestAppLayer(makeTestWorld(), {
			tokens: { token: { id: 'bob-id', username: 'bob' } },
			collections: { bars: { find: mocks.find } as never }
		})
	).handle(
		new Request(`http://localhost/api/v1/nearby-reviews?${query}`, {
			headers: token ? { authorization: `Bearer ${token}` } : {}
		}),
		'test-ip'
	);

beforeEach(() => {
	mocks.find.mockReset().mockReturnValue({ toArray: async () => [] });
});

describe('API nearby reviews', () => {
	it('rejects anonymous requests before reading reviews', async () => {
		expect((await request(null)).status).toBe(401);
		expect(mocks.find).not.toHaveBeenCalled();
	});

	it('rejects malformed input before reading reviews', async () => {
		for (const query of [
			'',
			'address=%20',
			'address=a&exclude=%25',
			'address=a&exclude=b&exclude=c'
		]) {
			const response = await request('token', query);
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ code: 'bad_request' });
		}
		expect(mocks.find).not.toHaveBeenCalled();
	});

	it('reports an unavailable comparison instead of empty counts', async () => {
		mocks.find.mockImplementation(() => {
			throw new Error('private database failure');
		});

		const response = await request('token');

		expect(response.status).toBe(503);
		expect((await response.json()).code).toBe('service_unavailable');
	});
});
