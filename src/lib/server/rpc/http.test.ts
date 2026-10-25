import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ReviewRequestConfigurationError,
	ReviewRequestDeliveryError
} from '$lib/server/review-requests/delivery';
import type { RpcDependencies } from './context';
import { handleApiRequest } from './http';
import { reviewETag } from './representations';
import { testDependencies, testEvent, testReview } from './test-fixtures';

/** Sends one request through the API door, as hooks hand it over after bearer authentication. */
const send = (
	path: string,
	init: RequestInit & { username?: string | null; deps?: RpcDependencies } = {}
) => {
	const event = testEvent(`/api/v1${path}`, init);
	return { event, response: handleApiRequest(event) };
};

const json = (body: unknown, contentType = 'application/json') => ({
	method: 'POST',
	headers: { 'content-type': contentType },
	body: typeof body === 'string' ? body : JSON.stringify(body)
});

const expectProblem = async (response: Response, status: number, code: string) => {
	expect(response.status).toBe(status);
	expect(response.headers.get('content-type')).toBe('application/problem+json');
	expect(response.headers.get('cache-control')).toBe('no-store');
	const body = await response.json();
	expect(body).toMatchObject({ status, code });
	return body;
};

afterEach(() => vi.restoreAllMocks());

describe('API door', () => {
	it('answers unknown paths and methods with a problem instead of an HTML page', async () => {
		await expectProblem(await send('/missing').response, 404, 'not_found');
		await expectProblem(await handleApiRequest(testEvent('/api/v2/reviews')), 404, 'not_found');
		await expectProblem(await send('/statistics', { method: 'DELETE' }).response, 404, 'not_found');
	});

	it('hides unexpected failures behind a generic Swedish problem', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const deps = testDependencies({
			statistics: { get: vi.fn().mockRejectedValue(new Error('database secret')) }
		});
		const body = await expectProblem(
			await send('/statistics', { deps }).response,
			500,
			'internal_error'
		);
		expect(JSON.stringify(body)).not.toContain('secret');
	});

	it('requires a bearer session for protected reads and says how to authenticate', async () => {
		const response = await send('/sessions/current').response;
		await expectProblem(response, 401, 'unauthorized');
		expect(response.headers.get('www-authenticate')).toBe('Bearer');
	});
});

