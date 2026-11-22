import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESLint } from 'eslint';

const eslint = new ESLint();
const client = 'src/lib/client/lint-fixture.ts';
const component = 'src/routes/lint-fixture/+page.svelte';
const route = 'src/routes/api/v1/lint-fixture/+server.ts';
const server = 'src/lib/server/lint-fixture.ts';
const apiHttp = "from '$lib/server/api/http'";
const bars = "import { bars as reviews } from '$lib/db/bars';";

const diagnostics = async (filePath, code) => {
	const [result] = await eslint.lintText(code, { filePath });
	assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
	return result.messages.filter(({ ruleId }) => ruleId?.startsWith('enstorstark/'));
};

const rejects = async (filePath, code, rule, message, line) => {
	const messages = await diagnostics(filePath, code);
	assert.equal(messages.length, 1, JSON.stringify(messages));
	assert.equal(messages[0].ruleId, `enstorstark/${rule}`);
	assert.equal(messages[0].severity, 2);
	assert.match(messages[0].message, message);
	if (line) assert.equal(messages[0].line, line);
};

test('blocks server dependencies in shared files and Svelte scripts', async () => {
	const cases = [
		[client, "export type T = import('../server/audit').AuditEvent;"],
		[client, "export const load = () => import('$lib/db/users');"],
		[client, 'export const load = () => import(`$lib/server/audit`);'],
		[client, "export { foo } from '$env/dynamic/private';"],
		[client, "import 'node:fs';"],
		[client, "import { ObjectId } from 'mongodb'; export const x = new ObjectId();"],
		['src/routes/lint-fixture/+page.ts', "export { load } from './+page.server.js';"],
		[component, '<script lang="ts">import type { A } from "$lib/server/audit";</script>']
	];
	for (const [path, code] of cases) {
		await rejects(path, code, 'no-server-import-in-shared', /\$lib\/types/, 1);
	}

	assert.deepEqual(
		await diagnostics(
			client,
			"import type { ObjectId } from 'mongodb'; export type Id = ObjectId;"
		),
		[]
	);
	assert.deepEqual(await diagnostics(client, 'export type Id = import("mongodb").ObjectId;'), []);
	assert.deepEqual(await diagnostics(server, "import 'fs'; import '$lib/db/users';"), []);
	assert.deepEqual(
		await diagnostics('src/lib/client/lint-fixture.test.ts', "import '$lib/db/bars';"),
		[]
	);
});

test('enforces the browser location preference through the owning helper', async () => {
	for (const code of [
		'export const location = navigator.geolocation;',
		'export const location = globalThis.navigator?.["geolocation"];',
		'export const { geolocation: location } = window.navigator;',
		'export const { navigator: { geolocation: location } } = globalThis;',
		'const { navigator: n } = globalThis; export const location = n.geolocation;',
		'const n = window.navigator; export const location = n.geolocation;'
	]) {
		await rejects(client, code, 'use-location-helper', /watchUserLocation/, 1);
	}
	await rejects(
		component,
		'<p>{window.navigator.geolocation}</p>',
		'use-location-helper',
		/watchUserLocation/,
		1
	);
	assert.deepEqual(
		await diagnostics(
			'src/lib/client/user-location.ts',
			'export const location = navigator.geolocation;'
		),
		[]
	);
	assert.deepEqual(
		await diagnostics(
			client,
			'export const read = (navigator: { geolocation: string }) => navigator.geolocation;'
		),
		[]
	);
});

test('recognizes only the shared API handler and skips the catch-all', async () => {
	for (const code of [
		'export const GET = async () => new Response();',
		'export async function DELETE() { return new Response(); }',
		'export const { GET } = { GET: () => new Response() };',
		"export { GET } from './another-handler';",
		'const handler = () => new Response(); export { handler as PATCH };',
		'const apiHandler = (fn: Function) => fn; export const GET = apiHandler(() => new Response());'
	]) {
		await rejects(route, code, 'require-api-handler', /apiHandler/, 1);
	}
	assert.deepEqual(
		await diagnostics(
			route,
			`import { apiHandler as wrap } ${apiHttp}; export const GET = wrap(async () => new Response());`
		),
		[]
	);
	assert.deepEqual(
		await diagnostics(
			'src/routes/api/[...path]/+server.ts',
			'export const fallback = async () => new Response();'
		),
		[]
	);
});

test('routes raw API request bodies through the bounded reader', async () => {
	for (const [argumentsSource, expression] of [
		['event', 'event.request.json()'],
		['event', 'event.request?.["text"]()'],
		['{ request }', 'request.formData()'],
		['{ request: input }', 'input.body?.getReader()'],
		['event', 'event.request.arrayBuffer()'],
		['event', 'event.request.clone().json()'],
		['event', 'event.request.body']
	]) {
		await rejects(
			route,
			`import { apiHandler } ${apiHttp}; export const POST = apiHandler(async (${argumentsSource}) => ${expression});`,
			'use-api-json-body',
			/readJsonBody.*OpenAPI/,
			1
		);
	}
	await rejects(
		route,
		'export async function parse(body: Request) { return body.json(); }',
		'use-api-json-body',
		/readJsonBody/,
		1
	);
	assert.deepEqual(
		await diagnostics(
			route,
			`import { apiHandler, readJsonBody } ${apiHttp}; export const POST = apiHandler(async (event) => { const body = await readJsonBody(event.request, 'ReviewCreateRequest'); return Response.json(body); });`
		),
		[]
	);
	assert.deepEqual(
		await diagnostics(route, 'export const decode = (response: Response) => response.json();'),
		[]
	);
});

test('restricts the raw review collection at the module boundary', async () => {
	const cases = [
		[route, `${bars}\nconst collection = reviews; export const read = () => collection.find({});`],
		[server, "export { bars } from '../db/bars.js';"],
		[server, "export const load = () => import('$lib/db/bars');"],
		[server, "const db = require('$lib/db/bars');"],
		[server, "import db from '$lib/db/db'; export const reviews = db.collection('bars');"]
	];
	for (const [file, code] of cases) {
		await rejects(
			file,
			code,
			'review-collection-boundary',
			/shared review queries.*write workflows/,
			1
		);
	}

	const queries = 'src/lib/server/reviews/queries.ts';
	const writer = 'src/lib/server/reviews/production.ts';
	for (const file of [queries, writer]) {
		assert.deepEqual(await diagnostics(file, bars), []);
		await rejects(
			file,
			"export { bars } from '$lib/db/bars';",
			'review-collection-boundary',
			/shared review queries/,
			1
		);
	}

	assert.deepEqual(
		await diagnostics(
			queries,
			`${bars}\nimport { PUBLIC_REVIEW_FILTER } from '../review-publication';\nconst filter = PUBLIC_REVIEW_FILTER; export const read = () => reviews.find(filter);`
		),
		[]
	);
	assert.deepEqual(
		await diagnostics(
			'src/lib/db/bars.ts',
			"import db from './db'; export const bars = db.collection('bars');"
		),
		[]
	);
	assert.deepEqual(
		await diagnostics(server, 'export const read = (names: string[]) => names.find(Boolean);'),
		[]
	);
});
