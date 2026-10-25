import { readFile } from 'node:fs/promises';
import { HttpApi } from 'effect/http-api';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { API_TYPES_PATH, renderApiTypes } from '../../../../scripts/generate-api-types.js';
import { EnStorStarkApi } from './contract/api';
import { buildOpenApiDocument } from './openapi';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

const getImplementedOperations = () => {
	const operations: string[] = [];
	HttpApi.reflect(EnStorStarkApi, {
		onGroup: () => {},
		onEndpoint: ({ endpoint }) => {
			const path = endpoint.path.replace('/api/v1', '').replace(/:(\w+)/g, '{$1}');
			operations.push(`${endpoint.method} ${path}`);
		}
	});
	return operations.sort();
};

const openApiDocument = buildOpenApiDocument();

const getDocumentedOperations = () =>
	Object.entries(openApiDocument.paths as Record<string, Record<string, unknown>>)
		.flatMap(([path, item]) =>
			HTTP_METHODS.filter((method) => method.toLowerCase() in item).map(
				(method) => `${method} ${path}`
			)
		)
		.sort();

describe('API contract', () => {
	it('documents every HttpApi operation, and nothing else', () => {
		expect(getImplementedOperations()).toEqual(getDocumentedOperations());
	});

	it('keeps every operation the hand-written v1 contract published', () => {
		// The paths, methods and operation IDs that the native clients were generated from.
		const operationIds = Object.values(openApiDocument.paths as Record<string, object>).flatMap(
			(item) => Object.values(item).map((operation) => operation.operationId)
		);
		expect(operationIds.sort()).toEqual(
			[
				'createReview',
				'createReviewRequest',
				'createSession',
				'deleteCurrentSession',
				'deleteReview',
				'getCurrentSession',
				'getImage',
				'getMap',
				'getNearbyReviews',
				'getReview',
				'getReviewHistory',
				'getReviewMetadata',
				'getStatistics',
				'listReviews',
				'listUsers',
				'publishReview',
				'resolveNextMapMarker',
				'updateReview'
			].sort()
		);
	});

	it('keeps the generated TypeScript types in sync with openapi/v1.yaml', async () => {
		const expected = await renderApiTypes();
		const actual = await readFile(API_TYPES_PATH, 'utf8');
		expect(actual, 'Run `npm run api:generate` after changing the HttpApi contract').toBe(expected);
	});

	it('compiles every component schema of the checked-in contract', async () => {
		const document = parse(await readFile('openapi/v1.yaml', 'utf8'));
		const ajv = new Ajv2020({ strict: false });
		addFormats(ajv);
		ajv.addSchema(document, 'contract');
		for (const name of Object.keys(document.components.schemas)) {
			expect(() => ajv.getSchema(`contract#/components/schemas/${name}`), name).not.toThrow();
		}
	});
});
