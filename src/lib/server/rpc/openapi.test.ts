import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { traverseContractProcedures } from '@orpc/server';
import { API_TYPES_PATH, renderApiTypes } from '../../../../scripts/generate-api-types.js';
import { generateOpenApiDocument } from './openapi';
import { API_SPEC_FILE, renderOpenApiYaml } from './openapi-yaml';
import { router } from './router';
import { COMPONENT_SCHEMAS, ProblemCode } from './schemas';
import { PROBLEM_STATUS } from './errors';

const METHODS = ['get', 'put', 'post', 'delete', 'patch'] as const;

describe('generated API contract', () => {
	it('is checked in up to date', async () => {
		const actual = await readFile(API_SPEC_FILE, 'utf8');
		expect(actual, 'Run `npm run api:generate` after changing a procedure').toBe(
			await renderOpenApiYaml()
		);
	});

	it('keeps the generated TypeScript types in sync with openapi/v1.yaml', async () => {
		const actual = await readFile(API_TYPES_PATH, 'utf8');
		expect(actual, 'Run `npm run api:generate`').toBe(await renderApiTypes());
	});

	it('documents every procedure once, and required sessions as bearer-only', async () => {
		const document = await generateOpenApiDocument();
		const operations = Object.values(document.paths ?? {}).flatMap((item) =>
			METHODS.flatMap((method) => (item?.[method] ? [item[method]] : []))
		);
		const procedures: string[] = [];
		const required = new Set<string>();
		traverseContractProcedures({ router, path: [] }, ({ contract }) => {
			const { route, meta } = contract['~orpc'];
			procedures.push(route.operationId!);
			if ((meta as { auth?: string }).auth === 'required') required.add(route.operationId!);
		});

		expect(operations.map((operation) => operation.operationId).sort()).toEqual(procedures.sort());
		for (const operation of operations) {
			if (required.has(operation.operationId!)) {
				expect(operation.security, operation.operationId).toEqual([{ bearerAuth: [] }]);
			}
			expect(Object.keys(operation.responses ?? {}), operation.operationId).not.toHaveLength(0);
		}
	});

	it('compiles every component schema for clients that validate responses', async () => {
		const validator = new Ajv2020({ strict: false });
		addFormats(validator);
		validator.addSchema(await generateOpenApiDocument(), 'contract');
		for (const name of Object.keys(COMPONENT_SCHEMAS)) {
			expect(validator.getSchema(`contract#/components/schemas/${name}`), name).toBeDefined();
		}
	});

	it('has a status for every problem code', () => {
		for (const code of ProblemCode.options) {
			expect(PROBLEM_STATUS[code], code).toBeGreaterThanOrEqual(400);
		}
	});
});
