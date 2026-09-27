import type { ApiFieldError, ApiSchemas } from './openapi';

export type ApiProblemCode = ApiSchemas['ProblemCode'];

const TITLES: Record<ApiProblemCode, string> = {
	bad_request: 'Bad request',
	unauthorized: 'Unauthorized',
	invalid_credentials: 'Invalid credentials',
	not_found: 'Not found',
	validation_failed: 'Validation failed',
	duplicate_slug: 'Duplicate slug',
	already_published: 'Already published',
	concurrent_update: 'Concurrent update',
	precondition_failed: 'Precondition failed',
	precondition_required: 'Precondition required',
	payload_too_large: 'Payload too large',
	unsupported_media_type: 'Unsupported media type',
	rate_limited: 'Too many requests',
	service_unavailable: 'Service unavailable',
	internal_error: 'Internal server error'
};

export interface ProblemOptions {
	errors?: ApiFieldError[];
	headers?: Record<string, string>;
}

/** An RFC 9457 problem response. `detail` is Swedish and safe to show to users. */
export const problem = (
	status: number,
	code: ApiProblemCode,
	detail: string,
	options: ProblemOptions = {}
): Response => {
	const body: ApiSchemas['Problem'] = { status, code, title: TITLES[code], detail };
	if (options.errors?.length) body.errors = options.errors;

	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/problem+json',
			'cache-control': 'no-store',
			...options.headers
		}
	});
};

export const unauthorizedProblem = () =>
	problem(401, 'unauthorized', 'Du behöver logga in.', {
		headers: { 'www-authenticate': 'Bearer' }
	});

export const notFoundProblem = (detail = 'Hittades inte') => problem(404, 'not_found', detail);

export const validationProblem = (errors: ApiFieldError[], detail = 'Kontrollera fälten.') =>
	problem(422, 'validation_failed', detail, { errors });

export const internalErrorProblem = () =>
	problem(500, 'internal_error', 'Något gick fel. Försök igen senare.');
