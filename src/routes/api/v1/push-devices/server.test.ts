import { beforeEach, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({
	upsertDevice: vi.fn(),
	removeDevice: vi.fn(),
	consumeRateLimit: vi.fn(),
	audit: vi.fn(),
	now: () => new Date('2026-11-09T12:00:00Z')
}));
vi.mock('$lib/server/push/production', () => ({ pushDeviceDependencies: deps }));
vi.mock('$lib/server/request', () => ({ getRequestIp: () => '203.0.113.30' }));

import { getSchemaValidator } from '$lib/server/api/openapi';
import { PUT } from './+server';
import { POST } from './removal/+server';

const IOS_TOKEN = 'ab'.repeat(32);
const ANDROID_TOKEN = 'fcm:' + 'x'.repeat(150);

type Handler = typeof PUT;
const eventFor = (
	method: 'PUT' | 'POST',
	body: string,
	options: { contentType?: string; authorization?: string; user?: { username: string } } = {}
) => {
	const path = method === 'PUT' ? '/api/v1/push-devices' : '/api/v1/push-devices/removal';
	const headers: Record<string, string> = {
		'content-type': options.contentType ?? 'application/json'
	};
	if (options.authorization) headers.authorization = options.authorization;
	return {
		request: new Request(`http://localhost${path}`, { method, headers, body }),
		url: new URL(`http://localhost${path}`),
		locals: options.user
			? { user: { id: 'u1', ...options.user }, session: { id: 's1' } }
			: { user: null, session: null }
	} as unknown as Parameters<Handler>[0];
};

const register = (body: unknown, options?: Parameters<typeof eventFor>[2]) =>
	PUT(eventFor('PUT', JSON.stringify(body), options));

beforeEach(() => {
	vi.resetAllMocks();
	deps.consumeRateLimit.mockResolvedValue({
		allowed: true,
		retryAfterSeconds: 0,
		remainingAttempts: 59
	});
	deps.upsertDevice.mockResolvedValue(undefined);
	deps.removeDevice.mockResolvedValue(undefined);
});

describe('PUT /api/v1/push-devices', () => {
	it('registers an anonymous Android device', async () => {
		const response = await register({ platform: 'android', token: ANDROID_TOKEN });
		expect(response.status).toBe(204);
		expect(deps.upsertDevice).toHaveBeenCalledWith(
			{ token: ANDROID_TOKEN, platform: 'android', apnsEnvironment: null, username: null },
			expect.any(Date)
		);
	});

	it('ties a device to the signed-in user', async () => {
		const response = await register(
			{ platform: 'ios', token: IOS_TOKEN, apnsEnvironment: 'production' },
			{ authorization: 'Bearer valid', user: { username: 'alice' } }
		);
		expect(response.status).toBe(204);
		expect(deps.upsertDevice).toHaveBeenCalledWith(
			expect.objectContaining({ username: 'alice', apnsEnvironment: 'production' }),
			expect.any(Date)
		);
	});

	it('rejects an invalid or expired token instead of registering anonymously', async () => {
		const response = await register(
			{ platform: 'android', token: ANDROID_TOKEN },
			{ authorization: 'Bearer expired' }
		);
		expect(response.status).toBe(401);
		expect((await response.json()).code).toBe('unauthorized');
		expect(deps.consumeRateLimit).toHaveBeenCalledTimes(1);
		expect(deps.upsertDevice).not.toHaveBeenCalled();
	});

	it('rejects an iOS device without an APNs environment at its field', async () => {
		const response = await register({ platform: 'ios', token: IOS_TOKEN });
		expect(response.status).toBe(422);
		const problem = await response.json();
		expect(problem).toMatchObject({
			code: 'validation_failed',
			errors: [{ pointer: '/apnsEnvironment' }]
		});
		expect(getSchemaValidator('Problem')(problem)).toBe(true);
		expect(deps.upsertDevice).not.toHaveBeenCalled();
	});

	it('maps a storage failure to 503', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		deps.upsertDevice.mockRejectedValueOnce(new Error('mongo down'));
		const response = await register({ platform: 'android', token: ANDROID_TOKEN });
		expect(response.status).toBe(503);
		expect((await response.json()).code).toBe('service_unavailable');
		vi.restoreAllMocks();
	});
});

describe('POST /api/v1/push-devices/removal', () => {
	it('removes a device and answers 204', async () => {
		const response = await POST(eventFor('POST', JSON.stringify({ token: ANDROID_TOKEN })));
		expect(response.status).toBe(204);
		expect(deps.removeDevice).toHaveBeenCalledWith([ANDROID_TOKEN]);
	});
});

describe.each([
	['PUT', PUT],
	['POST', POST]
] as const)('%s push-device admission', (method, handler) => {
	it.each([
		['{', 'application/json', 400],
		['{}', 'application/json', 422],
		['{"token":"short"}', 'application/json', 422],
		[`{"token":"${'x'.repeat(1025)}","platform":"android"}`, 'application/json', 422],
		['{}', 'text/plain', 415],
		['x'.repeat(4097), 'application/json', 413]
	])('charges the IP quota before rejecting input (case %#)', async (body, type, status) => {
		const response = await handler(eventFor(method, body, { contentType: type }));
		expect(response.status).toBe(status);
		expect(deps.consumeRateLimit).toHaveBeenCalledTimes(1);
		expect(deps.consumeRateLimit).toHaveBeenCalledWith('push_device_ip', '203.0.113.30', {
			maxAttempts: 60,
			windowMs: 3_600_000
		});
		expect(deps.upsertDevice).not.toHaveBeenCalled();
		expect(deps.removeDevice).not.toHaveBeenCalled();
	});

	it('denies an exhausted quota without reading the body', async () => {
		deps.consumeRateLimit.mockResolvedValueOnce({
			allowed: false,
			retryAfterSeconds: 900,
			remainingAttempts: 0
		});
		const response = await handler(eventFor(method, '{'));
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('900');
		const problem = await response.json();
		expect(problem.code).toBe('rate_limited');
		expect(getSchemaValidator('Problem')(problem)).toBe(true);
		expect(deps.upsertDevice).not.toHaveBeenCalled();
		expect(deps.removeDevice).not.toHaveBeenCalled();
	});
});
