import {
	expect,
	type APIRequestContext,
	type APIResponse,
	type PlaywrightWorkerArgs
} from '@playwright/test';
import { randomBytes } from 'node:crypto';
import {
	apiPrivateImage,
	apiPrivateSlug,
	bars,
	isolatedQuota,
	legacyImage,
	loginRateLimits,
	publisherPassword,
	publisherUsername,
	runId,
	sessions,
	test
} from './fixtures/reviews';

let token: string;
let sessionIds: string[];

const publicResources = () => [
	{ path: '/feed.xml', policy: 'public, max-age=300' },
	{ path: '/sitemap.xml', policy: 'public, max-age=300' },
	...['', '?preview=card-v1', '?preview=detail-v1'].map((query) => ({
		path: `/images/${legacyImage}${query}`,
		policy: 'public, max-age=31536000, immutable'
	}))
];

const expectPrivate = (response: APIResponse) =>
	expect(response.headers()['cache-control']).toBe('private, no-store');

const expectNoCookies = (response: APIResponse) =>
	expect(response.headersArray().some(({ name }) => name.toLowerCase() === 'set-cookie')).toBe(
		false
	);

// Assert attributes and booleans so a failing test never prints a session value.
const expectSessionCookie = (response: APIResponse, cleared = false) => {
	const header = response
		.headersArray()
		.find(
			({ name, value }) => name.toLowerCase() === 'set-cookie' && value.startsWith('auth_session=')
		);
	expect(Boolean(header)).toBe(true);
	if (!header) throw new Error('Missing session cookie');
	const [pair, ...attributes] = header.value.split(';');
	expect(pair === 'auth_session=').toBe(cleared);
	for (const attribute of ['Path=/', 'HttpOnly', 'SameSite=Lax']) {
		expect(attributes.map((value) => value.trim())).toContain(attribute);
	}
	if (!process.env.PLAYWRIGHT_TEST_BASE_URL) {
		expect(attributes.map((value) => value.trim())).toContain('Secure');
	}
	return pair.slice('auth_session='.length);
};

const withWebClient = async (
	playwright: PlaywrightWorkerArgs['playwright'],
	baseURL: string | undefined,
	sessionId: string,
	run: (client: APIRequestContext) => Promise<void>
) => {
	const client = await playwright.request.newContext({
		baseURL,
		extraHTTPHeaders: { cookie: `auth_session=${sessionId}` }
	});
	try {
		await run(client);
	} finally {
		await client.dispose();
	}
};

test.beforeEach(async ({ request }) => {
	sessionIds = [];
	const response = await isolatedQuota(loginRateLimits, () =>
		request.post('/api/v1/sessions', {
			data: { username: publisherUsername, password: publisherPassword }
		})
	);
	expect(response.status()).toBe(201);
	token = (await response.json()).token;
	sessionIds.push(token);
});

test.afterEach(async () => {
	await sessions.deleteMany({ _id: { $in: sessionIds } });
});

test('session renewal makes public GET and HEAD resources private', async ({
	playwright,
	baseURL
}) => {
	await withWebClient(playwright, baseURL, token, async (client) => {
		for (const method of ['GET', 'HEAD']) {
			for (const { path } of publicResources()) {
				const previousExpiry = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
				await sessions.updateOne({ _id: token }, { $set: { expires_at: previousExpiry } });
				const response = await client.fetch(path, { method });
				expect(response.status()).toBe(200);
				expectPrivate(response);
				expect(expectSessionCookie(response) === token).toBe(true);
				expect((await sessions.findOne({ _id: token }))!.expires_at.getTime()).toBeGreaterThan(
					previousExpiry.getTime()
				);
				if (method === 'HEAD') expect(await response.body()).toHaveLength(0);
			}
		}
	});
});

