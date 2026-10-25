// Compares two OpenAPI documents semantically and prints the differences.
// Usage: node scripts/compare-openapi.js <before> <after> [--prose] [--strict]
// `--prose` lists changed descriptions; `--strict` exits 1 when there are semantic differences.
// Each document is a file path or `git:<revision>` for openapi/v1.yaml at that revision, e.g.
// `npm run api:diff` compares `git:origin/main` with the working tree.
// Shared responses, parameters and headers are inlined and path-level parameters move into their
// operations, so moving a definition is not a difference. Prose (description, summary, examples,
// title) is compared separately and only counted, because rewording does not affect clients.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';

const PROSE = new Set(['description', 'summary', 'examples', 'title']);
const METHODS = ['get', 'put', 'post', 'delete', 'patch'];

const load = (source) =>
	parse(
		source.startsWith('git:')
			? execFileSync('git', ['show', `${source.slice(4)}:openapi/v1.yaml`], { encoding: 'utf8' })
			: readFileSync(source, 'utf8')
	);

const resolver = (document) => {
	const resolve = (value) => {
		if (Array.isArray(value)) return value.map(resolve);
		if (!value || typeof value !== 'object') return value;
		const ref = value.$ref;
		if (typeof ref === 'string' && /^#\/components\/(responses|parameters|headers)\//.test(ref)) {
			const [, , kind, name] = ref.split('/');
			return resolve(document.components[kind][name]);
		}
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item)]));
	};
	return resolve;
};

const stripProse = (value, prose, path) => {
	if (Array.isArray(value))
		return value.map((item, index) => stripProse(item, prose, `${path}/${index}`));
	if (!value || typeof value !== 'object') return value;
	const result = {};
	for (const [key, item] of Object.entries(value)) {
		if (PROSE.has(key) && typeof item !== 'object') prose.set(`${path}/${key}`, item);
		else if (key === 'examples') prose.set(`${path}/${key}`, JSON.stringify(item));
		else result[key] = stripProse(item, prose, `${path}/${key}`);
	}
	if (Array.isArray(result.required) && result.required.every((item) => typeof item === 'string')) {
		result.required = [...result.required].sort();
	}
	return result;
};

const operations = (document) => {
	const resolve = resolver(document);
	const result = {};
	for (const [path, item] of Object.entries(document.paths ?? {})) {
		for (const method of METHODS) {
			if (!item[method]) continue;
			const operation = resolve(item[method]);
			const parameters = [...(resolve(item.parameters) ?? []), ...(operation.parameters ?? [])]
				.map((parameter) => ({
					...parameter,
					name: parameter.in === 'header' ? parameter.name.toLowerCase() : parameter.name,
					required: parameter.required ?? false
				}))
				.sort((first, second) =>
					`${first.in}:${first.name}`.localeCompare(`${second.in}:${second.name}`)
				);
			result[`${method.toUpperCase()} ${path}`] = {
				...operation,
				...(parameters.length ? { parameters } : {}),
				responses: Object.fromEntries(
					Object.entries(operation.responses ?? {}).map(([status, response]) => [
						status,
						{
							...response,
							...(response.headers
								? {
										headers: Object.fromEntries(
											Object.entries(response.headers).map(([name, header]) => [
												name.toLowerCase(),
												header
											])
										)
									}
								: {})
						}
					])
				)
			};
		}
	}
	return result;
};

const describe = (value) => JSON.stringify(value);

const diff = (before, after, path, out) => {
	if (isDeepStrictEqual(before, after)) return;
	if (
		before &&
		after &&
		typeof before === 'object' &&
		typeof after === 'object' &&
		!Array.isArray(before) &&
		!Array.isArray(after)
	) {
		for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
			if (!(key in after)) out.push(`- ${path}/${key}: removed (was ${describe(before[key])})`);
			else if (!(key in before)) out.push(`+ ${path}/${key}: added ${describe(after[key])}`);
			else diff(before[key], after[key], `${path}/${key}`, out);
		}
		return;
	}
	out.push(`~ ${path}: ${describe(before)} -> ${describe(after)}`);
};

const [beforeFile, afterFile] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
if (!beforeFile || !afterFile) {
	console.error('Usage: node scripts/compare-openapi.js <before.yaml> <after.yaml>');
	process.exit(2);
}
const before = load(beforeFile);
const after = load(afterFile);
const beforeProse = new Map();
const afterProse = new Map();
const out = [];

const top = (document, prose) =>
	stripProse(
		{
			openapi: document.openapi,
			info: document.info,
			servers: document.servers,
			tags: document.tags,
			security: document.security
		},
		prose,
		''
	);
diff(top(before, beforeProse), top(after, afterProse), '', out);
diff(
	stripProse(operations(before), beforeProse, '#/paths'),
	stripProse(operations(after), afterProse, '#/paths'),
	'#/paths',
	out
);
diff(
	stripProse(before.components?.schemas ?? {}, beforeProse, '#/components/schemas'),
	stripProse(after.components?.schemas ?? {}, afterProse, '#/components/schemas'),
	'#/components/schemas',
	out
);
diff(
	before.components?.securitySchemes,
	after.components?.securitySchemes,
	'#/components/securitySchemes',
	out
);

const changedProse = [...new Set([...beforeProse.keys(), ...afterProse.keys()])].filter(
	(key) => beforeProse.get(key) !== afterProse.get(key)
);
console.log(out.length ? out.join('\n') : 'No semantic differences.');
console.log(
	`\nProse differences (descriptions, summaries, examples, titles): ${changedProse.length}`
);
if (process.argv.includes('--prose')) for (const key of changedProse) console.log(`  ${key}`);
process.exitCode = out.length && process.argv.includes('--strict') ? 1 : 0;
