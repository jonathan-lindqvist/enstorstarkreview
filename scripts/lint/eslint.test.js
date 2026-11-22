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
const visibility =
	"import { PUBLIC_REVIEW_FILTER as publicOnly } from '$lib/server/review-publication';";

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
		[client, "export const load = () => import('$lib/db/bars');"],
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
	assert.deepEqual(await diagnostics(server, "import 'fs'; import '$lib/db/bars';"), []);
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

test('enforces review visibility filters and sends route writes to workflows', async () => {
	for (const code of [
		'reviews.findOne({ slug: "test" });',
		'reviews.find();',
		'reviews.distinct("location", {});',
		'reviews.aggregate([{ $match: { ...publicOnly, ...scope } }]);',
		'reviews.aggregate([{ $limit: 5 }, { $match: publicOnly }]);',
		'reviews.find({ $or: [publicOnly, {}] });',
		'reviews.find({ $and: [publicOnly], ...scope });',
		'function invalid(publicOnly: object) { return reviews.find(publicOnly); }'
	]) {
		await rejects(
			server,
			`${bars}\n${visibility}\n${code}`,
			'review-collection-boundary',
			/PUBLIC_REVIEW_FILTER.*ACTIVE_REVIEW_FILTER.*withReviewVisibility/,
			3
		);
	}
	await rejects(
		'src/routes/lint-fixture/+page.server.ts',
		`${bars}\nreviews['updateOne']({}, {});`,
		'review-collection-boundary',
		/shared review workflow/,
		2
	);
	assert.deepEqual(
		await diagnostics(
			server,
			`${bars}\n${visibility}\nreviews.find({ $and: [{ slug: "test" }, publicOnly] }); reviews.distinct('location', publicOnly); reviews.aggregate([{ $match: publicOnly }]);`
		),
		[]
	);
	assert.deepEqual(
		await diagnostics(
			server,
			"import * as db from '$lib/db/bars'; import * as visibility from './review-publication'; db.bars.findOne(visibility.withReviewVisibility({}, false));"
		),
		[]
	);
	assert.deepEqual(
		await diagnostics(server, 'export const run = (reviews: string[]) => reviews.find(Boolean);'),
		[]
	);
});

test('allows review writes to check slug reservations without exposing a review document', async () => {
	const writer = 'src/lib/server/reviews/lint-fixture.ts';
	const importFilter =
		"import { reviewSlugReservationFilter as reservedSlug } from '$lib/server/reviews/persistence';";
	const source = (query) => `${bars}\n${importFilter}\n${query}`;
	const bounded = `reviews.countDocuments(reservedSlug('baren'), { limit: 1 });`;
	assert.deepEqual(await diagnostics(writer, source(bounded)), []);

	for (const query of [
		`reviews.countDocuments(reservedSlug('baren'));`,
		`reviews.countDocuments(reservedSlug('baren'), { limit: 2 });`,
		`reviews.findOne(reservedSlug('baren'), { limit: 1 });`
	]) {
		await rejects(
			writer,
			source(query),
			'review-collection-boundary',
			/Check slug reservations.*limit: 1/,
			3
		);
	}
	await rejects(
		route,
		source(bounded),
		'review-collection-boundary',
		/Check slug reservations.*shared review write workflow/,
		3
	);
	await rejects(
		writer,
		source("reviews.countDocuments({ slug: 'baren' }, { limit: 1 });"),
		'review-collection-boundary',
		/Apply PUBLIC_REVIEW_FILTER/,
		3
	);
});
