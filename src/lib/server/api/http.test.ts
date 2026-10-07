import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { cachedJsonResponse, ifMatchMatches, readJsonBody } from './http';

const jsonRequest = (body: string, headers: Record<string, string> = {}) =>
	new Request('http://localhost/api/v1/sessions', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body
	});

describe('API JSON body limits', () => {
	it('rejects a declared oversized body before reading it', async () => {
		const request = jsonRequest('{}', { 'content-length': String(16 * 1024 + 1) });
		const read = vi.spyOn(request, 'text');
		const result = await readJsonBody(request, 'SessionCreateRequest');
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('Expected rejection');
		expect(result.response.status).toBe(413);
		expect(await result.response.json()).toMatchObject({ code: 'payload_too_large' });
		expect(read).not.toHaveBeenCalled();
	});

	it.each([undefined, '2'])('counts actual streamed UTF-8 bytes with length %s', async (length) => {
		const cancel = vi.fn();
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new TextEncoder().encode('{"username":"'));
				controller.enqueue(new TextEncoder().encode('ö'.repeat(9000)));
			},
			cancel
		});
		const request = new Request('http://localhost/api/v1/sessions', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(length ? { 'content-length': length } : {})
			},
			body: stream,
			duplex: 'half'
		} as RequestInit);
		const result = await readJsonBody(request, 'SessionCreateRequest');
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('Expected rejection');
		expect(result.response.status).toBe(413);
		expect(result.response.headers.get('connection')).toBe('close');
		expect(cancel).not.toHaveBeenCalled();
	});

	it('accepts a small JSON request including Swedish characters', async () => {
		const value = { username: 'test', password: 'lösenord' };
		expect(await readJsonBody(jsonRequest(JSON.stringify(value)), 'SessionCreateRequest')).toEqual({
			ok: true,
			value
		});
	});

	it.each([
		['{', 'application/json', 400, 'bad_request'],
		['{}', 'text/plain', 415, 'unsupported_media_type'],
		['{"username":12,"password":null}', 'application/json', 422, 'validation_failed']
	])('returns a safe problem for %s', async (body, contentType, status, code) => {
		const result = await readJsonBody(
			jsonRequest(body as string, { 'content-type': contentType as string }),
			'SessionCreateRequest'
		);
		if (result.ok) throw new Error('Expected rejection');
		expect(result.response.status).toBe(status);
		expect(result.response.headers.get('cache-control')).toBe('no-store');
		expect(result.response.headers.get('content-type')).toBe('application/problem+json');
		expect(await result.response.json()).toMatchObject({ code });
	});
});

describe('API update preconditions', () => {
	const tag = '"v1-review-1234"';
	it('accepts a current strong tag within a list', () => {
		expect(ifMatchMatches(`"older", ${tag}`, tag)).toBe(true);
	});
	it.each([null, '*', `*, ${tag}`, `W/${tag}`, '"older"', 'v1-review-1234'])(
		'rejects an update precondition %s',
		(header) => expect(ifMatchMatches(header, tag)).toBe(false)
	);
});

describe('API cache validation', () => {
	it.each(['W/"current"', '*', '"older", W/"current"'])(
		'retains weak cache matching for %s',
		(header) => {
			const event = {
				request: new Request('http://localhost/api/v1/review-metadata', {
					headers: { 'if-none-match': header }
				}),
				locals: { user: null }
			} as unknown as RequestEvent;
			const response = cachedJsonResponse(event, { value: 1 }, { etag: '"current"' });
			expect(response.status).toBe(304);
			expect(response.body).toBeNull();
			expect(response.headers.get('vary')).toBe('Authorization');
		}
	);
});