describe('API cache validation', () => {
	const deps = () =>
		testDependencies({
			reviews: {
				findOne: vi.fn().mockResolvedValue(testReview({ publicationStatus: 'published' }))
			}
		});

	it('sends the review version as ETag and varies on Authorization', async () => {
		const response = await send('/reviews/baren', { deps: deps() }).response;

		expect(response.status).toBe(200);
		expect(response.headers.get('etag')).toBe(reviewETag(testReview()));
		expect(response.headers.get('vary')).toBe('Authorization');
		expect(response.headers.get('cache-control')).toBe('no-cache');
		expect(await response.json()).toMatchObject({ slug: 'baren' });
	});

	it.each(['W/"current"', '*', '"older", W/"current"'])(
		'answers a weak or wildcard If-None-Match %s with 304',
		async (header) => {
			const tag = reviewETag(testReview()).replace(/^"|"$/g, '');
			const response = await send('/reviews/baren', {
				deps: deps(),
				headers: { 'if-none-match': header.replace('current', tag) }
			}).response;

			expect(response.status).toBe(304);
			expect(response.body).toBeNull();
			expect(response.headers.get('vary')).toBe('Authorization');
		}
	);

	it('derives a content ETag for list reads and keeps signed-in responses private', async () => {
		const first = await send('/reviews', { username: 'editor' }).response;
		const etag = first.headers.get('etag')!;

		expect(etag).toMatch(/^"/);
		expect(first.headers.get('cache-control')).toBe('private, no-cache');
		const second = await send('/reviews', {
			username: 'editor',
			headers: { 'if-none-match': etag }
		}).response;
		expect(second.status).toBe(304);
	});

	it('answers HEAD without a body', async () => {
		const response = await send('/reviews/baren', { deps: deps(), method: 'HEAD' }).response;
		expect(response.status).toBe(200);
		expect(response.body).toBeNull();
	});
});

describe('API login admission', () => {
	it.each([
		['{', 'application/json', 400, 'bad_request'],
		['{}', 'application/json', 422, 'validation_failed'],
		['{}', 'text/plain', 415, 'unsupported_media_type'],
		['x'.repeat(16 * 1024 + 1), 'application/json', 413, 'payload_too_large']
	])(
		'charges the IP quota before rejecting invalid input (case %#)',
		async (body, type, status, code) => {
			const deps = testDependencies();
			await expectProblem(
				await send('/sessions', { deps, ...json(body, type) }).response,
				status,
				code
			);
			expect(deps.login.consumeRateLimit).toHaveBeenCalledExactlyOnceWith('ip', '203.0.113.10');
			expect(deps.login.verifyCredentials).not.toHaveBeenCalled();
			expect(deps.audit).toHaveBeenCalledWith(
				expect.objectContaining({ outcome: 'failure', reason: 'invalid_api_body' })
			);
		}
	);

	it('rejects a blocked IP without reading the body', async () => {
		const deps = testDependencies({
			login: {
				consumeRateLimit: vi
					.fn()
					.mockResolvedValue({ allowed: false, retryAfterSeconds: 900, remainingAttempts: 0 })
			}
		});
		const { event, response } = send('/sessions', { deps, ...json('{') });

		await expectProblem(await response, 429, 'rate_limited');
		expect((await response).headers.get('retry-after')).toBe('900');
		expect(event.request.bodyUsed).toBe(false);
		expect(deps.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				outcome: 'rate_limited',
				details: { channel: 'api', retryAfterSeconds: 900 }
			})
		);
	});

	it('fails closed before reading the body when the IP limiter fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const deps = testDependencies({
			login: { consumeRateLimit: vi.fn().mockRejectedValue(new Error('database secret')) }
		});
		const { event, response } = send('/sessions', {
			deps,
			...json({ username: 'test', password: 'testpass123' })
		});

		await expectProblem(await response, 500, 'internal_error');
		expect(event.request.bodyUsed).toBe(false);
		expect(deps.login.verifyCredentials).not.toHaveBeenCalled();
	});

	it('returns 401 for wrong credentials without a cookie or the password in the audit', async () => {
		const deps = testDependencies({
			login: {
				verifyCredentials: vi.fn().mockResolvedValue({
					ok: false,
					reason: 'password_mismatch',
					message: 'Fel användarnamn eller lösenord'
				})
			}
		});
		const response = await send('/sessions', {
			deps,
			...json({ username: 'test', password: 'wrongpass' })
		}).response;

		await expectProblem(response, 401, 'invalid_credentials');
		expect(response.headers.get('set-cookie')).toBeNull();
		expect(deps.login.clearRateLimit).not.toHaveBeenCalled();
		expect(JSON.stringify(vi.mocked(deps.audit).mock.calls)).not.toContain('wrongpass');
	});

	it('charges each quota once and returns the bearer token without a cookie', async () => {
		const deps = testDependencies();
		const response = await send('/sessions', {
			deps,
			...json({ username: 'test', password: 'testpass123' })
		}).response;

		expect(response.status).toBe(201);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('set-cookie')).toBeNull();
		expect(await response.json()).toEqual({
			token: 'secret-token',
			expiresAt: '2030-01-01T00:00:00.000Z',
			user: { username: 'test' }
		});
		expect(vi.mocked(deps.login.consumeRateLimit).mock.calls).toEqual([
			['ip', '203.0.113.10'],
			['username', 'test']
		]);
		const audit = JSON.stringify(vi.mocked(deps.audit).mock.calls);
		expect(audit).not.toContain('testpass123');
		expect(audit).not.toContain('secret-token');
	});
});

describe('API review-request admission', () => {
	const request = { barName: 'Bar Himmel', location: 'Göteborg' };

	it.each([
		['{', 'application/json', 400],
		['{}', 'application/json', 422],
		['{}', 'text/plain', 415],
		['x'.repeat(16 * 1024 + 1), 'application/json', 413]
	])('charges the IP quota before rejecting input (case %#)', async (body, type, status) => {
		const deps = testDependencies();
		expect((await send('/review-requests', { deps, ...json(body, type) }).response).status).toBe(
			status
		);
		expect(deps.reviewRequests.consumeRateLimit).toHaveBeenCalledExactlyOnceWith(
			'ip',
			'203.0.113.10',
			{ maxAttempts: 5, windowMs: 86_400_000 }
		);
		expect(deps.reviewRequests.deliver).not.toHaveBeenCalled();
	});

	it('returns Retry-After before reading a blocked request', async () => {
		const deps = testDependencies({
			reviewRequests: {
				consumeRateLimit: vi
					.fn()
					.mockResolvedValue({ allowed: false, retryAfterSeconds: 123, remainingAttempts: 0 })
			}
		});
		const { event, response } = send('/review-requests', { deps, ...json('{') });

		await expectProblem(await response, 429, 'rate_limited');
		expect((await response).headers.get('retry-after')).toBe('123');
		expect(event.request.bodyUsed).toBe(false);
	});

	it('fails closed before reading the body when the IP limiter fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const deps = testDependencies({
			reviewRequests: { consumeRateLimit: vi.fn().mockRejectedValue(new Error('database secret')) }
		});
		const { event, response } = send('/review-requests', { deps, ...json(request) });

		await expectProblem(await response, 503, 'service_unavailable');
		expect(event.request.bodyUsed).toBe(false);
	});

	it.each([
		[new ReviewRequestConfigurationError('missing secret'), 503],
		[new ReviewRequestDeliveryError('upstream secret'), 502]
	])('maps delivery failure to a safe problem (case %#)', async (error, status) => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const deps = testDependencies({
			reviewRequests: { deliver: vi.fn().mockRejectedValue(error) }
		});
		const body = await expectProblem(
			await send('/review-requests', { deps, ...json(request) }).response,
			status,
			'service_unavailable'
		);
		expect(JSON.stringify(body)).not.toContain('secret');
	});

	it('accepts a valid request after both quotas', async () => {
		const deps = testDependencies();
		const response = await send('/review-requests', { deps, ...json(request) }).response;

		expect(response.status).toBe(202);
		expect(
			vi.mocked(deps.reviewRequests.consumeRateLimit).mock.calls.map(([scope]) => scope)
		).toEqual(['ip', 'global']);
		expect(deps.reviewRequests.deliver).toHaveBeenCalledTimes(1);
	});
});

