import { Predicate } from 'effect';
import { HttpServerResponse } from 'effect/http';
import { httpStatusOf, messageOf, Unauthorized } from '$lib/server/errors';
import type { FieldError } from '$lib/server/errors';
import type { Problem, ProblemCode } from './contract/schemas';

const TITLES: Record<ProblemCode, string> = {
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

/** The stable problem `code` of each domain error tag. Clients branch on these. */
const CODES: Record<string, ProblemCode> = {
	Unauthorized: 'unauthorized',
	InvalidCredentials: 'invalid_credentials',
	BadRequest: 'bad_request',
	InvalidImagePreview: 'bad_request',
	ReviewNotFound: 'not_found',
	ImageNotFound: 'not_found',
	HomePageNotFound: 'not_found',
	ReviewInvalid: 'validation_failed',
	ValidationFailed: 'validation_failed',
	ReviewRequestInvalid: 'validation_failed',
	DuplicateSlug: 'duplicate_slug',
	AlreadyPublished: 'already_published',
	ConcurrentUpdate: 'concurrent_update',
	PreconditionFailed: 'precondition_failed',
	PreconditionRequired: 'precondition_required',
	PayloadTooLarge: 'payload_too_large',
	UnsupportedMediaType: 'unsupported_media_type',
	RateLimited: 'rate_limited',
	ServiceUnavailable: 'service_unavailable',
	BadGateway: 'service_unavailable',
	ImagePreviewBusy: 'service_unavailable'
};

const INTERNAL_ERROR_DETAIL = 'Något gick fel. Försök igen senare.';

export interface ProblemOptions {
	errors?: readonly FieldError[];
	headers?: Record<string, string>;
}

/** An RFC 9457 problem response. `detail` is Swedish and safe to show to users. */
export const problem = (
	status: number,
	code: ProblemCode,
	detail: string,
	options: ProblemOptions = {}
): HttpServerResponse.HttpServerResponse => {
	const body: Problem = { status, code, title: TITLES[code], detail };
	if (options.errors?.length) Object.assign(body, { errors: options.errors });
	return HttpServerResponse.text(JSON.stringify(body), {
		status,
		contentType: 'application/problem+json',
		headers: { 'cache-control': 'no-store', ...options.headers }
	});
};

export const internalErrorProblem = () => problem(500, 'internal_error', INTERNAL_ERROR_DETAIL);

export const notFoundProblem = (detail = 'Hittades inte') => problem(404, 'not_found', detail);

const retryAfterOf = (error: unknown): number | undefined =>
	Predicate.hasProperty(error, 'retryAfterSeconds') && typeof error.retryAfterSeconds === 'number'
		? error.retryAfterSeconds
		: undefined;

const fieldErrorsOf = (error: unknown): readonly FieldError[] | undefined => {
	if (Predicate.hasProperty(error, 'errors') && Array.isArray(error.errors)) {
		return error.errors as FieldError[];
	}
	// A duplicate slug names the field it conflicts on.
	if (
		Predicate.hasProperty(error, '_tag') &&
		error._tag === 'DuplicateSlug' &&
		Predicate.hasProperty(error, 'pointer') &&
		typeof error.pointer === 'string'
	) {
		return [{ pointer: error.pointer, detail: messageOf(error) ?? '' }];
	}
	return undefined;
};

/**
 * Renders a domain error as the problem response both the contract and the clients expect:
 * the status from the error class, a stable `code`, the Swedish message, field errors and the
 * headers the status needs. Unknown and internal errors become a generic 500.
 */
export const problemFromError = (error: unknown): HttpServerResponse.HttpServerResponse => {
	const tag = Predicate.hasProperty(error, '_tag') ? String(error._tag) : '';
	const code = CODES[tag];
	const status = httpStatusOf(error);
	if (!code || !status || (status >= 500 && code !== 'service_unavailable')) {
		// Workflows log their own storage failures; anything else is logged here, never returned.
		if (tag !== 'StorageFailed' && tag !== 'ImageReadFailed') {
			console.error('API request failed:', error);
		}
		return internalErrorProblem();
	}

	const headers: Record<string, string> = {};
	const retryAfter = retryAfterOf(error);
	if (retryAfter !== undefined) headers['retry-after'] = String(retryAfter);
	if (tag === 'ImagePreviewBusy') headers['retry-after'] = '1';
	if (tag === 'Unauthorized') headers['www-authenticate'] = 'Bearer';
	// adapter-node destroys the socket when a request body is cancelled; close after replying.
	if (tag === 'PayloadTooLarge') headers.connection = 'close';

	return problem(status, code, messageOf(error) ?? TITLES[code], {
		errors: fieldErrorsOf(error),
		headers
	});
};

export const unauthorizedProblem = () =>
	problemFromError(new Unauthorized({ message: 'Du behöver logga in.' }));
