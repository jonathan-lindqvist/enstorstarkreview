import type { z } from 'zod';
import type { Schema } from '@orpc/server';
import type { OpenAPI } from '@orpc/openapi';
import { JSON_SCHEMA_REGISTRY } from '@orpc/zod/zod4';

/**
 * Small additions to Zod for the generated OpenAPI document. Validation stays in Zod; these
 * helpers only record documentation that Zod cannot express, and `openapi.ts` applies them.
 */

type JsonSchemaExtras = Record<string, unknown>;

/** Adds JSON Schema keywords (descriptions, `x-` extensions, documented-only limits). */
export const doc = <T extends z.ZodType>(schema: T, extras: JsonSchemaExtras): T => {
	JSON_SCHEMA_REGISTRY.add(schema, {
		...(JSON_SCHEMA_REGISTRY.get(schema) ?? {}),
		...extras
	} as never);
	return schema;
};

/** Component references that keep an `allOf` wrapper so a description can sit beside them. */
export const describedReferences = new WeakMap<
	z.ZodType,
	{ inner: z.ZodType; description: string }
>();

/**
 * A reference to a component with its own description, rendered as `allOf: [$ref]`. Generated
 * Swift clients wrap such fields (`.init(value1:)`), so the shape is part of the contract.
 */
export const describedReference = <T extends z.ZodType>(inner: T, description: string): T => {
	const wrapper = inner.clone() as T;
	describedReferences.set(wrapper, { inner, description });
	return wrapper;
};

/** Output schemas that are documented and type-checked, but not validated at runtime. */
export const unvalidatedOutputs = new WeakMap<object, z.ZodType>();

/**
 * Declares a procedure's output for TypeScript and the OpenAPI document without validating it
 * at runtime. Responses come from the server's own mappers, which tolerate legacy documents;
 * rejecting an odd legacy value with a 500 would be worse than serving it.
 */
export const unvalidated = <T extends z.ZodType>(schema: T): Schema<z.input<T>, z.output<T>> => {
	const output: Schema<z.input<T>, z.output<T>> = {
		'~standard': {
			vendor: 'enstorstark-unvalidated',
			version: 1,
			validate: (value) => ({ value: value as z.output<T> })
		}
	};
	unvalidatedOutputs.set(output, schema);
	return output;
};

type OperationObject = OpenAPI.OperationObject;
type ResponseObject = OpenAPI.ResponseObject;

const responsesOf = (operation: OperationObject) =>
	(operation.responses ?? {}) as Record<string, ResponseObject>;

/** Documents response headers that a procedure sets through `resHeaders`. */
export const withResponseHeaders =
	(status: string, headers: ResponseObject['headers']) =>
	(operation: OperationObject): OperationObject => {
		const responses = responsesOf(operation);
		return {
			...operation,
			responses: {
				...responses,
				[status]: { ...responses[status], headers: { ...responses[status]?.headers, ...headers } }
			}
		};
	};

/** Replaces or adds documented responses, for statuses with their own description. */
export const withResponses =
	(overrides: Record<string, ResponseObject>) =>
	(operation: OperationObject): OperationObject => ({
		...operation,
		responses: { ...responsesOf(operation), ...overrides }
	});

export const ETAG_HEADER: NonNullable<ResponseObject['headers']> = {
	ETag: { $ref: '#/components/headers/ETag' }
};

export const problemResponse = (description: string, headers?: ResponseObject['headers']) => ({
	description,
	...(headers ? { headers } : {}),
	content: {
		'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } }
	}
});
