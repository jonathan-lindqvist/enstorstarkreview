import type { z } from 'zod';
import type { Schema } from '@orpc/server';
import { JSON_SCHEMA_REGISTRY } from '@orpc/zod/zod4';
import type { ApiFieldError } from './schemas';
import { InvalidBodyError, problem } from './errors';

/**
 * Procedure input in oRPC's "detailed" structure: `{ params, query, headers, body }`.
 *
 * oRPC decodes a request body before any middleware runs. The contract needs the opposite order:
 * authenticate or consume the anonymous IP quota first, require `If-Match`, then read at most the
 * endpoint's byte budget, and only then parse JSON. So the API door hands procedures a lazy
 * `RequestBody`, and this input schema reads it during oRPC's input validation step, which runs
 * after the middleware that a procedure declares before `.input()`.
 */

/** The unread body of an API request; only `apiInput` reads it, within its byte budget. */
export class RequestBody {
	constructor(readonly request: Request) {}
}

/**
 * A web form body, read lazily so the procedure can authenticate before parsing multipart data.
 * Only server-side callers can pass one; the API door only produces `RequestBody`.
 */
export class WebForm {
	#read: () => Promise<FormData>;
	#data: Promise<FormData> | undefined;

	constructor(read: () => Promise<FormData>) {
		this.#read = read;
	}

	static fromRequest(request: Pick<Request, 'formData'>): WebForm {
		return new WebForm(() => request.formData());
	}

	static of(data: FormData): WebForm {
		return new WebForm(async () => data);
	}

	read(): Promise<FormData> {
		this.#data ??= this.#read();
		return this.#data;
	}
}

interface BodySpec<TSchema extends z.ZodType, TWebForm extends boolean> {
	schema: TSchema;
	/** Published as `x-max-body-bytes` on the schema and enforced on streamed bytes. */
	maxBytes: number;
	/** Whether the web door may pass its own form instead of JSON. */
	webForm: TWebForm;
}

interface InputParts {
	params?: z.ZodType;
	query?: z.ZodType;
	headers?: z.ZodType;
	body?: BodySpec<z.ZodType, boolean>;
}

type WebFormOf<B> = B extends { webForm: true } ? WebForm : never;
type BodyIn<B> = B extends BodySpec<infer S, boolean> ? z.input<S> | WebFormOf<B> : never;
type BodyOut<B> = B extends BodySpec<infer S, boolean> ? z.output<S> | WebFormOf<B> : never;

type PartsIn<P extends InputParts> = (P['params'] extends z.ZodType
	? { params: z.input<P['params']> }
	: unknown) &
	(P['query'] extends z.ZodType ? { query?: z.input<P['query']> } : unknown) &
	(P['headers'] extends z.ZodType ? { headers: z.input<P['headers']> } : unknown) &
	(P['body'] extends BodySpec<z.ZodType, boolean> ? { body: BodyIn<P['body']> } : unknown);

type PartsOut<P extends InputParts> = (P['params'] extends z.ZodType
	? { params: z.output<P['params']> }
	: unknown) &
	(P['query'] extends z.ZodType ? { query: z.output<P['query']> } : unknown) &
	(P['headers'] extends z.ZodType ? { headers: z.output<P['headers']> } : unknown) &
	(P['body'] extends BodySpec<z.ZodType, boolean> ? { body: BodyOut<P['body']> } : unknown);

/** Parts and body specs of every `apiInput` schema, for the OpenAPI generator. */
export const apiInputParts = new WeakMap<object, InputParts>();

const BAD_REQUEST = 'Ogiltig förfrågan.';

/** Structural errors mean a client bug, so short generic Swedish messages are enough. */
const fieldErrorDetail = (issue: z.core.$ZodRawIssue): string => {
	switch (issue.code) {
		case 'invalid_type':
			return issue.input === undefined ? 'Fältet saknas' : 'Fältet har fel typ';
		case 'unrecognized_keys':
			return 'Fältet är okänt';
		case 'too_small':
			if (issue.origin === 'string') return 'Fältet får inte vara tomt';
			if (issue.origin === 'array') return 'Välj minst ett värde';
			return 'Värdet är utanför det tillåtna intervallet';
		case 'too_big':
			if (issue.origin === 'string') return 'Värdet är för långt';
			if (issue.origin === 'array') return 'Värdet är ogiltigt';
			return 'Värdet är utanför det tillåtna intervallet';
		case 'invalid_value':
			return 'Värdet är inte tillåtet';
		default:
			return 'Värdet är ogiltigt';
	}
};

