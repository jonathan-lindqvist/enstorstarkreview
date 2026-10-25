import type { RequestEvent } from '@sveltejs/kit';
import { ORPCError } from '@orpc/server';
import { StandardOpenAPIHandler } from '@orpc/openapi/standard';
import {
	toFetchHeaders,
	toFetchResponse,
	toStandardLazyRequest
} from '@orpc/standard-server-fetch';
import { getRequestIp } from '$lib/server/request';
import type { RpcMeta } from './base';
import type { RpcContext } from './context';
import { isProcedureError, PROBLEM_STATUS, PROBLEM_TITLES, type ApiProblemCode } from './errors';
import { RequestBody } from './input';
import { contentETag, ifNoneMatchMatches } from './preconditions';
import { router } from './router';
import type { ApiSchemas } from './schemas';

/**
 * The API door: serves the router under `/api/v1` with oRPC's OpenAPI handler. oRPC matches the
 * route, runs the procedure and encodes its result; this module adds what the contract needs
 * around it:
 * - a lazy `RequestBody`, so middleware runs before any body byte is read (see input.ts);
 * - problem+json errors with a stable `code`, generic 500s and the related headers;
 * - ETags, `Vary: Authorization` and 304s for procedures marked `cache: 'revalidate'`;
 * - `no-store` for everything else that does not set its own cache policy.
 */

export const API_PREFIX = '/api/v1';

type ApiContext = RpcContext & { resHeaders: Headers; matched: { meta?: RpcMeta } };

const STATUS_CODES: Partial<Record<number, ApiProblemCode>> = {
	400: 'bad_request',
	401: 'unauthorized',
	404: 'not_found',
	413: 'payload_too_large',
	415: 'unsupported_media_type',
	429: 'rate_limited'
};

const problemBody = (code: ApiProblemCode, status: number, detail: string) => ({
	status,
	code,
	title: PROBLEM_TITLES[code],
	detail
});

const GENERIC_DETAIL: Partial<Record<ApiProblemCode, string>> = {
	// Internal details stay in the server log; the web door may show its own message.
	internal_error: 'Något gick fel. Försök igen senare.',
	unauthorized: 'Du behöver logga in.'
};

/** Renders any thrown error as an RFC 9457 problem with safe text and headers only. */
export const toProblem = (
	error: unknown
): { status: number; headers: Record<string, string>; body: ApiSchemas['Problem'] } => {
	if (isProcedureError(error)) {
		const code = error.code;
		const body: ApiSchemas['Problem'] = problemBody(
			code,
			error.status,
			GENERIC_DETAIL[code] ?? error.message
		);
		if (error.data?.errors?.length) body.errors = error.data.errors;
		return {
			status: error.status,
			headers: {
				...error.data?.headers,
				...(code === 'unauthorized' ? { 'www-authenticate': 'Bearer' } : {})
			},
			body
		};
	}
	// oRPC's own errors, such as a malformed request it rejected before the procedure.
	const status = error instanceof ORPCError ? error.status : 500;
	const code = STATUS_CODES[status] ?? 'internal_error';
	if (code === 'internal_error') console.error('API request failed:', error);
	return {
		status: PROBLEM_STATUS[code],
		headers: {},
		body: problemBody(
			code,
			PROBLEM_STATUS[code],
			GENERIC_DETAIL[code] ?? (code === 'not_found' ? 'Hittades inte' : 'Ogiltig förfrågan.')
		)
	};
};

const handler = new StandardOpenAPIHandler<ApiContext>(router, {
	clientInterceptors: [
		({ procedure, context, next }) => {
			context.matched.meta = procedure['~orpc'].meta as RpcMeta;
			return next();
		}
	],
	interceptors: [
		async ({ next }) => {
			try {
				return await next();
			} catch (error) {
				return { matched: true, response: toProblem(error) };
			}
		}
	]
});

const problemResponse = (problem: ReturnType<typeof toProblem>) =>
	new Response(JSON.stringify(problem.body), {
		status: problem.status,
		headers: {
			...problem.headers,
			'content-type': 'application/problem+json',
			'cache-control': 'no-store'
		}
	});

/** Weak validation for reads: the procedure has already authorized the representation. */
const revalidatableResponse = (request: Request, context: ApiContext, body: unknown) => {
	const serialized = JSON.stringify(body);
	const headers = new Headers(context.resHeaders);
	headers.set('etag', headers.get('etag') ?? contentETag(serialized));
	headers.set('vary', 'Authorization');
	headers.set('cache-control', context.user ? 'private, no-cache' : 'no-cache');
	if (ifNoneMatchMatches(request.headers.get('if-none-match'), headers.get('etag')!)) {
		return new Response(null, { status: 304, headers });
	}
	headers.set('content-type', 'application/json');
	return new Response(serialized, { status: 200, headers });
};

/**
 * Handles one `/api/*` request. Hooks have authenticated it from `Authorization: Bearer` only;
 * the session cookie never reaches this door.
 */
export const handleApiRequest = async (event: RequestEvent): Promise<Response> => {
	const isHead = event.request.method === 'HEAD';
	const request = isHead ? new Request(event.request, { method: 'GET' }) : event.request;
	const standardRequest = toStandardLazyRequest(request);
	// Procedures read the body themselves, after their middleware (see input.ts).
	standardRequest.body = async () => new RequestBody(request) as never;

	const context: ApiContext = {
		user: event.locals.user,
		session: event.locals.session,
		ip: getRequestIp(event),
		channel: 'api',
		deps: event.locals.deps,
		resHeaders: new Headers(),
		matched: {}
	};
	const result = await handler.handle(standardRequest, { prefix: API_PREFIX, context });

	let response: Response;
	if (!result.matched) {
		response = problemResponse(toProblem(new ORPCError('NOT_FOUND')));
	} else if (result.response.status >= 400) {
		const { status, headers, body } = result.response;
		response = problemResponse({
			status,
			headers: Object.fromEntries(toFetchHeaders(headers)),
			body: body as ApiSchemas['Problem']
		});
	} else if (context.matched.meta?.cache === 'revalidate' && result.response.status === 200) {
		response = revalidatableResponse(request, context, result.response.body);
	} else {
		response = toFetchResponse(result.response);
		for (const [name, value] of context.resHeaders) response.headers.set(name, value);
		// oRPC names binary bodies for downloads; images are displayed inline.
		response.headers.delete('content-disposition');
		if (!response.headers.has('cache-control')) response.headers.set('cache-control', 'no-store');
	}
	return isHead
		? new Response(null, { status: response.status, headers: response.headers })
		: response;
};
