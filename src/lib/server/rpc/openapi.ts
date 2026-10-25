import type { z } from 'zod';
import {
	OpenAPIGenerator,
	type ConditionalSchemaConverter,
	type JSONSchema,
	type OpenAPI,
	type SchemaConvertOptions
} from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { traverseContractProcedures, type Schema } from '@orpc/server';
import type { RpcMeta } from './base';
import { apiInputParts } from './input';
import { router } from './router';
import { describedReferences, unvalidatedOutputs } from './schema-docs';
import { COMPONENT_SCHEMAS } from './schemas';

/**
 * Generates `openapi/v1.yaml` from the router (`npm run api:generate`). oRPC's generator does
 * the work; this module adds what the existing contract needs and oRPC does not produce:
 * - `apiInput` and `unvalidated` schemas are converted through their Zod parts;
 * - nullable values use `type: [x, 'null']`, the shape the Swift generator decodes;
 * - error responses use the shared problem+json responses, cached reads document ETag/304,
 *   security follows each procedure's `auth` metadata, and header names keep their case.
 */

type JsonObject = Exclude<JSONSchema, boolean> & Record<string, unknown>;

const SAFE_INTEGER_BOUNDS = new Set([Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]);

/** Turns `anyOf: [{ type: x, … }, { type: 'null' }]` into `{ type: [x, 'null'], … }`. */
const normalizeJsonSchema = (json: JsonObject): JsonObject => {
	const result: JsonObject = { ...json };
	// z.int() publishes the safe-integer range; the contract states only real limits.
	if (result.type === 'integer') {
		if (SAFE_INTEGER_BOUNDS.has(result.minimum as number)) delete result.minimum;
		if (SAFE_INTEGER_BOUNDS.has(result.maximum as number)) delete result.maximum;
	}
	const branches = result.anyOf as JsonObject[] | undefined;
	if (branches?.length === 2) {
		const nullIndex = branches.findIndex((branch) => branch.type === 'null');
		const value = branches[1 - nullIndex];
		if (nullIndex !== -1 && typeof value?.type === 'string' && !('$ref' in value)) {
			delete result.anyOf;
			const { type, ...constraints } = value;
			return { type: [type, 'null'], ...constraints, ...result };
		}
	}
	return result;
};

const zodConverter = new ZodToJsonSchemaConverter({
	interceptors: [
		({ schema, options, next }) => {
			const described = describedReferences.get(schema as z.ZodType);
			if (described) {
				const [required, json] = next({ schema: described.inner as never, options } as never);
				return [required, { allOf: [json], description: described.description }];
			}
			const [required, json] = next();
			return [required, normalizeJsonSchema(json as JsonObject)];
		}
	]
});

const convertZod = (schema: Schema<unknown, unknown> | undefined, options: SchemaConvertOptions) =>
	zodConverter.convert(schema, options) as [boolean, JsonObject];

/** `apiInput` schemas: the detailed `{ params, query, headers, body }` object of their parts. */
const apiInputConverter: ConditionalSchemaConverter = {
	condition: (schema) => schema !== undefined && apiInputParts.has(schema),
	convert: (schema, options) => {
		const parts = apiInputParts.get(schema!)!;
		const properties: Record<string, JSONSchema> = {};
		const required: string[] = [];
		for (const part of ['params', 'query', 'headers'] as const) {
			const partSchema = parts[part];
			if (partSchema) {
				properties[part] = convertZod(partSchema, options)[1];
				if (part !== 'query') required.push(part);
			}
		}
		if (parts.body) {
			properties.body = convertZod(parts.body.schema, options)[1];
			required.push('body');
		}
		return [true, { type: 'object', properties, required }];
	}
};

/** `unvalidated` outputs are documented exactly like their Zod schema. */
const unvalidatedConverter: ConditionalSchemaConverter = {
	condition: (schema) => schema !== undefined && unvalidatedOutputs.has(schema),
	convert: (schema, options) => convertZod(unvalidatedOutputs.get(schema!), options)
};

const problemContent = {
	'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } }
};

