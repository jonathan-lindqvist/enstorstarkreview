import { ORPCError, type ErrorMap } from '@orpc/server';
import type { ApiFieldError, ApiProblemCode } from './schemas';

export type { ApiProblemCode };

/** The default HTTP status of each stable problem code. */
export const PROBLEM_STATUS = {
	bad_request: 400,
	unauthorized: 401,
	invalid_credentials: 401,
	not_found: 404,
	validation_failed: 422,
	duplicate_slug: 409,
	already_published: 409,
	concurrent_update: 409,
	precondition_failed: 412,
	precondition_required: 428,
	payload_too_large: 413,
	unsupported_media_type: 415,
	rate_limited: 429,
	service_unavailable: 503,
	internal_error: 500
} as const satisfies Record<ApiProblemCode, number>;

export const PROBLEM_TITLES: Record<ApiProblemCode, string> = {
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

/** What the web door needs to redisplay a rejected review form without JavaScript. */
export interface WebFormProblem {
	status: number;
	pointer: string;
	values?: object;
}

/**
 * Data carried by every procedure error. The API door renders `errors` and `headers` into the
 * problem response; the web door uses `form` and the Swedish message. Nothing else is exposed.
 */
export interface ProblemData {
	errors?: ApiFieldError[];
	headers?: Record<string, string>;
	form?: WebFormProblem;
}

export type ProcedureError = ORPCError<ApiProblemCode, ProblemData | undefined>;

/** A procedure failure: a stable code, a Swedish message that users may see, and safe data. */
export const problem = (
	code: ApiProblemCode,
	detail: string,
	data?: ProblemData,
	options: { status?: number; cause?: unknown } = {}
): ProcedureError =>
	new ORPCError(code, {
		status: options.status ?? PROBLEM_STATUS[code],
		message: detail,
		data,
		cause: options.cause
	});

export const isProcedureError = (error: unknown): error is ProcedureError =>
	error instanceof ORPCError && error.code in PROBLEM_STATUS;

export const notFound = (detail = 'Hittades inte') => problem('not_found', detail);
export const reviewNotFound = () => notFound('Recensionen hittades inte');

/** Marks failures of reading or validating a request body, so callers can audit them. */
export class InvalidBodyError extends Error {}

/**
 * The error map of a procedure, used for typed errors and for the generated OpenAPI responses.
 * Undeclared codes still propagate; declaring them documents the response.
 */
export const problems = <const Codes extends ApiProblemCode>(...codes: Codes[]) =>
	Object.fromEntries(
		codes.map((code) => [code, { status: PROBLEM_STATUS[code], message: PROBLEM_TITLES[code] }])
	) as { [Code in Codes]: { status: (typeof PROBLEM_STATUS)[Code]; message: string } } & ErrorMap;
