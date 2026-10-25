import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeApiHandler } from '$lib/server/api/server';
import { reviewETag } from '$lib/server/api/reviews';
import { createExistingReview } from '$lib/server/reviews/test-fixtures';
import { makeTestAppLayer, makeTestWorld, type TestWorld } from '$lib/server/testing';
import type { ReviewRequestSubmission } from '$lib/types/review-request';

const allowed = (attempts = 1) => ({
	_id: 'x',
	attempts,
	windowStart: new Date(),
	blockedUntil: null,
	lastAllowed: true,
	createdAt: new Date(),
	updatedAt: new Date()
});

const setup = (world: TestWorld = makeTestWorld()) => {
	const loginLimit = vi.fn().mockResolvedValue(allowed());
	const requestLimit = vi.fn().mockResolvedValue({ ...allowed(), attempts: [new Date()] });
	const delivered: ReviewRequestSubmission[] = [];
	const api = makeApiHandler(
		makeTestAppLayer(world, {
			tokens: { token: { id: 'id-current', username: 'current' } },
			delivered,
			collections: {
				loginRateLimits: {
					findOneAndUpdate: loginLimit,
					deleteOne: vi.fn().mockResolvedValue({})
				} as never,
				reviewRequestRateLimits: { findOneAndUpdate: requestLimit } as never
			}
		})
	);
	const request = (path: string, init: RequestInit & { token?: string } = {}) =>
		api.handle(
			new Request(`http://localhost/api/v1${path}`, {
				...init,
				headers: {
					...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
					...(init.headers as Record<string, string>)
				}
			}),
			'203.0.113.5'
		);
	const json = (path: string, body: unknown, init: RequestInit & { token?: string } = {}) =>
		request(path, {
			method: 'POST',
			...init,
			headers: { 'content-type': 'application/json', ...(init.headers as object) },
			body: typeof body === 'string' ? body : JSON.stringify(body)
		});
	return { world, api, request, json, loginLimit, requestLimit, delivered };
};

afterEach(() => vi.restoreAllMocks());

describe('API routing and problems', () => {
	it('answers unknown paths and invalid query values with problem+json', async () => {
		const { request } = setup();
		const missing = await request('/nope');
		expect(missing.status).toBe(404);
		expect(missing.headers.get('content-type')).toBe('application/problem+json');
		expect(await missing.json()).toMatchObject({ code: 'not_found' });

		const badPreview = await request('/images/6a1e9d487d43112acf4a0c36.png?preview=huge');
		expect(badPreview.status).toBe(400);
		expect(await badPreview.json()).toMatchObject({ code: 'bad_request' });
	});

	it('serves metadata with an ETag and 304 revalidation', async () => {
		const { request } = setup();
		const first = await request('/review-metadata');
		expect(first.status).toBe(200);
		const etag = first.headers.get('etag')!;
		expect(first.headers.get('cache-control')).toBe('no-cache');
		const second = await request('/review-metadata', { headers: { 'if-none-match': etag } });
		expect(second.status).toBe(304);
	});
});

describe('API review reads', () => {
	it('hides drafts from anonymous clients and shows them to reviewers, privately', async () => {
		const world = makeTestWorld({
			reviews: [
				createExistingReview({ slug: 'utkast', publicationStatus: 'draft' }),
				createExistingReview({ slug: 'publicerad', publicationStatus: 'published' })
			]
		});
		const { request } = setup(world);

		const anonymous = await request('/reviews');
		expect((await anonymous.json()).reviews.map((r: { slug: string }) => r.slug)).toEqual([
			'publicerad'
		]);
		expect((await request('/reviews/utkast')).status).toBe(404);

		const reviewer = await request('/reviews/utkast', { token: 'token' });
		expect(reviewer.status).toBe(200);
		expect(reviewer.headers.get('cache-control')).toBe('private, no-cache');
		expect(reviewer.headers.get('etag')).toBe(reviewETag(world.reviews[0]));
	});
});

