import type { RequestEvent } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	dev: false,
	validateSession: vi.fn(),
	createSessionCookie: vi.fn(),
	createBlankSessionCookie: vi.fn()
}));
vi.mock('$app/env', () => ({
	get dev() {
		return mocks.dev;
	}
}));
vi.mock('#lib/db/db.js', () => ({ start_mongo: async () => {} }));
vi.mock('#lib/server/auth.js', () => ({
	lucia: { sessionCookieName: 'auth_session', ...mocks }
}));

import { handle } from './hooks.server';

const origin = 'https://enstorstarkreview.example';
const user = { id: 'editor', username: 'test' };
const session = { id: 'session', fresh: true };
const eventFor = (path: string, headers: HeadersInit = {}, method = 'POST') => {
	const url = new URL(path, origin);
	const cookies = { get: vi.fn(), set: vi.fn() };
	const event = { url, request: new Request(url, { method, headers }), cookies, locals: {} };
	return { event: event as unknown as RequestEvent, cookies };
};

describe('request hook boundaries', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.dev = false;
		mocks.validateSession.mockResolvedValue({ user, session });
		mocks.createSessionCookie.mockReturnValue({
			name: 'auth_session',
			value: 'renewed',
			attributes: { path: '/', httpOnly: true }
		});
		mocks.createBlankSessionCookie.mockReturnValue({
			name: 'auth_session',
			value: '',
			attributes: { path: '/', maxAge: 0 }
		});
	});

	it.each(['application/json', 'text/html'])(
		'rejects foreign web origins before reading or renewing cookies: %s',
		async (accept) => {
			const { event, cookies } = eventFor('/login', {
				origin: 'https://untrusted.example',
				accept
			});
			cookies.get.mockReturnValue('valid-session');
			const resolve = vi.fn();
			const response = await handle({ event, resolve });
			expect(response.status).toBe(403);
			expect(await response.text()).toContain('Förfrågan kunde inte verifieras.');
			expect(response.headers.get('x-frame-options')).toBe('DENY');
			expect(response.headers.has('set-cookie')).toBe(false);
			expect(cookies.get).not.toHaveBeenCalled();
			expect(cookies.set).not.toHaveBeenCalled();
			expect(mocks.validateSession).not.toHaveBeenCalled();
			expect(resolve).not.toHaveBeenCalled();
		}
	);

	it('renews a fresh web session for an accepted origin', async () => {
		const { event, cookies } = eventFor('/login', { origin });
		cookies.get.mockImplementation((name) =>
			name === 'auth_session' ? 'valid-session' : undefined
		);
		const resolve = vi.fn(async () => new Response('page'));
		const response = await handle({ event, resolve });
		expect(response.status).toBe(200);
		expect(event.locals).toEqual({ user, session });
		expect(cookies.set).toHaveBeenCalledWith('auth_session', 'renewed', {
			path: '/',
			httpOnly: true
		});
		expect(response.headers.get('permissions-policy')).toContain('geolocation=(self)');
	});

	it('clears revoked web credentials before resolving an accepted request', async () => {
		mocks.validateSession.mockResolvedValue({ user: null, session: null });
		const { event, cookies } = eventFor('/login', { origin });
		cookies.get.mockImplementation((name) =>
			name === 'auth_session' ? 'revoked-session' : undefined
		);
		const resolve = vi.fn(async () => new Response('page'));
		await handle({ event, resolve });
		expect(event.locals).toEqual({ user: null, session: null });
		expect(cookies.set).toHaveBeenCalledWith('auth_session', '', { path: '/', maxAge: 0 });
	});

	it('accepts bodyless native bearer requests without renewing a web cookie', async () => {
		const { event, cookies } = eventFor(
			'/api/v1/sessions/current',
			{ authorization: 'Bearer native-token' },
			'DELETE'
		);
		const resolve = vi.fn(async () => new Response(null, { status: 204 }));
		const response = await handle({ event, resolve });
		expect(response.status).toBe(204);
		expect(mocks.validateSession).toHaveBeenCalledWith('native-token');
		expect(event.locals).toEqual({ user, session });
		expect(cookies.get).not.toHaveBeenCalledWith('auth_session');
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('does not authenticate cookie-only native requests', async () => {
		const { event, cookies } = eventFor('/api/v1/sessions/current', {}, 'DELETE');
		cookies.get.mockReturnValue('valid-web-cookie');
		const resolve = vi.fn(async () => new Response(null, { status: 401 }));
		await handle({ event, resolve });
		expect(event.locals).toEqual({ user: null, session: null });
		expect(mocks.validateSession).not.toHaveBeenCalled();
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('retains relaxed local development origins', async () => {
		mocks.dev = true;
		const { event } = eventFor('/login');
		const resolve = vi.fn(async () => new Response('page'));
		expect((await handle({ event, resolve })).status).toBe(200);
		expect(resolve).toHaveBeenCalledOnce();
	});
});
