import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_TYPES_PATH, renderApiTypes } from '../../../../scripts/generate-api-types.js';
import { getSchemaValidator, openApiDocument, type ApiSchemaName } from './openapi';

const API_ROUTES_DIRECTORY = join(process.cwd(), 'src', 'routes', 'api', 'v1');
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

const findServerFiles = async (directory: string): Promise<string[]> => {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map((entry) => {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) return findServerFiles(path);
			return Promise.resolve(entry.name === '+server.ts' ? [path] : []);
		})
	);
	return nested.flat();
};

const toContractPath = (file: string) =>
	'/' +
	relative(API_ROUTES_DIRECTORY, file)
		.split(sep)
		.slice(0, -1)
		.map((segment) => segment.replace(/^\[(\w+)\]$/, '{$1}'))
		.join('/');

const getImplementedOperations = async () => {
	const operations: string[] = [];
	for (const file of await findServerFiles(API_ROUTES_DIRECTORY)) {
		const source = await readFile(file, 'utf8');
		for (const method of HTTP_METHODS) {
			if (new RegExp(`export const ${method}\\b`).test(source)) {
				operations.push(`${method} ${toContractPath(file)}`);
			}
		}
	}
	return operations.sort();
};

const getDocumentedOperations = () =>
	Object.entries(openApiDocument.paths as Record<string, Record<string, unknown>>)
		.flatMap(([path, item]) =>
			HTTP_METHODS.filter((method) => method.toLowerCase() in item).map(
				(method) => `${method} ${path}`
			)
		)
		.sort();

describe('API contract', () => {
	it('has an implementation for every documented operation, and nothing undocumented', async () => {
		expect(await getImplementedOperations()).toEqual(getDocumentedOperations());
	});

	it('keeps the generated TypeScript types in sync with openapi/v1.yaml', async () => {
		const expected = await renderApiTypes();
		const actual = await readFile(API_TYPES_PATH, 'utf8');
		expect(actual, 'Run `npm run api:types` after changing openapi/v1.yaml').toBe(expected);
	});

	it('compiles every component schema', () => {
		const schemas = (openApiDocument.components as { schemas: Record<string, unknown> }).schemas;
		for (const name of Object.keys(schemas)) {
			expect(() => getSchemaValidator(name as ApiSchemaName), name).not.toThrow();
		}
	});
});
