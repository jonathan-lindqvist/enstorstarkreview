import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({
	consumeRateLimit: vi.fn(),
	clearRateLimit: vi.fn(),
	verifyCredentials: vi.fn(),
	createSession: vi.fn(),
	audit: vi.fn()
}));
vi.mock('$lib/server/login/production', () => ({ loginDependencies: deps }));
vi.mock('$lib/server/request', () => ({ getRequestIp: () => '203.0.113.10' }));

import { POST } from './+server';

const eventFor = (body: string, contentType = 'application/json') =>
	({
		request: new Request('http://localhost/api/v1/sessions', {
			method: 'POST',
			headers: { 'content-type': contentType },
			body
		}),
		url: new URL('http://localhost/api/v1/sessions'),
		locals: { user: null, session: null }
	}) as unknown as Parameters<typeof POST>[0];

describe('API login admission', () => {
	afterEach(() => vi.restoreAllMocks());
	beforeEach(() => {
		vi.resetAllMocks();
		deps.consumeRateLimit.mockResolvedValue({
			allowed: true,
			retryAfterSeconds: 0,
			remainingAttempts: 7
		});
		deps.verifyCredentials.mockResolvedValue({
			ok: true,
			user: { _id: 'user-id', username: 'test' }
		});
		deps.createSession.mockResolvedValue({ id: 'secret-token', expiresAt: new Date(2030, 0) });
	});

	it.each([
		['{', 'application/json', 400],
		['{}', 'application/json', 422],
		['{}', 'text/plain', 415],
		['x'.repeat(16 * 1024 + 1), 'application/json', 413]
	])(
		'charges the IP quota before rejecting invalid input (case %#)',
		async (body, type, status) => {
			const response = await POST(eventFor(body, type));
			expect(response.status).toBe(status);
			expect(deps.consumeRateLimit).toHaveBeenCalledExactlyOnceWith('ip', '203.0.113.10');
			expect(deps.verifyCredentials).not.toHaveBeenCalled();
			expect(deps.createSession).not.toHaveBeenCalled();
		}
	);

	it('denies a blocked username before credential verification', async () => {
		deps.consumeRateLimit.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({
			allowed: false,
			retryAfterSeconds: 80
		});
		const response = await POST(eventFor('{"username":"test","password":"testpass123"}'));
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('80');
		expect(deps.consumeRateLimit.mock.calls).toEqual([
			['ip', '203.0.113.10'],
			['username', 'test']
		]);
		expect(deps.verifyCredentials).not.toHaveBeenCalled();
		expect(deps.createSession).not.toHaveBeenCalled();
	});

	it('returns a safe credential failure without clearing quotas or creating a session', async () => {
		deps.verifyCredentials.mockResolvedValueOnce({
			ok: false,
			reason: 'password_mismatch',
			message: 'Fel användarnamn eller lösenord'
		});
		const response = await POST(eventFor('{"username":"test","password":"wrongpass"}'));
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ code: 'invalid_credentials' });
		expect(response.headers.get('set-cookie')).toBeNull();
		expect(deps.clearRateLimit).not.toHaveBeenCalled();
		expect(deps.createSession).not.toHaveBeenCalled();
		expect(JSON.stringify(deps.audit.mock.calls)).not.toContain('wrongpass');
	});

	it('rejects a blocked IP without consuming or parsing the body', async () => {
		deps.consumeRateLimit.mockResolvedValueOnce({
			allowed: false,
			retryAfterSeconds: 900,
			remainingAttempts: 0
		});
		const event = eventFor('{');
		const response = await POST(event);
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('900');
		expect(await response.json()).toMatchObject({ code: 'rate_limited' });
		expect(event.request.bodyUsed).toBe(false);
		expect(deps.verifyCredentials).not.toHaveBeenCalled();
		expect(deps.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				outcome: 'rate_limited',
				details: { channel: 'api', retryAfterSeconds: 900 }
			})
		);
	});

	it('charges a valid request once per scope and never sets a web cookie', async () => {
		const response = await POST(eventFor('{"username":"test","password":"testpass123"}'));
		expect(response.status).toBe(201);
		expect(deps.consumeRateLimit.mock.calls).toEqual([
			['ip', '203.0.113.10'],
			['username', 'test']
		]);
		expect(response.headers.get('set-cookie')).toBeNull();
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(JSON.stringify(deps.audit.mock.calls)).not.toContain('testpass123');
		expect(JSON.stringify(deps.audit.mock.calls)).not.toContain('secret-token');
	});

	it('fails closed when the IP limiter is unavailable', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		deps.consumeRateLimit.mockRejectedValueOnce(new Error('database secret'));
		const event = eventFor('{"username":"test","password":"testpass123"}');
		const response = await POST(event);
		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({ code: 'internal_error' });
		expect(event.request.bodyUsed).toBe(false);
		expect(deps.verifyCredentials).not.toHaveBeenCalled();
		error.mockRestore();
	});
});
