import { createHash } from 'crypto';
import { Effect, Schema, SchemaAST, SchemaIssue } from 'effect';
import { HttpServerResponse } from 'effect/http';
import {
	BadRequest,
	PayloadTooLarge,
	PreconditionFailed,
	UnsupportedMediaType,
	ValidationFailed,
	type FieldError
} from '$lib/server/errors';
import { requestBodyLimit, requestSchemas, type RequestSchemaName } from './contract/schemas';

const getErrorStatus = (err: unknown): number | undefined =>
	typeof err === 'object' && err !== null && 'status' in err
		? Number((err as { status: unknown }).status)
		: undefined;

const escapePointerToken = (token: string) => token.replace(/~/g, '~0').replace(/\//g, '~1');

const toPointer = (path: readonly PropertyKey[]) =>
	path.map((token) => `/${escapePointerToken(String(token))}`).join('');

const isLiteralUnion = (ast: SchemaAST.AST): boolean =>
	ast._tag === 'Literal' ||
	(ast._tag === 'Union' && ast.types.every((member) => member._tag === 'Literal'));

// Structural errors mean a client bug, so short generic Swedish messages are enough.
const filterDetail = (issue: SchemaIssue.Filter): string => {
	const annotations = issue.filter.annotations as
		| {
				detail?: string;
				representation?: { id?: string };
				arbitraryConstraint?: Record<string, unknown>;
		  }
		| undefined;
	if (annotations?.detail) return annotations.detail;
	if (annotations?.representation?.id === 'effect/schema/isInt') return 'Fältet har fel typ';
	const constraint = annotations?.arbitraryConstraint ?? {};
	if ('maxLength' in constraint) return 'Värdet är för långt';
	if ('minLength' in constraint) return 'Fältet får inte vara tomt';
	if (
		'minimum' in constraint ||
		'maximum' in constraint ||
		'exclusiveMinimum' in constraint ||
		'exclusiveMaximum' in constraint
	) {
		return 'Värdet är utanför det tillåtna intervallet';
	}
	return 'Värdet är ogiltigt';
};

/** The first schema issue as one field error, with an RFC 6901 pointer into the body. */
export const toFieldError = (
	issue: SchemaIssue.Issue,
	path: readonly PropertyKey[] = []
): FieldError => {
	switch (issue._tag) {
		case 'Pointer':
			return toFieldError(issue.issue, [...path, ...issue.path]);
		case 'Composite':
			return toFieldError(issue.issues[0], path);
		case 'AnyOf':
			return issue.issues[0]
				? toFieldError(issue.issues[0], path)
				: { pointer: toPointer(path), detail: 'Värdet är inte tillåtet' };
		case 'Filter':
			return { pointer: toPointer(path), detail: filterDetail(issue) };
		case 'Encoding':
			return toFieldError(issue.issue, path);
		case 'MissingKey':
			return { pointer: toPointer(path), detail: 'Fältet saknas' };
		case 'UnexpectedKey':
			return { pointer: toPointer(path), detail: 'Fältet är okänt' };
		case 'InvalidType':
			return {
				pointer: toPointer(path),
				detail: isLiteralUnion(issue.ast) ? 'Värdet är inte tillåtet' : 'Fältet har fel typ'
			};
		default:
			return { pointer: toPointer(path), detail: 'Värdet är ogiltigt' };
	}
};

/**
 * Decodes untrusted input against a contract schema. Decoding stops at the first failure, so a
 * small request with many unknown fields cannot make the server allocate an error for each.
 */
export const decodeRequest = <S extends Schema.Decoder<unknown>>(
	schema: S,
	value: unknown
): Effect.Effect<S['Type'], ValidationFailed> =>
	Schema.decodeUnknownEffect(schema)(value, { errors: 'first', onExcessProperty: 'error' }).pipe(
		Effect.mapError(
			(error) =>
				new ValidationFailed({ message: 'Kontrollera fälten.', errors: [toFieldError(error.issue)] })
		)
	);

/**
 * Reads a JSON request body within the schema's `x-max-body-bytes` budget and decodes it.
 * The budget applies to the bytes actually streamed, also without or with a false
 * Content-Length, and is enforced before JSON parsing.
 */
export const readJsonBody = <Name extends RequestSchemaName>(
	request: Request,
	name: Name
): Effect.Effect<
	(typeof requestSchemas)[Name]['Type'],
	UnsupportedMediaType | PayloadTooLarge | BadRequest | ValidationFailed
> =>
	Effect.gen(function* () {
		const contentType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
		if (contentType !== 'application/json') {
			return yield* new UnsupportedMediaType({ message: 'Förfrågan måste skickas som JSON.' });
		}

		const maxBytes = requestBodyLimit(name);
		const tooLarge = new PayloadTooLarge({ message: 'Förfrågan är för stor.' });
		if (Number(request.headers.get('content-length')) > maxBytes) return yield* tooLarge;

		const text = yield* Effect.tryPromise({
			try: async () => {
				const reader = request.body?.getReader();
				if (!reader) return '';
				try {
					const decoder = new TextDecoder();
					const parts: string[] = [];
					let bytesRead = 0;
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						bytesRead += value.byteLength;
						// adapter-node's cancel destroys the socket before it can send 413, so stop
						// reading without cancelling and close the connection after the response.
						if (bytesRead > maxBytes) return null;
						parts.push(decoder.decode(value, { stream: true }));
					}
					parts.push(decoder.decode());
					return parts.join('');
				} finally {
					reader.releaseLock();
				}
			},
			catch: (error) => error
		}).pipe(
			Effect.catch((error) =>
				// adapter-node rejects bodies above BODY_SIZE_LIMIT with a 413 error.
				getErrorStatus(error) === 413 ? Effect.succeed(null) : Effect.die(error)
			)
		);
		if (text === null) return yield* tooLarge;

		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			return yield* new BadRequest({ message: 'Förfrågan är inte giltig JSON.' });
		}
		return yield* decodeRequest(requestSchemas[name], body);
	});