test('a conditional RSS response cannot publicly cache a renewed cookie', async ({
	request,
	playwright,
	baseURL
}) => {
	const etag = (await request.get('/feed.xml')).headers()['etag'];
	await sessions.updateOne(
		{ _id: token },
		{ $set: { expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) } }
	);
	await withWebClient(playwright, baseURL, token, async (client) => {
		const response = await client.get('/feed.xml', { headers: { 'if-none-match': etag } });
		expect(response.status()).toBe(304);
		expectPrivate(response);
		expect(expectSessionCookie(response) === token).toBe(true);
		expect(response.headers()['etag']).toBe(etag);
		expect(await response.body()).toHaveLength(0);
	});
});

test('a current web session stays private even when no cookie renewal is needed', async ({
	playwright,
	baseURL
}) => {
	await withWebClient(playwright, baseURL, token, async (client) => {
		for (const { path } of publicResources()) {
			const response = await client.get(path);
			expect(response.status()).toBe(200);
			expectPrivate(response);
			expectNoCookies(response);
		}
	});
});

for (const state of ['empty', 'invalid', 'expired', 'revoked'] as const) {
	test(`a ${state} web session cannot populate a public cache`, async ({ playwright, baseURL }) => {
		let sessionId = token;
		if (state === 'empty') sessionId = '';
		if (state === 'invalid') sessionId = randomBytes(25).toString('hex');
		if (state === 'expired') {
			await sessions.updateOne({ _id: token }, { $set: { expires_at: new Date(0) } });
		}
		if (state === 'revoked') await sessions.deleteOne({ _id: token });
		await withWebClient(playwright, baseURL, sessionId, async (client) => {
			const response = await client.get('/feed.xml');
			expect(response.status()).toBe(200);
			expectPrivate(response);
			if (state === 'empty') expectNoCookies(response);
			else expectSessionCookie(response, true);
		});
		if (state === 'expired' || state === 'revoked') {
			expect(await sessions.countDocuments({ _id: token })).toBe(0);
		}
	});
}

test('anonymous public resources retain their caching without setting cookies', async ({
	request
}) => {
	for (const method of ['GET', 'HEAD']) {
		for (const { path, policy } of publicResources()) {
			const response = await request.fetch(path, { method });
			expect(response.status()).toBe(200);
			expect(response.headers()['cache-control']).toBe(policy);
			expectNoCookies(response);
			if (method === 'HEAD') expect(await response.body()).toHaveLength(0);
		}
	}
	const etag = (await request.get('/feed.xml')).headers()['etag'];
	const unchanged = await request.get('/feed.xml', { headers: { 'if-none-match': etag } });
	expect(unchanged.status()).toBe(304);
	expect(unchanged.headers()['cache-control']).toBe('public, max-age=300');
	expectNoCookies(unchanged);
	expect(await unchanged.body()).toHaveLength(0);
});

test('private HTML and page data stay non-storable and inaccessible to an independent visitor', async ({
	request,
	playwright,
	baseURL
}) => {
	const privateTitle = (await bars.findOne({ slug: apiPrivateSlug }))!.title;
	const routes = [
		{ path: '/admin/reviews', denied: 302, includesReview: true },
		{ path: '/admin/reviews/create', denied: 302, includesReview: false },
		{ path: '/admin/reviews/create/wizard', denied: 302, includesReview: false },
		{ path: `/${apiPrivateSlug}`, denied: 404, includesReview: true },
		{ path: `/${apiPrivateSlug}/edit`, denied: 302, includesReview: true },
		{ path: `/${apiPrivateSlug}/history`, denied: 404, includesReview: true }
	];
	await withWebClient(playwright, baseURL, token, async (client) => {
		for (const { path, denied, includesReview } of routes) {
			for (const suffix of ['', '/__data.json']) {
				const response = await client.get(path + suffix, { maxRedirects: 0 });
				expect(response.status()).toBe(200);
				expectPrivate(response);
				if (includesReview) expect(await response.text()).toContain(privateTitle);
				const anonymous = await request.get(path + suffix, { maxRedirects: 0 });
				expect(anonymous.status()).toBe(suffix ? 200 : denied);
				expect(anonymous.headers()['cache-control']).toContain('no-store');
				const body = await anonymous.text();
				expect(body).not.toContain(privateTitle);
				// Redirects can repeat a requested URL, so assert private review content, not its slug.
				if (!suffix && denied === 302) expect(anonymous.headers()['location']).toBe('/login');
			}
		}
	});
});