const ERROR_RESPONSES: Record<string, string> = {
	'400': 'BadRequest',
	'401': 'Unauthorized',
	'404': 'NotFound',
	'409': 'Conflict',
	'412': 'PreconditionFailed',
	'413': 'PayloadTooLarge',
	'415': 'UnsupportedMediaType',
	'422': 'ValidationFailed',
	'428': 'PreconditionRequired',
	'429': 'RateLimited',
	'500': 'InternalError',
	'502': 'ServiceUnavailable',
	'503': 'ServiceUnavailable'
};

const HEADER_NAMES: Record<string, string> = { 'if-match': 'If-Match' };

const BASE_DOCUMENT = {
	info: {
		title: 'En stor stark API',
		version: '1.0.0',
		summary: 'JSON API for the native En stor stark clients.',
		description:
			"Readers use the public endpoints without authentication. Reviewers sign in with\n`POST /sessions` and send the returned token as `Authorization: Bearer <token>`.\n\nThe API never reads the web session cookie. Authentication requires an explicit bearer\ntoken rather than ambient browser cookies. Request bodies are JSON; image downloads\nreturn image bytes, and some operations have no request or response body.\n\nUser-facing messages (`detail`, `errors[].detail`) are Swedish and are safe to show to\nthe user. Clients branch on `code` and HTTP status, never on message text.\n\nPublic collection and detail responses include an `ETag`; send `If-None-Match` to get\n`304 Not Modified`. Review updates require `If-Match` with the review's current `ETag`.\n"
	},
	servers: [{ url: '/api/v1' }],
	tags: [
		{ name: 'Sessions' },
		{ name: 'Metadata' },
		{ name: 'Reviews' },
		{ name: 'Images' },
		{ name: 'Map' },
		{ name: 'Statistics' },
		{ name: 'Review requests' }
	],
	security: [{}, { bearerAuth: [] }],
	components: {
		securitySchemes: {
			bearerAuth: {
				type: 'http',
				scheme: 'bearer',
				description: 'The `token` from `POST /sessions`.'
			}
		},
		headers: {
			ETag: {
				description: 'Entity tag of the response. Send it back in `If-None-Match` or `If-Match`.',
				schema: { type: 'string' }
			},
			RetryAfter: {
				description: 'Seconds to wait before a retry.',
				schema: { type: 'integer', minimum: 0 }
			}
		},
		responses: {
			NotModified: { description: 'The cached representation is still current.' },
			BadRequest: { description: 'The body is not valid JSON.', content: problemContent },
			Unauthorized: {
				description: 'Authentication is missing, invalid or expired.',
				headers: { 'WWW-Authenticate': { schema: { type: 'string' } } },
				content: problemContent
			},
			NotFound: {
				description: 'The resource does not exist or is not visible to this client.',
				content: problemContent
			},
			Conflict: {
				description:
					'The request conflicts with the current state. `code` is `duplicate_slug`,\n`already_published` or `concurrent_update`.\n',
				content: problemContent
			},
			PreconditionFailed: {
				description: 'The `If-Match` value is not the current `ETag`. Reload and try again.',
				content: problemContent
			},
			PreconditionRequired: {
				description: 'The `If-Match` header is missing.',
				content: problemContent
			},
			PayloadTooLarge: {
				description: 'The request body or image is too large.',
				content: problemContent
			},
			UnsupportedMediaType: {
				description: 'The request body is not `application/json`.',
				content: problemContent
			},
			ValidationFailed: {
				description:
					'One or more fields are invalid. Structural schema validation stops at the first\nfailure; clients should correct that field and retry. See `errors`.\n',
				content: problemContent
			},
			RateLimited: {
				description: 'Too many requests.',
				headers: { 'Retry-After': { $ref: '#/components/headers/RetryAfter' } },
				content: problemContent
			},
			ServiceUnavailable: {
				description: 'A required service is not available. Try again later.',
				content: problemContent
			},
			InternalError: {
				description: 'The server could not complete the request.',
				content: problemContent
			}
		}
	}
} satisfies Partial<OpenAPI.Document>;

