import { Predicate, Schema, SchemaAST } from 'effect';

/**
 * Domain errors shared by the web and API doors. Each error carries the HTTP status that both
 * doors use (`httpApiStatus`) and a Swedish `message` that is safe to show to users. The API
 * contract adds a stable problem `code` per error (see `server/api/contract/problems.ts`); the
 * web door maps the same errors to `fail()` and `error()`.
 */

export const FieldError = Schema.Struct({
	pointer: Schema.String.annotate({
		description: 'JSON Pointer (RFC 6901) into the request body. Empty for the whole body.',
		examples: ['/title', '/beer/priceKr', '/ratings/atmosphere']
	}),
	detail: Schema.String.annotate({
		description: 'Swedish message that clients can show next to the field.'
	})
}).annotate({ identifier: 'FieldError' });
export type FieldError = typeof FieldError.Type;

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
	'Unauthorized',
	{ message: Schema.String },
	{ httpApiStatus: 401, description: 'Authentication is missing, invalid or expired.' }
) {}

export class InvalidCredentials extends Schema.TaggedError<InvalidCredentials>()(
	'InvalidCredentials',
	{ message: Schema.String },
	{ httpApiStatus: 401, description: 'Wrong username or password.' }
) {}

export class Forbidden extends Schema.TaggedError<Forbidden>()(
	'Forbidden',
	{ message: Schema.String },
	{ httpApiStatus: 403 }
) {}

export class BadRequest extends Schema.TaggedError<BadRequest>()(
	'BadRequest',
	{ message: Schema.String },
	{ httpApiStatus: 400, description: 'The request is malformed.' }
) {}

export class ReviewNotFound extends Schema.TaggedError<ReviewNotFound>()(
	'ReviewNotFound',
	{ message: Schema.String },
	{
		httpApiStatus: 404,
		description: 'The resource does not exist or is not visible to this client.'
	}
) {
	static readonly default = () => new ReviewNotFound({ message: 'Recensionen hittades inte' });
}

/** A review form rule failed. `pointer` names the web form field, for example `/bar-name`. */
export class ReviewInvalid extends Schema.TaggedError<ReviewInvalid>()(
	'ReviewInvalid',
	{ message: Schema.String, pointer: Schema.String },
	{ httpApiStatus: 422, description: 'One or more fields are invalid. See `errors`.' }
) {}

export class DuplicateSlug extends Schema.TaggedError<DuplicateSlug>()(
	'DuplicateSlug',
	{ message: Schema.String, pointer: Schema.String },
	{ httpApiStatus: 409, description: 'Another review already uses the slug.' }
) {}

export class AlreadyPublished extends Schema.TaggedError<AlreadyPublished>()(
	'AlreadyPublished',
	{ message: Schema.String },
	{ httpApiStatus: 409, description: 'The review is already published.' }
) {}

export const CONCURRENT_UPDATE_MESSAGE =
	'Recensionen ändrades samtidigt. Ladda om sidan och försök igen.';

export class ConcurrentUpdate extends Schema.TaggedError<ConcurrentUpdate>()(
	'ConcurrentUpdate',
	{ message: Schema.String },
	{ httpApiStatus: 409, description: 'A parallel write changed the review first.' }
) {
	static readonly default = () => new ConcurrentUpdate({ message: CONCURRENT_UPDATE_MESSAGE });
}

export class PreconditionFailed extends Schema.TaggedError<PreconditionFailed>()(
	'PreconditionFailed',
	{ message: Schema.String },
	{
		httpApiStatus: 412,
		description: 'The `If-Match` value is not the current `ETag`. Reload and try again.'
	}
) {
	static readonly default = () => new PreconditionFailed({ message: CONCURRENT_UPDATE_MESSAGE });
}

export class PreconditionRequired extends Schema.TaggedError<PreconditionRequired>()(
	'PreconditionRequired',
	{ message: Schema.String },
	{ httpApiStatus: 428, description: 'The `If-Match` header is missing.' }
) {}

export class ValidationFailed extends Schema.TaggedError<ValidationFailed>()(
	'ValidationFailed',
	{ message: Schema.String, errors: Schema.Array(FieldError) },
	{
		httpApiStatus: 422,
		description:
			'One or more fields are invalid. Structural schema validation stops at the first failure; clients should correct that field and retry. See `errors`.'
	}
) {}

export class PayloadTooLarge extends Schema.TaggedError<PayloadTooLarge>()(
	'PayloadTooLarge',
	{ message: Schema.String, errors: Schema.optionalKey(Schema.Array(FieldError)) },
	{ httpApiStatus: 413, description: 'The request body or image is too large.' }
) {}

export class UnsupportedMediaType extends Schema.TaggedError<UnsupportedMediaType>()(
	'UnsupportedMediaType',
	{ message: Schema.String },
	{ httpApiStatus: 415, description: 'The request body is not `application/json`.' }
) {}

export class RateLimited extends Schema.TaggedError<RateLimited>()(
	'RateLimited',
	{ message: Schema.String, retryAfterSeconds: Schema.optionalKey(Schema.Int) },
	{ httpApiStatus: 429, description: 'Too many requests.' }
) {}

/** Storage failed while writing; the cause stays in the server log. */
export class StorageFailed extends Schema.TaggedError<StorageFailed>()(
	'StorageFailed',
	{ message: Schema.String },
	{ httpApiStatus: 500, description: 'The server could not complete the request.' }
) {}

export class ServiceUnavailable extends Schema.TaggedError<ServiceUnavailable>()(
	'ServiceUnavailable',
	{ message: Schema.String, retryAfterSeconds: Schema.optionalKey(Schema.Int) },
	{ httpApiStatus: 503, description: 'A required service is not available. Try again later.' }
) {}

export class BadGateway extends Schema.TaggedError<BadGateway>()(
	'BadGateway',
	{ message: Schema.String },
	{ httpApiStatus: 502, description: 'An upstream service failed. Try again later.' }
) {}

/** Reads the HTTP status declared on a domain error class, or undefined for other values. */
export const httpStatusOf = (error: unknown): number | undefined => {
	if (!Predicate.isObject(error)) return undefined;
	const schema = (error as { constructor?: unknown }).constructor as { ast?: SchemaAST.AST };
	if (!schema?.ast) return undefined;
	const status = SchemaAST.resolve(schema.ast)?.httpApiStatus;
	return typeof status === 'number' ? status : undefined;
};

export const messageOf = (error: unknown): string | undefined =>
	Predicate.hasProperty(error, 'message') && typeof error.message === 'string'
		? error.message
		: undefined;
