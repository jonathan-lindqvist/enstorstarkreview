import { describe, expect, it } from 'vitest';
import { isForbiddenWebOrigin } from './request-origin';

const origin = 'https://enstorstarkreview.example';
const forbidden = (method: string, path: string, headers: HeadersInit = {}) => {
	const url = new URL(path, origin);
	return isForbiddenWebOrigin(new Request(url, { method, headers }), url);
};

describe('web request origin policy', () => {
	it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
		'rejects cross-origin and missing-origin web %s requests',
		(method) => {
			expect(forbidden(method, '/login', { origin: 'https://untrusted.example' })).toBe(true);
			expect(forbidden(method, '/karta/next-marker')).toBe(true);
			expect(forbidden(method, '/about', { origin: 'null' })).toBe(true);
			expect(forbidden(method, '/login', { origin })).toBe(false);
		}
	);

	it.each(['application/json', 'text/plain', 'application/x-www-form-urlencoded'])(
		'rejects cross-origin web writes regardless of content type: %s',
		(contentType) => {
			expect(
				forbidden('POST', '/about', {
					origin: 'https://untrusted.example',
					'content-type': contentType
				})
			).toBe(true);
		}
	);

	it.each(['GET', 'HEAD', 'OPTIONS'])('allows safe web methods: %s', (method) => {
		expect(forbidden(method, '/about')).toBe(false);
	});

	it.each(['/api/v1/sessions/current', '/api/v1/map/geocoding'])(
		'leaves native API access to bearer authentication: %s',
		(path) => {
			expect(forbidden('DELETE', path)).toBe(false);
			expect(forbidden('POST', path, { origin: 'https://untrusted.example' })).toBe(false);
		}
	);

	it('does not exempt paths that only resemble the API prefix', () => {
		expect(forbidden('POST', '/api')).toBe(true);
		expect(forbidden('POST', '/api-other')).toBe(true);
	});
});
