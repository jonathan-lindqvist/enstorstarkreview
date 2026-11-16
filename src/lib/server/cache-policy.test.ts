import { describe, expect, it } from 'vitest';
import { applyResponseCachePolicy } from './cache-policy';

const anonymousWeb = {
	method: 'GET',
	routeId: '/feed.xml',
	isApiRequest: false,
	hasSessionCookie: false,
	isAuthenticated: false
};

const publicResponse = (status = 200, headers: Record<string, string> = {}) =>
	new Response(status === 304 ? null : 'public content', {
		status,
		headers: {
			'cache-control': 'public, max-age=300',
			'content-type': 'application/rss+xml',
			...headers
		}
	});

describe('central response cache policy', () => {
	it.each([false, true])(
		'never caches cookie-bearing responses, including API=%s',
		(isApiRequest) => {
			for (const cookie of [
				'auth_session=test-only; HttpOnly',
				'auth_session=; Max-Age=0',
				'theme=dark'
			]) {
				const response = publicResponse(200, { 'set-cookie': cookie });
				applyResponseCachePolicy(response, { ...anonymousWeb, isApiRequest });
				expect(response.headers.get('cache-control')).toBe('private, no-store');
				expect(response.headers.get('set-cookie')).toBe(cookie);
			}
		}
	);

	it.each([
		{ hasSessionCookie: true },
		{ isAuthenticated: true },
		{ hasSessionCookie: true, isAuthenticated: true }
	])('does not share a web response involving a session: %j', (context) => {
		const response = publicResponse();
		applyResponseCachePolicy(response, { ...anonymousWeb, ...context });
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it.each(['/feed.xml', '/sitemap.xml', '/images/[filename]'])(
		'preserves explicit anonymous public caching for %s on GET, HEAD, and 304',
		(routeId) => {
			for (const method of ['GET', 'HEAD']) {
				for (const status of [200, 304]) {
					const response = publicResponse(status);
					applyResponseCachePolicy(response, { ...anonymousWeb, routeId, method });
					expect(response.headers.get('cache-control')).toBe('public, max-age=300');
				}
			}
		}
	);

	it.each([
		['unknown route', { routeId: null }],
		['admin HTML', { routeId: '/admin/reviews' }],
		['private history', { routeId: '/[slug]/history' }],
		['page data', { routeId: '/[slug]' }],
		['a page route ending in .css', { routeId: '/[slug].css' }],
		['an unsafe method', { method: 'POST' }]
	])('denies public caching for %s', (_, context) => {
		const response = publicResponse();
		applyResponseCachePolicy(response, { ...anonymousWeb, ...context });
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it.each([302, 404, 500])('does not preserve a public policy on status %s', (status) => {
		const response = publicResponse(status);
		applyResponseCachePolicy(response, anonymousWeb);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	it.each(['text/html; charset=utf-8', 'application/xhtml+xml'])(
		'keeps %s private even if a public route advertises caching',
		(contentType) => {
			const response = publicResponse(200, { 'content-type': contentType });
			applyResponseCachePolicy(response, anonymousWeb);
			expect(response.headers.get('cache-control')).toBe('private, no-store');
		}
	);

	it('defaults missing and revalidation-only web policies to private, no-store', () => {
		for (const policy of [null, 'no-cache', 'max-age=300', 'private, max-age=300']) {
			const response = publicResponse();
			if (policy === null) response.headers.delete('cache-control');
			else response.headers.set('cache-control', policy);
			applyResponseCachePolicy(response, anonymousWeb);
			expect(response.headers.get('cache-control')).toBe('private, no-store');
		}
	});

	it('preserves existing non-storable errors', () => {
		const response = publicResponse(404, { 'cache-control': 'no-store', 'retry-after': '1' });
		applyResponseCachePolicy(response, anonymousWeb);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(response.headers.get('retry-after')).toBe('1');
	});

	it('retains API revalidation, authorization variance, and error policies', () => {
		for (const policy of [
			'private, no-cache',
			'no-cache',
			'no-store',
			'public, max-age=31536000, immutable'
		]) {
			const response = publicResponse(200, {
				'cache-control': policy,
				vary: 'Authorization, Accept-Encoding'
			});
			applyResponseCachePolicy(response, {
				...anonymousWeb,
				isApiRequest: true,
				hasSessionCookie: true,
				isAuthenticated: true
			});
			expect(response.headers.get('cache-control')).toBe(policy);
			expect(response.headers.get('vary')).toBe('Authorization, Accept-Encoding');
		}
	});

	it('preserves status, body, validators, and security headers when restricting caching', async () => {
		const response = publicResponse(200, {
			etag: '"current"',
			vary: 'Accept-Encoding',
			'x-content-type-options': 'nosniff',
			'content-security-policy': "default-src 'self'"
		});
		const before = { ...Object.fromEntries(response.headers) };
		applyResponseCachePolicy(response, { ...anonymousWeb, hasSessionCookie: true });
		expect(Object.fromEntries(response.headers)).toEqual({
			...before,
			'cache-control': 'private, no-store'
		});
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('public content');
	});
});
