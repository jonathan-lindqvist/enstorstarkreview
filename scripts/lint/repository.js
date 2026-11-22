import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
	androidModels,
	checkNativeImports,
	checkPriceValueParity,
	priceValuePaths,
	swiftModels
} from './native.js';
import { checkWorkflow } from './workflows.js';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

export function checkRepository(root = repositoryRoot) {
	const read = (path) => readFileSync(join(root, path), 'utf8');
	const filesIn = (directory, recursive = false) =>
		readdirSync(join(root, directory), { recursive, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => relative(root, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
			.sort();

	const sources = Object.fromEntries(
		Object.entries(priceValuePaths).map(([platform, path]) => [
			platform,
			{ path, source: read(path) }
		])
	);
	return [
		...filesIn('.github/workflows')
			.filter((path) => /\.ya?ml$/.test(path))
			.flatMap((path) => checkWorkflow(path, read(path))),
		...filesIn(swiftModels, true)
			.filter((path) => path.endsWith('.swift'))
			.flatMap((path) => checkNativeImports(path, read(path))),
		...filesIn(androidModels, true)
			.filter((path) => path.endsWith('.kt'))
			.flatMap((path) => checkNativeImports(path, read(path))),
		...checkPriceValueParity(sources)
	];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const findings = checkRepository();
	for (const { path, line, id, message } of findings) {
		console.error(`${path}:${line}: error [${id}] ${message}`);
	}
	if (findings.length) process.exitCode = 1;
}
