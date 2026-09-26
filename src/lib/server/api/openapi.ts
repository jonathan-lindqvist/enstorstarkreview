import specSource from '../../../../openapi/v1.yaml?raw';
import { parse } from 'yaml';
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { components } from '$lib/types/api-v1';

export type ApiSchemas = components['schemas'];
export type ApiSchemaName = keyof ApiSchemas;
export type ApiFieldError = ApiSchemas['FieldError'];

/** The contract in openapi/v1.yaml, inlined at build time. */
export const openApiDocument = parse(specSource) as Record<string, unknown>;

const SPEC_ID = 'openapi-v1';
// `strict: false` because the document root is OpenAPI, not JSON Schema.
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(openApiDocument, SPEC_ID);

const validators = new Map<ApiSchemaName, ValidateFunction>();

export const getSchemaValidator = (name: ApiSchemaName): ValidateFunction => {
	let validator = validators.get(name);
	if (!validator) {
		validator = ajv.getSchema(`${SPEC_ID}#/components/schemas/${name}`);
		if (!validator) throw new Error(`Unknown OpenAPI schema: ${name}`);
		validators.set(name, validator);
	}
	return validator;
};

const escapePointerToken = (token: string) => token.replace(/~/g, '~0').replace(/\//g, '~1');

const getErrorPointer = (error: ErrorObject): string => {
	const params = error.params as Record<string, unknown>;
	const property =
		params.missingProperty ?? params.additionalProperty ?? params.unevaluatedProperty;
	return typeof property === 'string'
		? `${error.instancePath}/${escapePointerToken(property)}`
		: error.instancePath;
};

// Structural errors mean a client bug, so short generic Swedish messages are enough.
const getErrorDetail = (error: ErrorObject): string => {
	switch (error.keyword) {
		case 'required':
			return 'Fältet saknas';
		case 'additionalProperties':
		case 'unevaluatedProperties':
			return 'Fältet är okänt';
		case 'type':
			return 'Fältet har fel typ';
		case 'minimum':
		case 'maximum':
			return 'Värdet är utanför det tillåtna intervallet';
		case 'minLength':
			return 'Fältet får inte vara tomt';
		case 'maxLength':
			return 'Värdet är för långt';
		case 'minItems':
			return 'Välj minst ett värde';
		case 'enum':
			return 'Värdet är inte tillåtet';
		default:
			return 'Värdet är ogiltigt';
	}
};

/** Converts Ajv errors to one field error per JSON pointer, in document order. */
export const toFieldErrors = (errors: ErrorObject[] | null | undefined): ApiFieldError[] => {
	const byPointer = new Map<string, ApiFieldError>();
	for (const error of errors ?? []) {
		const pointer = getErrorPointer(error);
		if (!byPointer.has(pointer)) byPointer.set(pointer, { pointer, detail: getErrorDetail(error) });
	}
	return [...byPointer.values()];
};

export type SchemaValidationResult<T> =
	| { ok: true; value: T }
	| { ok: false; errors: ApiFieldError[] };

export const validateAgainstSchema = <Name extends ApiSchemaName>(
	name: Name,
	value: unknown
): SchemaValidationResult<ApiSchemas[Name]> => {
	const validate = getSchemaValidator(name);
	return validate(value)
		? { ok: true, value: value as ApiSchemas[Name] }
		: { ok: false, errors: toFieldErrors(validate.errors) };
};
