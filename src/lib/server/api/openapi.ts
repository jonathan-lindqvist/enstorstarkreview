import { Context } from 'effect';
import { HttpApi, OpenApi } from 'effect/http-api';
import { stringify } from 'yaml';
import { EnStorStarkApi, Responses } from './contract/api';

type JsonObject = Record<string, unknown>;

const API_PREFIX = '/api/v1';

const isObject = (value: unknown): value is JsonObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const HEADER_COMPONENTS = {
	ETag: {
		description: 'Entity tag of the response. Send it back in `If-None-Match` or `If-Match`.',
		schema: { type: 'string' }
	},
	RetryAfter: {
		description: 'Seconds to wait before a retry.',
		schema: { type: 'integer', minimum: 0 }
	}
};

/** Shared response descriptions; endpoints override them with the `Responses` annotation. */
const DEFAULT_DESCRIPTIONS: Record<string, string> = {
	'200': 'Success.',
	'204': 'No content.',
	'304': 'The cached representation is still current.',
	'400': 'The body is not valid JSON.',
	'401': 'Authentication is missing, invalid or expired.',
	'404': 'The resource does not exist or is not visible to this client.',
	'409':
		'The request conflicts with the current state. `code` is `duplicate_slug`, `already_published` or `concurrent_update`.',
	'412': 'The `If-Match` value is not the current `ETag`. Reload and try again.',
	'413': 'The request body or image is too large.',
	'415': 'The request body is not `application/json`.',
	'422':
		'One or more fields are invalid. Structural schema validation stops at the first failure; clients should correct that field and retry. See `errors`.',
	'428': 'The `If-Match` header is missing.',
	'429': 'Too many requests.',
	'500': 'The server could not complete the request.',
	'502': 'A required service is not available. Try again later.',
	'503': 'A required service is not available. Try again later.'
};

const IMAGE_CONTENT = Object.fromEntries(
	['image/jpeg', 'image/png', 'image/webp'].map((type) => [
		type,
		{ schema: { type: 'string', contentMediaType: type } }
	])
);

const MAX_SAFE = Number.MAX_SAFE_INTEGER;

const HEADER_REFS = {
	ETag: { $ref: '#/components/headers/ETag' },
	'Retry-After': { $ref: '#/components/headers/RetryAfter' },
	Location: { description: 'API path of the new review.', schema: { type: 'string' } }
} as const;

/**
 * Rewrites JSON Schema output into the shapes the native generators handle: a nullable inline
 * value becomes `type: [T, 'null']` instead of `anyOf` with a null branch, because
 * swift-openapi-generator drops a oneOf/anyOf that mixes null with another schema.
 */
const normalizeSchema = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(normalizeSchema);
	if (!isObject(value)) return value;
	const result: JsonObject = Object.fromEntries(
		Object.entries(value)
			// Effect documents `Int` with the safe-integer bounds; they add nothing for clients.
			.filter(
				([key, entry]) =>
					!(key === 'minimum' && entry === -MAX_SAFE) && !(key === 'maximum' && entry === MAX_SAFE)
			)
			.map(([key, entry]) => [key, normalizeSchema(entry)])
	);
	const anyOf = result.anyOf;
	if (Array.isArray(anyOf) && anyOf.length === 2) {
		const nullIndex = anyOf.findIndex((entry) => isObject(entry) && entry.type === 'null');
		const other = anyOf[1 - nullIndex];
		if (nullIndex !== -1 && isObject(other) && typeof other.type === 'string' && !other.$ref) {
			const { anyOf: _anyOf, ...rest } = result;
			return { ...other, ...rest, type: [other.type, 'null'] };
		}
	}
	return result;
};

/**
 * Annotated copies of a schema (`Review_1`, `Problem_2`) differ only in their description.
 * Points every reference at the base component and drops the copies, so clients get one model.
 */
const dedupeComponents = (document: JsonObject): JsonObject => {
	const schemas = (document.components as { schemas: JsonObject }).schemas;
	const renamed = new Map<string, string>();
	for (const name of Object.keys(schemas)) {
		const base = name.replace(/_\d+$/, '');
		if (base !== name && base in schemas) renamed.set(name, base);
	}
	for (const name of renamed.keys()) delete schemas[name];
	const rewrite = (value: unknown): unknown => {
		if (Array.isArray(value)) return value.map(rewrite);
		if (!isObject(value)) return value;
		const result = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
		if (typeof result.$ref === 'string') {
			const name = result.$ref.replace('#/components/schemas/', '');
			const base = renamed.get(name);
			if (base) result.$ref = `#/components/schemas/${base}`;
		}
		return result;
	};
	return rewrite(document) as JsonObject;
};