/** JSON with the API defaults: `cache-control: no-store` unless the caller sets another. */
export const jsonResponse = (
	body: unknown,
	init: { status?: number; headers?: Record<string, string> } = {}
): HttpServerResponse.HttpServerResponse =>
	HttpServerResponse.text(JSON.stringify(body), {
		status: init.status ?? 200,
		contentType: 'application/json',
		headers: { 'cache-control': 'no-store', ...init.headers }
	});

export const contentETag = (serializedBody: string): string =>
	`"${createHash('sha256').update(serializedBody).digest('base64url').slice(0, 32)}"`;

const normalizeETag = (value: string) => value.trim().replace(/^W\//, '');

/** Weak comparison for GET cache validation; wildcards match an existing representation. */
export const ifNoneMatchMatches = (header: string | null | undefined, etag: string): boolean => {
	if (!header) return false;
	const target = normalizeETag(etag);
	return header.split(',').some((candidate) => {
		const value = normalizeETag(candidate);
		return value === '*' || value === target;
	});
};

/** Updates require an explicit current strong tag; wildcard updates are deliberately forbidden. */
export const ifMatchMatches = (header: string | null | undefined, etag: string): boolean => {
	if (!header || etag.startsWith('W/')) return false;
	const candidates = header.split(',').map((value) => value.trim());
	if (candidates.includes('*')) return false;
	return candidates.some((value) => value === etag);
};

/**
 * Checks a present `If-Match` against the current tag: stale, weak and wildcard values are 412.
 * Callers reject a missing header with 428 before reading the body; atomic `updatedAt`
 * matching in the write then turns a race after this check into 409.
 */
export const checkIfMatch = (header: string, etag: string): Effect.Effect<void, PreconditionFailed> =>
	ifMatchMatches(header, etag) ? Effect.void : Effect.fail(PreconditionFailed.default());

/**
 * A revalidatable JSON response. Anonymous and authenticated responses can differ (drafts),
 * so they vary on Authorization and authenticated responses stay private.
 */
export const cachedJsonResponse = (
	request: Request,
	authenticated: boolean,
	body: unknown,
	options: { etag?: string } = {}
): HttpServerResponse.HttpServerResponse => {
	const serialized = JSON.stringify(body);
	const etag = options.etag ?? contentETag(serialized);
	const headers = {
		etag,
		vary: 'Authorization',
		'cache-control': authenticated ? 'private, no-cache' : 'no-cache'
	};

	if (ifNoneMatchMatches(request.headers.get('if-none-match'), etag)) {
		return HttpServerResponse.empty({ status: 304, headers });
	}
	return HttpServerResponse.text(serialized, { contentType: 'application/json', headers });
};