test('anonymous HTML is non-storable even when it contains only browser preferences', async ({
	request
}) => {
	for (const path of ['/login', '/about', '/karta', '/statistik', '/installningar']) {
		const response = await request.get(path, {
			headers: { cookie: 'theme=dark; analytics_consent=denied; location_enabled=false' }
		});
		expect(response.status()).toBe(200);
		expectPrivate(response);
		expectNoCookies(response);
	}
	const missing = await request.get(`/missing-cache-page-${runId}`);
	expect(missing.status()).toBe(404);
	expect(missing.headers()['cache-control']).toContain('no-store');
});

test('a login redirect cannot cache its newly issued session cookie', async ({
	request,
	baseURL
}) => {
	const response = await isolatedQuota(loginRateLimits, () =>
		request.post('/login?/login', {
			headers: { origin: new URL(baseURL!).origin, accept: 'text/html' },
			form: { username: publisherUsername, password: publisherPassword },
			maxRedirects: 0
		})
	);
	expect(response.status()).toBe(302);
	expect(response.headers()['location']).toBe('/admin/reviews');
	const sessionId = expectSessionCookie(response);
	sessionIds.push(sessionId);
	expectPrivate(response);
});

test('anonymous image failures keep their non-storable responses', async ({ request }) => {
	for (const [path, status] of [
		[`/images/${legacyImage}?preview=unknown`, 400],
		['/images/000000000000000000000000.png', 404]
	] as const) {
		const response = await request.get(path);
		expect(response.status()).toBe(status);
		expect(response.headers()['cache-control']).toBe('no-store');
		expectNoCookies(response);
	}
});

test('API validators and warmed draft previews still require bearer authentication', async ({
	request
}) => {
	const auth = { authorization: `Bearer ${token}` };
	const path = `/api/v1/reviews/${apiPrivateSlug}`;
	const detail = await request.get(path, { headers: auth });
	expect(detail.status()).toBe(200);
	expect(detail.headers()['cache-control']).toBe('private, no-cache');
	expect(detail.headers()['vary']).toBe('Authorization');
	expectNoCookies(detail);
	const etag = detail.headers()['etag'];
	const unchanged = await request.get(path, { headers: { ...auth, 'if-none-match': etag } });
	expect(unchanged.status()).toBe(304);
	expect(unchanged.headers()['cache-control']).toBe('private, no-cache');
	expect(unchanged.headers()['vary']).toBe('Authorization');
	expect(await unchanged.body()).toHaveLength(0);
	const previewPath = `/api/v1/images/${apiPrivateImage}?preview=card-v1`;
	const preview = await request.get(previewPath, { headers: auth });
	expect(preview.status()).toBe(200);
	expectPrivate(preview);
	const credentials: Record<string, string>[] = [{}, { cookie: `auth_session=${token}` }];
	for (const headers of credentials) {
		for (const target of [path, previewPath]) {
			const denied = await request.get(target, { headers: { ...headers, 'if-none-match': etag } });
			expect(denied.status()).toBe(404);
			expect(denied.headers()['cache-control']).toBe('no-store');
			expect((await denied.json()).code).toBe('not_found');
		}
	}
	await sessions.deleteOne({ _id: token });
	const revoked = await request.get(path, { headers: { ...auth, 'if-none-match': etag } });
	expect(revoked.status()).toBe(404);
	expect(revoked.headers()['cache-control']).toBe('no-store');
	expect((await revoked.json()).code).toBe('not_found');
	expectNoCookies(revoked);
});