/**
 * The OpenAPI document for `/api/v1`, generated from the HttpApi definition. The post-processing
 * keeps the published contract shape the clients were generated from: paths relative to the
 * `/api/v1` server, `security: [{}]` for public-only operations, operations without a security
 * requirement inheriting the optional-bearer default, and documented response headers.
 */
export const buildOpenApiDocument = (): JsonObject => {
	const generated = OpenApi.fromApi(EnStorStarkApi, {
		includeAnnotationKey: (key) => key === 'x-max-body-bytes'
	}) as unknown as JsonObject;
	const document = dedupeComponents(normalizeSchema(generated) as JsonObject);
	const schemas = (document.components as { schemas: JsonObject }).schemas;
	// Response descriptions live in the `Responses` annotation, not on the shared components.
	for (const name of [
		'Problem',
		'Review',
		'ReviewList',
		'Session',
		'SessionCreated',
		'UserList',
		'ReviewMetadata',
		'ReviewHistory',
		'NearbyReviews',
		'ReviewMap',
		'ReviewRequestAccepted'
	]) {
		const schema = schemas[name];
		if (isObject(schema) && name !== 'Problem') delete schema.description;
	}
	if (isObject(schemas.Problem)) {
		schemas.Problem.description = 'RFC 9457 problem details with a machine-readable `code`.';
	}

	const docsByOperation = new Map<
		string,
		Readonly<Record<number, { description?: string; headers?: readonly string[] }>>
	>();
	HttpApi.reflect(EnStorStarkApi, {
		onGroup: () => {},
		onEndpoint: ({ endpoint }) => {
			const docs = Context.getOption(endpoint.annotations, Responses);
			if (docs._tag === 'Some') docsByOperation.set(endpoint.identifier, docs.value);
		}
	});

	const paths: JsonObject = {};
	for (const [path, item] of Object.entries(document.paths as JsonObject)) {
		const relativePath = path.startsWith(API_PREFIX) ? path.slice(API_PREFIX.length) : path;
		for (const operation of Object.values(item as JsonObject)) {
			if (!isObject(operation)) continue;
			if (Array.isArray(operation.security) && operation.security.length === 0) {
				delete operation.security;
			}
			if (Array.isArray(operation.parameters) && operation.parameters.length === 0) {
				delete operation.parameters;
			}
			const docs = docsByOperation.get(String(operation.operationId)) ?? {};
			const responses = operation.responses as Record<string, JsonObject>;
			for (const [status, response] of Object.entries(responses)) {
				const doc = docs[Number(status)];
				response.description = doc?.description ?? DEFAULT_DESCRIPTIONS[status] ?? 'Success.';
				if (doc?.headers?.length) {
					response.headers = Object.fromEntries(
						doc.headers.map((name) => [name, HEADER_REFS[name as keyof typeof HEADER_REFS]])
					);
				}
			}
			if (operation.operationId === 'getImage' && responses['200']) {
				responses['200'].content = IMAGE_CONTENT;
			}
			if (responses['401']) {
				responses['401'].headers = { 'WWW-Authenticate': { schema: { type: 'string' } } };
			}
		}
		paths[relativePath] = item;
	}

	const components = document.components as JsonObject;
	return {
		openapi: document.openapi,
		info: document.info,
		servers: [{ url: API_PREFIX }],
		tags: document.tags,
		security: [{}, { bearerAuth: [] }],
		paths,
		components: {
			securitySchemes: {
				bearerAuth: {
					type: 'http',
					scheme: 'bearer',
					description: 'The `token` from `POST /sessions`.'
				}
			},
			headers: HEADER_COMPONENTS,
			schemas: components.schemas
		}
	};
};

const YAML_HEADER = `# Generated from src/lib/server/api/contract by \`npm run api:generate\`. Do not edit by hand.
# The HttpApi definition is the source of truth; a unit test fails when this file is stale.
`;

export const renderOpenApiYaml = (): string =>
	YAML_HEADER + stringify(buildOpenApiDocument(), { lineWidth: 0, aliasDuplicateObjects: false });
