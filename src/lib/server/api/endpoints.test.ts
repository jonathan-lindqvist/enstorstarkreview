import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeApiHandler } from '$lib/server/api/server';
import { reviewETag } from '$lib/server/api/reviews';
import { createExistingReview } from '$lib/server/reviews/test-fixtures';
import { makeTestAppLayer, makeTestWorld, type TestWorld } from '$lib/server/testing';

// Each endpoint through the whole API door over in-memory services and stub collections.
const body = {
	title: 'Nya baren',
	description: 'Text',
	location: 'Gatan 1',
	ratings: {
		atmosphere: 4,
		service: 4,
		selection: 3,
		quality: 5,
		price: 3,
		cleanliness: 4,
		soundLevel: 2,
		barhopPotential: 5
	},
	beer: { brand: 'Falcon Export', priceKr: 59, isHappyHourPrice: false },
	authors: ['current'],
	imageFocus: { x: 50, y: 50 }
};
const image = {
	contentType: 'image/jpeg',
	data: Buffer.from([0xff, 0xd8, 0xff]).toString('base64')
};

const mocks = { aggregate: vi.fn(), find: vi.fn(), findOne: vi.fn() };
let world: TestWorld;
let api: ReturnType<typeof makeApiHandler>;

const call = (
	method: string,
	path: string,
	options: { token?: boolean; json?: unknown; headers?: Record<string, string> } = {}
) =>
	api.handle(
		new Request(`http://localhost/api/v1${path}`, {
			method,
			headers: {
				...(options.token === false ? {} : { authorization: 'Bearer token' }),
				...(options.json === undefined ? {} : { 'content-type': 'application/json' }),
				...options.headers
			},
			body: options.json === undefined ? undefined : JSON.stringify(options.json)
		}),
		'198.51.100.1'
	);

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
	mocks.find.mockReset().mockReturnValue({ toArray: async () => [] });
	mocks.aggregate.mockReset().mockReturnValue({ next: async () => null });
	world = makeTestWorld({
		usernames: ['current', 'editor'],
		reviews: [
			createExistingReview({ slug: 'publicerad', publicationStatus: 'published' }),
			createExistingReview({ slug: 'utkast', publicationStatus: 'draft' })
		]
	});
	api = makeApiHandler(
		makeTestAppLayer(world, {
			tokens: { token: { id: 'id-current', username: 'current' } },
			collections: {
				bars: { find: mocks.find, findOne: mocks.findOne, aggregate: mocks.aggregate } as never,
				mapGeocodes: { find: mocks.find } as never
			}
		})
	);
});
afterEach(() => vi.restoreAllMocks());

describe('API sessions and users', () => {
	it('reports the current session and signs out', async () => {
		const current = await call('GET', '/sessions/current');
		expect(current.status).toBe(200);
		expect(await current.json()).toMatchObject({ user: { username: 'current' } });
		expect(current.headers.get('cache-control')).toBe('no-store');

		expect((await call('DELETE', '/sessions/current')).status).toBe(204);
		expect((await call('GET', '/sessions/current', { token: false })).status).toBe(401);
	});

	it('lists usernames for signed-in clients only', async () => {
		expect(await (await call('GET', '/users')).json()).toEqual({
			users: [{ username: 'current' }, { username: 'editor' }]
		});
		expect((await call('GET', '/users', { token: false })).status).toBe(401);
	});
});

describe('API review writes', () => {
	it('creates a draft with a strong ETag and validates the body', async () => {
		const created = await call('POST', '/reviews', { json: { ...body, image } });
		expect(created.status).toBe(201);
		expect(created.headers.get('location')).toBe('/api/v1/reviews/nya-baren');
		expect(created.headers.get('etag')).toMatch(/^"/);
		expect(await created.json()).toMatchObject({ slug: 'nya-baren', publicationStatus: 'draft' });

		const invalid = await call('POST', '/reviews', { json: { ...body, image, title: 7 } });
		expect(invalid.status).toBe(422);
		expect(await invalid.json()).toMatchObject({ errors: [{ pointer: '/title' }] });

		const media = await api.handle(
			new Request('http://localhost/api/v1/reviews', {
				method: 'POST',
				headers: { authorization: 'Bearer token', 'content-type': 'text/plain' },
				body: 'x'
			}),
			'ip'
		);
		expect(media.status).toBe(415);
	});

	it('rejects a duplicate slug with a field pointer', async () => {
		const response = await call('POST', '/reviews', {
			json: { ...body, image, slug: 'publicerad' }
		});
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({
			code: 'duplicate_slug',
			errors: [{ pointer: '/slug' }]
		});
	});

	it('updates only the version the client saw', async () => {
		const review = world.reviews[0];
		const missing = await call('PUT', '/reviews/publicerad', { json: body });
		expect(missing.status).toBe(428);
		const stale = await call('PUT', '/reviews/publicerad', {
			json: body,
			headers: { 'if-match': '"stale"' }
		});
		expect(stale.status).toBe(412);

		const updated = await call('PUT', '/reviews/publicerad', {
			json: { ...body, slug: 'publicerad' },
			headers: { 'if-match': reviewETag(review) }
		});
		expect(updated.status).toBe(200);
		expect(await updated.json()).toMatchObject({ title: 'Nya baren', slug: 'publicerad' });
		expect(updated.headers.get('etag')).not.toBe(reviewETag(review));
		expect(world.invalidations).toBe(1);
	});
});

describe('API review reads', () => {
	it('shows the history of visible reviews and hides draft history from anonymous clients', async () => {
		const history = await call('GET', '/reviews/publicerad/history', { token: false });
		expect(history.status).toBe(200);
		expect(history.headers.get('cache-control')).toBe('no-cache');
		expect((await call('GET', '/reviews/utkast/history', { token: false })).status).toBe(404);
		const draft = await call('GET', '/reviews/utkast/history');
		expect(draft.status).toBe(200);
		expect(draft.headers.get('cache-control')).toBe('private, no-cache');
		expect((await call('GET', '/reviews/saknas/history')).status).toBe(404);
	});

	it('lists reviews with filters and rejects invalid sort values', async () => {
		const list = await call('GET', '/reviews?sort=score&search=Focus');
		expect(list.status).toBe(200);
		expect((await call('GET', '/reviews?sort=random')).status).toBe(400);
	});
});

describe('API public resources', () => {
	it('serves the map and statistics with validators', async () => {
		const map = await call('GET', '/map', { token: false });
		expect(map.status).toBe(200);
		expect(await map.json()).toMatchObject({ markers: [] });

		const statistics = await call('GET', '/statistics', { token: false });
		expect(statistics.status).toBe(200);
		const etag = statistics.headers.get('etag')!;
		const again = await call('GET', '/statistics', {
			token: false,
			headers: { 'if-none-match': etag }
		});
		expect(again.status).toBe(304);
	});

	it('resolves the next map marker for signed-in clients only', async () => {
		expect((await call('POST', '/map/geocoding', { token: false })).status).toBe(401);
		// Nothing left to geocode.
		expect((await call('POST', '/map/geocoding')).status).toBe(204);
	});

	it('denies images that no visible review references', async () => {
		mocks.findOne.mockResolvedValue(null);
		const response = await call('GET', '/images/6a1e9d487d43112acf4a0c36.png', { token: false });
		expect(response.status).toBe(404);
		expect(response.headers.get('content-type')).toBe('application/problem+json');
	});
});
