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

/**
 * Parameter rules the handlers enforce themselves, so a bad slug answers 404 rather than a
 * generic 400. The contract still documents them.
 */
const PARAMETER_SCHEMAS: Record<string, JsonObject> = {
	'path:slug': { type: 'string', minLength: 1, maxLength: 200 },
	'path:filename': { type: 'string', pattern: '^[0-9a-f]{24}\\.(jpe?g|png|webp)$' },
	'query:address': { type: 'string', minLength: 1, maxLength: 300 }
};

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
/** Response schemas the hand-written contract already closed; they stay closed. */
const CLOSED_RESPONSE_SCHEMAS = new Set([
	'Ratings',
	'NearbyReviews',
	'NearbyReview',
	'BeerBrandValue',
	'BeerBrandPrice'
]);

const refsIn = (value: unknown, found = new Set<string>()): Set<string> => {
	if (Array.isArray(value)) value.forEach((entry) => refsIn(entry, found));
	else if (isObject(value)) {
		if (typeof value.$ref === 'string' && value.$ref.startsWith('#/components/schemas/')) {
			found.add(value.$ref.slice('#/components/schemas/'.length));
		}
		Object.values(value).forEach((entry) => refsIn(entry, found));
	}
	return found;
};

const withoutClosedObjects = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(withoutClosedObjects);
	if (!isObject(value)) return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([key, entry]) => !(key === 'additionalProperties' && entry === false))
			.map(([key, entry]) => [key, withoutClosedObjects(entry)])
	);
};

/**
 * Effect Schema closes every struct. Requests stay closed (unknown fields are rejected), but
 * responses stay open as in the hand-written contract, so the server can add fields without
 * breaking generated clients or the Playwright Ajv checks.
 */
const openResponseSchemas = (paths: JsonObject, schemas: JsonObject) => {
	const requestSchemas = new Set<string>();
	const pending = [
		...refsIn(
			Object.values(paths).flatMap((item) =>
				Object.values(item as JsonObject).map((operation) =>
					isObject(operation) ? operation.requestBody : undefined
				)
			)
		)
	];
	while (pending.length) {
		const name = pending.pop()!;
		if (requestSchemas.has(name)) continue;
		requestSchemas.add(name);
		pending.push(...refsIn(schemas[name]));
	}
	for (const name of Object.keys(schemas)) {
		if (requestSchemas.has(name) || CLOSED_RESPONSE_SCHEMAS.has(name)) continue;
		schemas[name] = withoutClosedObjects(schemas[name]);
	}
};

/**
 * The native apps generate a `ReviewFields` type from the hand-written contract, so the review
 * write bodies keep that shape: the shared fields as one component, and each request as
 * `allOf` the fields plus its image rule. `unevaluatedProperties` still rejects unknown fields.
 */
const shareReviewFields = (schemas: JsonObject) => {
	const update = schemas.ReviewUpdateRequest;
	const create = schemas.ReviewCreateRequest;
	if (!isObject(update) || !isObject(create) || !isObject(update.properties)) return;
	const { image: _image, ...fields } = update.properties;
	schemas.ReviewFields = {
		type: 'object',
		required: (update.required as string[]).filter((name) => name !== 'image'),
		properties: fields
	};
	const imageRef = (update.properties as JsonObject).image;
	const request = (schema: JsonObject, imageRequired: boolean): JsonObject => ({
		...(schema.description ? { description: schema.description } : {}),
		'x-max-body-bytes': schema['x-max-body-bytes'],
		allOf: [
			{ $ref: '#/components/schemas/ReviewFields' },
			{
				type: 'object',
				...(imageRequired ? { required: ['image'] } : {}),
				properties: { image: imageRef }
			}
		],
		unevaluatedProperties: false
	});
	schemas.ReviewCreateRequest = request(create, true);
	schemas.ReviewUpdateRequest = request(update, false);
};

/**
 * Restores `allOf` inheritance the generated Swift and Kotlin clients are written against
 * (Swift exposes it as `value1`/`value2`): `name` becomes `base` plus its own properties.
 */
const extendComponent = (schemas: JsonObject, name: string, base: string) => {
	const schema = schemas[name];
	const parent = schemas[base];
	if (!isObject(schema) || !isObject(parent) || !isObject(schema.properties)) return;
	const inherited = new Set(Object.keys((parent.properties as JsonObject) ?? {}));
	const own = Object.fromEntries(
		Object.entries(schema.properties).filter(([key]) => !inherited.has(key))
	);
	const required = ((schema.required as string[]) ?? []).filter((key) => !inherited.has(key));
	schemas[name] = {
		...(schema.description ? { description: schema.description } : {}),
		allOf: [
			{ $ref: `#/components/schemas/${base}` },
			{ type: 'object', ...(required.length ? { required } : {}), properties: own }
		]
	};
};

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
			for (const parameter of (operation.parameters ?? []) as JsonObject[]) {
				// Decoded as optional so the handler can answer 428; clients must always send it.
				if (parameter.in === 'header' && parameter.name === 'if-match') {
					parameter.name = 'If-Match';
					parameter.required = true;
				}
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
			// A missing or invalid token is challenged; wrong credentials at sign-in are not.
			if (responses['401'] && operation.operationId !== 'createSession') {
				responses['401'].headers = { 'WWW-Authenticate': { schema: { type: 'string' } } };
			}
			for (const parameter of (operation.parameters ?? []) as JsonObject[]) {
				const documented = PARAMETER_SCHEMAS[`${parameter.in}:${parameter.name}`];
				if (documented) parameter.schema = documented;
			}
		}
		paths[relativePath] = item;
	}

	openResponseSchemas(paths, schemas);
	shareReviewFields(schemas);
	extendComponent(schemas, 'SessionCreated', 'Session');
	extendComponent(schemas, 'ValueStatisticBar', 'StatisticBar');
	const fields = (schemas.ReviewFields as JsonObject).properties as JsonObject;
	if (isObject(fields.attributes) && fields.attributes.$ref) {
		const { $ref, ...rest } = fields.attributes;
		fields.attributes = { allOf: [{ $ref }], ...rest };
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
	YAML_HEADER +
	stringify(buildOpenApiDocument(), {
		lineWidth: 0,
		aliasDuplicateObjects: false,
		singleQuote: true
	});