const proceduresByOperation = () => {
	const metas = new Map<string, RpcMeta>();
	traverseContractProcedures({ router, path: [] }, ({ contract }) => {
		const { route, meta } = contract['~orpc'];
		if (route.operationId) metas.set(route.operationId, meta as RpcMeta);
	});
	return metas;
};

const SECURITY: Record<RpcMeta['auth'], OpenAPI.SecurityRequirementObject[] | undefined> = {
	none: [{}],
	optional: undefined,
	required: [{ bearerAuth: [] }]
};

const OPERATION_KEY_ORDER = [
	'tags',
	'operationId',
	'summary',
	'description',
	'security',
	'parameters',
	'requestBody',
	'responses'
];

const finishOperation = (operation: OpenAPI.OperationObject, meta: RpcMeta) => {
	const responses = operation.responses as Record<string, OpenAPI.ResponseObject>;
	for (const [status, response] of Object.entries(responses)) {
		if (Number(status) < 400) continue;
		const content = response.content;
		if (content?.['application/json']) {
			// A response that a procedure did not describe itself uses the shared response.
			responses[status] =
				response.description === status && ERROR_RESPONSES[status]
					? ({ $ref: `#/components/responses/${ERROR_RESPONSES[status]}` } as never)
					: { ...response, content: problemContent };
		}
	}
	const success = Object.keys(responses).find((status) => Number(status) < 300);
	if (success === '204') delete responses['204'].content;
	if (meta.cache === 'revalidate' && success) {
		responses[success].headers = {
			ETag: { $ref: '#/components/headers/ETag' },
			...responses[success].headers
		} as never;
		responses['304'] = { $ref: '#/components/responses/NotModified' } as never;
	}

	operation.parameters = operation.parameters?.map((parameter) => {
		const {
			schema,
			name,
			in: location,
			required
		} = parameter as OpenAPI.ParameterObject & {
			schema: JsonObject;
		};
		const { description, ...rest } = schema;
		return {
			name: HEADER_NAMES[name] ?? name,
			in: location,
			required: required ?? false,
			...(description ? { description } : {}),
			schema: rest
		} as OpenAPI.ParameterObject;
	});
	if (!operation.parameters?.length) delete operation.parameters;

	const security = SECURITY[meta.auth];
	if (security) operation.security = security;
	operation.responses = Object.fromEntries(
		Object.entries(responses).sort(([first], [second]) => Number(first) - Number(second))
	);
	return Object.fromEntries(
		OPERATION_KEY_ORDER.filter(
			(key) => key in operation && operation[key as never] !== undefined
		).map((key) => [key, operation[key as keyof OpenAPI.OperationObject]])
	) as OpenAPI.OperationObject;
};

export const generateOpenApiDocument = async (): Promise<OpenAPI.Document> => {
	const generator = new OpenAPIGenerator({
		schemaConverters: [apiInputConverter, unvalidatedConverter, zodConverter]
	});
	const document = await generator.generate(router, {
		...(structuredClone(BASE_DOCUMENT) as Partial<OpenAPI.Document>),
		commonSchemas: Object.fromEntries(
			Object.entries(COMPONENT_SCHEMAS).map(([name, schema]) => [name, { schema }])
		),
		customErrorResponseBodySchema: () => ({ $ref: '#/components/schemas/Problem' })
	});

	const metas = proceduresByOperation();
	for (const pathItem of Object.values(document.paths ?? {})) {
		for (const [method, operation] of Object.entries(
			pathItem as Record<string, OpenAPI.OperationObject>
		)) {
			const meta = metas.get(operation.operationId ?? '');
			if (!meta) throw new Error(`Missing procedure metadata for ${operation.operationId}`);
			(pathItem as Record<string, unknown>)[method] = finishOperation(operation, meta);
		}
	}

	const { info, servers, tags, security, paths, components } = document;
	return {
		openapi: '3.1.0',
		info,
		servers,
		tags,
		security,
		paths,
		components: {
			securitySchemes: components?.securitySchemes,
			headers: components?.headers,
			responses: components?.responses,
			schemas: components?.schemas
		}
	} as OpenAPI.Document;
};