const escapePointerToken = (token: PropertyKey) =>
	String(token).replace(/~/g, '~0').replace(/\//g, '~1');

/** Converts the first Zod issue to a JSON Pointer error into the request body. */
export const toFieldError = (issue: z.core.$ZodIssue): ApiFieldError => {
	const path = [...issue.path];
	if (issue.code === 'unrecognized_keys' && issue.keys[0] !== undefined) path.push(issue.keys[0]);
	return {
		pointer: path.map((token) => `/${escapePointerToken(token)}`).join(''),
		detail: issue.message
	};
};

/** Validation fails at its first issue, like the earlier fail-fast contract validation. */
export const parseBodyValue = <T extends z.ZodType>(schema: T, value: unknown): z.output<T> => {
	const result = schema.safeParse(value, { error: fieldErrorDetail });
	if (result.success) return result.data;
	throw problem(
		'validation_failed',
		'Kontrollera fälten.',
		{ errors: [toFieldError(result.error.issues[0])] },
		{ cause: new InvalidBodyError() }
	);
};

const getErrorStatus = (err: unknown): number | undefined =>
	typeof err === 'object' && err !== null && 'status' in err
		? Number((err as { status: unknown }).status)
		: undefined;

const invalidBody = (...args: Parameters<typeof problem>) =>
	problem(args[0], args[1], args[2], { ...args[3], cause: new InvalidBodyError() });

const tooLarge = () =>
	// adapter-node's cancel destroys the incoming socket before it can send 413. Stop reading
	// and close the HTTP/1 connection after the response instead.
	invalidBody('payload_too_large', 'Förfrågan är för stor.', {
		headers: { connection: 'close' }
	});

/**
 * Reads a JSON request body: media type first, then at most `maxBytes` of actually streamed
 * bytes (a declared or understated `Content-Length` changes nothing), then `JSON.parse`.
 */
export const readJsonBody = async (request: Request, maxBytes: number): Promise<unknown> => {
	const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
	if (contentType !== 'application/json') {
		throw invalidBody('unsupported_media_type', 'Förfrågan måste skickas som JSON.');
	}
	if (Number(request.headers.get('content-length')) > maxBytes) throw tooLarge();

	let text = '';
	const reader = request.body?.getReader();
	try {
		if (reader) {
			const decoder = new TextDecoder();
			const parts: string[] = [];
			let bytesRead = 0;
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				bytesRead += value.byteLength;
				if (bytesRead > maxBytes) throw tooLarge();
				parts.push(decoder.decode(value, { stream: true }));
			}
			parts.push(decoder.decode());
			text = parts.join('');
		}
	} catch (err) {
		// adapter-node rejects bodies above BODY_SIZE_LIMIT with a 413 error.
		if (getErrorStatus(err) === 413) throw tooLarge();
		throw err;
	} finally {
		reader?.releaseLock();
	}

	try {
		return JSON.parse(text);
	} catch {
		throw invalidBody('bad_request', 'Förfrågan är inte giltig JSON.');
	}
};

const parseRequestPart = (schema: z.ZodType, value: unknown) => {
	const result = schema.safeParse(value ?? {}, { error: () => BAD_REQUEST });
	if (result.success) return result.data;
	throw problem('bad_request', result.error.issues[0]?.message ?? BAD_REQUEST);
};

/**
 * Builds a procedure input schema. Path, query and header parts are validated with Zod (invalid
 * values are 400 `bad_request`); a body is read and validated as described above.
 */
export const apiInput = <const P extends InputParts>(parts: P): Schema<PartsIn<P>, PartsOut<P>> => {
	const schema: Schema<PartsIn<P>, PartsOut<P>> = {
		'~standard': {
			vendor: 'enstorstark-input',
			version: 1,
			validate: async (raw) => {
				const input = (raw ?? {}) as Record<string, unknown>;
				const value: Record<string, unknown> = {};
				for (const part of ['params', 'query', 'headers'] as const) {
					const partSchema = parts[part];
					if (partSchema) value[part] = parseRequestPart(partSchema, input[part]);
				}
				if (parts.body) {
					const { schema: bodySchema, maxBytes, webForm } = parts.body;
					const body = input.body;
					if (body instanceof WebForm && webForm) {
						value.body = body;
					} else {
						const json =
							body instanceof RequestBody ? await readJsonBody(body.request, maxBytes) : body;
						value.body = parseBodyValue(bodySchema, json);
					}
				}
				return { value: value as PartsOut<P> };
			}
		}
	};
	apiInputParts.set(schema, parts);
	return schema;
};

/** The budget published on a request schema as `x-max-body-bytes`; every JSON body has one. */
export const getRequestBodyLimit = (schema: z.ZodType): number => {
	const limit = (JSON_SCHEMA_REGISTRY.get(schema) as Record<string, unknown> | undefined)?.[
		'x-max-body-bytes'
	];
	if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit <= 0) {
		throw new Error('A JSON request schema needs an x-max-body-bytes budget');
	}
	return limit;
};

/** A JSON body part: the schema (with its byte budget) and whether web forms may be passed. */
export const jsonBody = <S extends z.ZodType, const W extends boolean = false>(
	schema: S,
	options: { webForm?: W } = {}
): BodySpec<S, W> => ({
	schema,
	maxBytes: getRequestBodyLimit(schema),
	webForm: (options.webForm ?? false) as W
});