describe('API sessions', () => {
	it('charges the IP quota before parsing a malformed body', async () => {
		const { json, loginLimit, world } = setup();
		const response = await json('/sessions', '{');
		expect(response.status).toBe(400);
		expect(loginLimit).toHaveBeenCalledTimes(1);
		expect(world.audits.at(-1)).toMatchObject({ reason: 'invalid_api_body' });
	});

	it('rejects oversized bodies on streamed bytes with 413 and closes the connection', async () => {
		const { json } = setup();
		const response = await json('/sessions', { username: 'x', password: 'ö'.repeat(9000) });
		expect(response.status).toBe(413);
		expect(response.headers.get('connection')).toBe('close');
	});

	it('answers a blocked IP with 429 and Retry-After before reading the body', async () => {
		const { json, loginLimit } = setup();
		loginLimit.mockResolvedValueOnce({
			...allowed(9),
			blockedUntil: new Date(Date.now() + 60_000)
		});
		const response = await json('/sessions', 'not even json');
		expect(response.status).toBe(429);
		expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
	});

	it('signs in with valid credentials and rejects wrong ones', async () => {
		const world = makeTestWorld({ passwords: { current: 'testpass123' } });
		const { json } = setup(world);
		const wrong = await json('/sessions', { username: 'current', password: 'wrongpass1' });
		expect(wrong.status).toBe(401);
		expect(await wrong.json()).toMatchObject({ code: 'invalid_credentials' });

		const ok = await json('/sessions', { username: 'current', password: 'testpass123' });
		expect(ok.status).toBe(201);
		expect(await ok.json()).toMatchObject({
			user: { username: 'current' },
			token: expect.any(String)
		});
	});

	it('validates the body structurally with Swedish field errors', async () => {
		const { json } = setup();
		const response = await json('/sessions', { username: 'current', password: 'x', extra: true });
		expect(response.status).toBe(422);
		expect(await response.json()).toMatchObject({
			code: 'validation_failed',
			errors: [{ pointer: '/extra', detail: 'Fältet är okänt' }]
		});
	});
});

describe('API review requests', () => {
	it('delivers a valid request to the (test) Discord sink without the IP', async () => {
		const { json, delivered } = setup();
		const response = await json('/review-requests', {
			barName: 'Bar Himmel',
			location: 'Göteborg'
		});
		expect(response.status).toBe(202);
		expect(delivered).toEqual([expect.objectContaining({ barName: 'Bar Himmel' })]);
		expect(JSON.stringify(delivered)).not.toContain('203.0.113.5');
	});

	it('returns field errors and does not deliver invalid requests', async () => {
		const { json, delivered } = setup();
		const response = await json('/review-requests', { barName: 'B', location: 'Göteborg' });
		expect(response.status).toBe(422);
		expect(await response.json()).toMatchObject({
			code: 'validation_failed',
			errors: [{ pointer: '/barName' }]
		});
		expect(delivered).toEqual([]);
	});
});

describe('API review writes', () => {
	it('denies anonymous creation before reading the body', async () => {
		const { json, world } = setup();
		const response = await json('/reviews', '{');
		expect(response.status).toBe(401);
		expect(world.audits).toEqual([
			expect.objectContaining({ outcome: 'denied', reason: 'unauthenticated_api_create' })
		]);
	});

	it('publishes a draft and returns it with a new ETag', async () => {
		const world = makeTestWorld({
			reviews: [createExistingReview({ slug: 'baren', publicationStatus: 'draft' })]
		});
		const { request } = setup(world);
		const response = await request('/reviews/baren/publication', {
			method: 'POST',
			token: 'token'
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ publicationStatus: 'published' });
		const again = await request('/reviews/baren/publication', { method: 'POST', token: 'token' });
		expect(again.status).toBe(409);
		expect(await again.json()).toMatchObject({ code: 'already_published' });
	});
});
