import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRequestIp } from './request';

const makeEvent = (headers: Record<string, string>, getClientAddress: () => string) => {
	return {
		request: {
			headers: new Headers(headers)
		},
		getClientAddress
	} as Parameters<typeof getRequestIp>[0];
};

describe('getRequestIp', () => {
	beforeEach(() => {
		vi.unstubAllEnvs();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('defaults to getClientAddress when TRUST_PROXY is not enabled', () => {
		const event = makeEvent({ 'x-forwarded-for': '203.0.113.4, 70.41.3.18' }, () => '127.0.0.1');
		expect(getRequestIp(event)).toBe('127.0.0.1');
	});

	it('uses x-forwarded-for first when TRUST_PROXY=true', () => {
		vi.stubEnv('TRUST_PROXY', 'true');
		const event = makeEvent({ 'x-forwarded-for': '203.0.113.4, 70.41.3.18' }, () => '127.0.0.1');
		expect(getRequestIp(event)).toBe('203.0.113.4');
	});

	it('falls back to x-real-ip when TRUST_PROXY=true and x-forwarded-for is missing', () => {
		vi.stubEnv('TRUST_PROXY', 'true');
		const event = makeEvent({ 'x-real-ip': '198.51.100.2' }, () => '127.0.0.1');
		expect(getRequestIp(event)).toBe('198.51.100.2');
	});

	it('falls back to getClientAddress when no trusted proxy header exists', () => {
		const event = makeEvent({}, () => '192.0.2.12');
		expect(getRequestIp(event)).toBe('192.0.2.12');
	});

	it('returns unknown when client address throws', () => {
		const event = makeEvent({}, () => {
			throw new Error('no address');
		});
		expect(getRequestIp(event)).toBe('unknown');
	});
});
