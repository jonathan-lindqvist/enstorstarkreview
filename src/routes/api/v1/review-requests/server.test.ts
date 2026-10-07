import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	ReviewRequestConfigurationError,
	ReviewRequestDeliveryError
} from '$lib/server/review-requests/delivery';

const deps = vi.hoisted(() => ({
	consumeRateLimit: vi.fn(),
	deliver: vi.fn(),
	audit: vi.fn(),
	now: () => new Date('2026-10-07T00:00:00Z')
}));
vi.mock('$lib/server/review-requests/production', () => ({ reviewRequestDependencies: deps }));
vi.mock('$lib/server/request', () => ({ getRequestIp: () => '203.0.113.20' }));

import { POST } from './+server';

const eventFor = (body: string, contentType = 'application/json') =>
	({
		request: new Request('http://localhost/api/v1/review-requests', {
			method: 'POST',
			headers: { 'content-type': contentType },
			body
		}),
		url: new URL('http://localhost/api/v1/review-requests'),
		locals: { user: null, session: null }
	}) as unknown as Parameters<typeof POST>[0];

describe('API review-request admission', () => {
	afterEach(() => vi.restoreAllMocks());
	beforeEach(() => {
		vi.resetAllMocks();
		deps.consumeRateLimit.mockResolvedValue({
			allowed: true,
			retryAfterSeconds: 0,
			remainingAttempts: 4
		});
		deps.deliver.mockResolvedValue('discord');
	});

	it.each([
		['{', 'application/json', 400],
		['{}', 'application/json', 422],
		['{}', 'text/plain', 415],
		['x'.repeat(16 * 1024 + 1), 'application/json', 413]
	])('charges the IP quota before rejecting input (case %#)', async (body, type, status) => {
		const response = await POST(eventFor(body, type));
		expect(response.status).toBe(status);
		expect(deps.consumeRateLimit).toHaveBeenCalledTimes(1);
		expect(deps.consumeRateLimit).toHaveBeenCalledWith('ip', '203.0.113.20', {
			maxAttempts: 5,
			windowMs: 86_400_000
		});
		expect(deps.deliver).not.toHaveBeenCalled();
	});

	it('denies exhausted global delivery quota without sending a request', async () => {
		deps.consumeRateLimit.mockResolvedValueOnce({ allowed: true }).mockResolvedValueOnce({
			allowed: false,
			retryAfterSeconds: 300
		});
		const response = await POST(eventFor('{"barName":"Bar Himmel","location":"Göteborg"}'));
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('300');
		expect(deps.consumeRateLimit.mock.calls.map(([scope]) => scope)).toEqual(['ip', 'global']);
		expect(deps.deliver).not.toHaveBeenCalled();
	});

	it.each([
		[new ReviewRequestConfigurationError('missing secret'), 503],
		[new ReviewRequestDeliveryError('upstream secret'), 502]
	])('maps delivery failure to a safe API problem (case %#)', async (error, status) => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		deps.deliver.mockRejectedValueOnce(error);
		const response = await POST(eventFor('{"barName":"Bar Himmel","location":"Göteborg"}'));
		expect(response.status).toBe(status);
		const body = await response.json();
		expect(body).toMatchObject({ code: 'service_unavailable' });
		expect(JSON.stringify(body)).not.toContain('secret');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(deps.audit).not.toHaveBeenCalledWith(expect.objectContaining({ outcome: 'success' }));
	});

	it('returns Retry-After before reading a blocked request', async () => {
		deps.consumeRateLimit.mockResolvedValueOnce({
			allowed: false,
			retryAfterSeconds: 123,
			remainingAttempts: 0
		});
		const event = eventFor('{');
		const response = await POST(event);
		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('123');
		expect(event.request.bodyUsed).toBe(false);
		expect(deps.deliver).not.toHaveBeenCalled();
	});

	it('charges IP and delivery limits once each for an accepted request', async () => {
		const response = await POST(eventFor('{"barName":"Bar Himmel","location":"Göteborg"}'));
		expect(response.status).toBe(202);
		expect(deps.consumeRateLimit.mock.calls.map(([scope]) => scope)).toEqual(['ip', 'global']);
		expect(deps.deliver).toHaveBeenCalledTimes(1);
	});

	it('fails closed before reading the body when the IP limiter fails', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		deps.consumeRateLimit.mockRejectedValueOnce(new Error('database secret'));
		const event = eventFor('{"barName":"Bar Himmel","location":"Göteborg"}');
		const response = await POST(event);
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ code: 'service_unavailable' });
		expect(event.request.bodyUsed).toBe(false);
		expect(deps.deliver).not.toHaveBeenCalled();
		error.mockRestore();
	});
});
