import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { isProcedureError } from './errors';
import { apiInput, jsonBody, parseBodyValue, readJsonBody, RequestBody, WebForm } from './input';
import { ReviewCreateRequest, SessionCreateRequest, SMALL_BODY_BYTES } from './schemas';

const jsonRequest = (body: BodyInit, headers: Record<string, string> = {}) =>
	new Request('http://localhost/api/v1/sessions', {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...headers },
		body,
		duplex: 'half'
	} as RequestInit);

const rejection = async (promise: Promise<unknown> | (() => unknown)) => {
	try {
		await (typeof promise === 'function' ? promise() : promise);
	} catch (error) {
		if (isProcedureError(error)) return error;
		throw error;
	}
	throw new Error('Expected rejection');
};

describe('JSON body budget', () => {
	it('rejects a declared oversized body before reading it', async () => {
		const request = jsonRequest('{}', { 'content-length': String(SMALL_BODY_BYTES + 1) });
		const read = vi.spyOn(request, 'text');

		const error = await rejection(readJsonBody(request, SMALL_BODY_BYTES));

		expect(error).toMatchObject({ status: 413, code: 'payload_too_large' });
		expect(error.data?.headers).toEqual({ connection: 'close' });
		expect(read).not.toHaveBeenCalled();
	});

	it.each([undefined, '2'])(
		'counts streamed UTF-8 bytes with declared length %s',
		async (length) => {
			const cancel = vi.fn();
			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('{"username":"'));
					controller.enqueue(new TextEncoder().encode('ö'.repeat(9000)));
				},
				cancel
			});
			const request = jsonRequest(stream, length ? { 'content-length': length } : {});

			const error = await rejection(readJsonBody(request, SMALL_BODY_BYTES));

			expect(error).toMatchObject({ status: 413, data: { headers: { connection: 'close' } } });
			expect(cancel).not.toHaveBeenCalled();
		}
	);

	it('maps an adapter body-size rejection to the same problem', async () => {
		const stream = new ReadableStream<Uint8Array>({
			pull: () => Promise.reject(Object.assign(new Error('too large'), { status: 413 }))
		});
		const error = await rejection(readJsonBody(jsonRequest(stream), SMALL_BODY_BYTES));
		expect(error.code).toBe('payload_too_large');
	});

	it('accepts small JSON with Swedish characters and a charset parameter', async () => {
		const value = { username: 'test', password: 'lösenord' };
		const request = jsonRequest(JSON.stringify(value), {
			'content-type': 'Application/JSON; charset=utf-8'
		});
		expect(await readJsonBody(request, SMALL_BODY_BYTES)).toEqual(value);
	});

	it.each([
		['{', 'application/json', 400, 'bad_request'],
		['{}', 'text/plain', 415, 'unsupported_media_type']
	])('rejects %s as %s', async (body, contentType, status, code) => {
		const error = await rejection(
			readJsonBody(jsonRequest(body, { 'content-type': contentType }), SMALL_BODY_BYTES)
		);
		expect(error).toMatchObject({ status, code });
	});
});

describe('untrusted body validation', () => {
	it('stops at the first unknown field instead of reporting every extra field', async () => {
		const value = {
			username: 'test',
			password: 'testpass123',
			...Object.fromEntries(Array.from({ length: 1000 }, (_, index) => [`extra${index}`, index]))
		};
		const error = await rejection(() => parseBodyValue(SessionCreateRequest, value));

		expect(error).toMatchObject({ status: 422, code: 'validation_failed' });
		expect(error.data?.errors).toEqual([{ pointer: '/extra0', detail: 'Fältet är okänt' }]);
	});

	it.each([
		[{ username: 12, password: 'x' }, '/username', 'Fältet har fel typ'],
		[{ password: 'x' }, '/username', 'Fältet saknas'],
		[{ username: 'x'.repeat(257), password: 'x' }, '/username', 'Värdet är för långt']
	])('reports %j at %s in Swedish', async (value, pointer, detail) => {
		const error = await rejection(() => parseBodyValue(SessionCreateRequest, value));
		expect(error.data?.errors).toEqual([{ pointer, detail }]);
	});

	it('rejects unknown review fields before the closed intersection strips them', async () => {
		const error = await rejection(() => parseBodyValue(ReviewCreateRequest, { unknown: 1 }));
		expect(error.data?.errors?.[0]).toEqual({ pointer: '/unknown', detail: 'Fältet är okänt' });
	});
});

describe('apiInput', () => {
	const schema = apiInput({
		params: z.object({ slug: z.string() }),
		body: jsonBody(SessionCreateRequest, { webForm: true })
	});
	const validate = (value: unknown) => schema['~standard'].validate(value);

	it('rejects invalid path parameters as a bad request', async () => {
		const error = await rejection(validate({ params: { slug: 1 }, body: {} }) as Promise<unknown>);
		expect(error).toMatchObject({ status: 400, code: 'bad_request' });
	});

	it('reads an API body only during validation', async () => {
		const request = jsonRequest(JSON.stringify({ username: 'a', password: 'b' }));
		const body = new RequestBody(request);
		expect(request.bodyUsed).toBe(false);

		await expect(validate({ params: { slug: 's' }, body })).resolves.toEqual({
			value: { params: { slug: 's' }, body: { username: 'a', password: 'b' } }
		});
	});

	it('passes a web form through unread for procedures that accept one', async () => {
		const read = vi.fn();
		const form = new WebForm(read);
		const result = (await validate({ params: { slug: 's' }, body: form })) as {
			value: { body: unknown };
		};
		expect(result.value.body).toBe(form);
		expect(read).not.toHaveBeenCalled();
	});

	it('reads a web form once', async () => {
		const data = new FormData();
		const read = vi.fn(async () => data);
		const form = new WebForm(read);
		expect(await form.read()).toBe(data);
		expect(await form.read()).toBe(data);
		expect(read).toHaveBeenCalledTimes(1);
		expect(await WebForm.of(data).read()).toBe(data);
	});

	it('requires a byte budget on every JSON request schema', () => {
		expect(() => jsonBody(z.object({}))).toThrow(/x-max-body-bytes/);
	});
});