describe('API review writes', () => {
	it('denies an anonymous write before reading its body', async () => {
		const deps = testDependencies();
		const { event, response } = send('/reviews', { deps, ...json('{') });

		await expectProblem(await response, 401, 'unauthorized');
		expect(event.request.bodyUsed).toBe(false);
		expect(vi.mocked(deps.audit).mock.calls[0][0]).toMatchObject({
			outcome: 'denied',
			reason: 'unauthenticated_api_create'
		});
	});

	it('rejects a missing If-Match before reading the body', async () => {
		const { event, response } = send('/reviews/baren', {
			username: 'editor',
			...json('{'),
			method: 'PUT'
		});

		await expectProblem(await response, 428, 'precondition_required');
		expect(event.request.bodyUsed).toBe(false);
	});

	it('reports the first unknown field with an escaped JSON pointer', async () => {
		const deps = testDependencies({
			reviews: { findOne: vi.fn().mockResolvedValue(testReview()) }
		});
		const body = await expectProblem(
			await send('/reviews', { deps, username: 'editor', ...json({ 'extra/~': true }) }).response,
			422,
			'validation_failed'
		);
		expect(body.errors).toEqual([{ pointer: '/extra~1~0', detail: 'Fältet är okänt' }]);
	});

	it('deletes with a current If-Match and returns no content', async () => {
		const deps = testDependencies({
			reviews: { findOne: vi.fn().mockResolvedValue(testReview()) }
		});
		const response = await send('/reviews/baren', {
			deps,
			username: 'editor',
			method: 'DELETE',
			headers: { 'if-match': reviewETag(testReview()) }
		}).response;

		expect(response.status).toBe(204);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.text()).toBe('');
	});
});

describe('API images', () => {
	const filename = '6a1e9d487d43112acf4a0c36.png';
	const published = () =>
		testDependencies({
			images: { findReview: vi.fn().mockResolvedValue({ publicationStatus: 'published' }) }
		});

	it('serves an image inline with its cache policy and an authorization vary', async () => {
		const response = await send(`/images/${filename}`, { deps: published() }).response;

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('image/png');
		expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
		expect(response.headers.get('vary')).toBe('Authorization');
		expect(response.headers.get('content-disposition')).toBeNull();
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
	});

	it('serves one requested preview as WebP', async () => {
		const deps = published();
		const response = await send(`/images/${filename}?preview=card-v1`, { deps }).response;

		expect(response.headers.get('content-type')).toBe('image/webp');
		expect(deps.images.readPreview).toHaveBeenCalledWith(filename, 'card-v1');
		expect(deps.images.readImage).not.toHaveBeenCalled();
	});

	it.each(['preview=card-v1&preview=detail-v1', 'preview=huge'])(
		'rejects %s before any protected work',
		async (query) => {
			const deps = published();
			await expectProblem(
				await send(`/images/${filename}?${query}`, { deps }).response,
				400,
				'bad_request'
			);
			expect(deps.images.findReview).not.toHaveBeenCalled();
		}
	);

	it('treats unknown and unauthorized images alike', async () => {
		await expectProblem(await send(`/images/${filename}`).response, 404, 'not_found');
		await expectProblem(await send('/images/..%2Fsecret.png').response, 404, 'not_found');
	});
});
