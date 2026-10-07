import { createHash } from 'crypto';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import {
	getRequestBodyLimit,
	validateAgainstSchema,
	type ApiRequestSchemaName,
	type ApiSchemas
} from './openapi';
import { internalErrorProblem, problem, unauthorizedProblem, validationProblem } from './problem';

type ApiUser = NonNullable<App.Locals['user']>;

/** Wraps an API handler so unexpected errors become a problem response instead of HTML. */
export const apiHandler =
	(handler: (event: RequestEvent) => Promise<Response>): RequestHandler =>
	async (event) => {
		try {
			return await handler(event);
		} catch (err) {
			console.error(`API ${event.request.method} ${event.url.pathname} failed:`, err);
			return internalErrorProblem();
		}
	};

/** Returns the bearer-authenticated user, or a 401 problem response. */
export const requireUser = (event: RequestEvent): ApiUser | Response =>
	event.locals.user ?? unauthorizedProblem();

const getErrorStatus = (err: unknown): number | undefined =>
	typeof err === 'object' && err !== null && 'status' in err
		? Number((err as { status: unknown }).status)
		: undefined;

export type BodyResult<T> = { ok: true; value: T } | { ok: false; response: Response };

/** Reads a JSON body and validates it against a request schema from the contract. */
export const readJsonBody = async <Name extends ApiRequestSchemaName>(
	request: Request,
	schema: Name
): Promise<BodyResult<ApiSchemas[Name]>> => {
	const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
	if (contentType !== 'application/json') {
		return {
			ok: false,
			response: problem(415, 'unsupported_media_type', 'Förfrågan måste skickas som JSON.')
		};
	}

	const maxBytes = getRequestBodyLimit(schema);
	const tooLarge = () => ({
		ok: false as const,
		response: problem(413, 'payload_too_large', 'Förfrågan är för stor.', {
			headers: { connection: 'close' }
		})
	});
	const declaredBytes = Number(request.headers.get('content-length'));
	if (declaredBytes > maxBytes) return tooLarge();

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
				if (bytesRead > maxBytes) {
					// adapter-node's cancel destroys the incoming socket before it can send 413.
					// Stop reading and close the HTTP/1 connection after the response instead.
					return tooLarge();
				}
				parts.push(decoder.decode(value, { stream: true }));
			}
			parts.push(decoder.decode());
			text = parts.join('');
		}
	} catch (err) {
		// adapter-node rejects bodies above BODY_SIZE_LIMIT with a 413 error.
		if (getErrorStatus(err) === 413) {
			return tooLarge();
		}
		throw err;
	} finally {
		reader?.releaseLock();
	}

	let body: unknown;
	try {
		body = JSON.parse(text);
	} catch {
		return { ok: false, response: problem(400, 'bad_request', 'Förfrågan är inte giltig JSON.') };
	}

	const validation = validateAgainstSchema(schema, body);
	return validation.ok
		? { ok: true, value: validation.value }
		: { ok: false, response: validationProblem(validation.errors) };
};

export const jsonResponse = (
	body: unknown,
	init: { status?: number; headers?: Record<string, string> } = {}
): Response =>
	new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		headers: {
			'content-type': 'application/json',
			'cache-control': 'no-store',
			...init.headers
		}
	});

export const contentETag = (serializedBody: string): string =>
	`"${createHash('sha256').update(serializedBody).digest('base64url').slice(0, 32)}"`;

const normalizeETag = (value: string) => value.trim().replace(/^W\//, '');

/** Weak comparison for GET cache validation; wildcards match an existing representation. */
export const ifNoneMatchMatches = (header: string | null, etag: string): boolean => {
	if (!header) return false;
	const target = normalizeETag(etag);
	return header.split(',').some((candidate) => {
		const value = normalizeETag(candidate);
		return value === '*' || value === target;
	});
};

/** Updates require an explicit current strong tag; wildcard updates are deliberately forbidden. */
export const ifMatchMatches = (header: string | null, etag: string): boolean => {
	if (!header || etag.startsWith('W/')) return false;
	const candidates = header.split(',').map((value) => value.trim());
	if (candidates.includes('*')) return false;
	return candidates.some((value) => value === etag);
};

/**
 * A revalidatable JSON response. Anonymous and authenticated responses can differ (drafts),
 * so they vary on Authorization and authenticated responses stay private.
 */
export const cachedJsonResponse = (
	event: RequestEvent,
	body: unknown,
	options: { etag?: string } = {}
): Response => {
	const serialized = JSON.stringify(body);
	const etag = options.etag ?? contentETag(serialized);
	const headers = {
		etag,
		vary: 'Authorization',
		'cache-control': event.locals.user ? 'private, no-cache' : 'no-cache'
	};

	if (ifNoneMatchMatches(event.request.headers.get('if-none-match'), etag)) {
		return new Response(null, { status: 304, headers });
	}

	return new Response(serialized, {
		status: 200,
		headers: { 'content-type': 'application/json', ...headers }
	});
};
