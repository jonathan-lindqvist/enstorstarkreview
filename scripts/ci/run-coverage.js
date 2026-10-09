import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [checkout, output] = process.argv.slice(2);
if (!checkout || !output || process.argv.length !== 4) {
	throw new Error('Usage: run-coverage.js CHECKOUT REPORT_DIRECTORY');
}
const cwd = resolve(checkout);
const run = (args) => {
	const result = spawnSync('npm', args, { cwd, stdio: 'inherit', env: process.env });
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
};
run(['ci', '--ignore-scripts=false']);
const lock = JSON.parse(readFileSync(resolve(cwd, 'package-lock.json'), 'utf8'));
const version = lock.packages?.['node_modules/vitest']?.version;
if (!version) throw new Error('Locked Vitest version is missing');
// Bootstrap historical main only; never silently replace a declared/mismatched provider.
const declared = lock.packages?.['']?.devDependencies?.['@vitest/coverage-v8'];
if (!declared) {
	run([
		'exec',
		'--yes',
		'--package=npm@11.21.0',
		'--',
		'npm',
		'install',
		'--no-save',
		'--ignore-scripts=false',
		`@vitest/coverage-v8@${version}`
	]);
}
const installedVitest = JSON.parse(readFileSync(resolve(cwd, 'node_modules/vitest/package.json')));
const provider = JSON.parse(
	readFileSync(resolve(cwd, 'node_modules/@vitest/coverage-v8/package.json'))
);
if (installedVitest.version !== version || provider.version !== version) {
	throw new Error('Vitest and coverage provider must match the locked Vitest version');
}
run(['exec', '--', 'svelte-kit', 'sync']);
// Force the same application scope on both revisions, including unimported files.
run([
	'exec',
	'--',
	'vitest',
	'run',
	'--coverage',
	'--coverage.provider=v8',
	'--coverage.include=src/**/*.{js,ts}',
	'--coverage.exclude=**/*.{test,spec}.{js,ts}',
	'--coverage.exclude=**/*.d.ts',
	'--coverage.exclude=**/test-fixtures.{js,ts}',
	'--coverage.exclude=**/fixtures/**',
	'--coverage.exclude=**/__fixtures__/**',
	'--coverage.reporter=text',
	'--coverage.reporter=json-summary',
	'--coverage.reporter=html',
	`--coverage.reportsDirectory=${resolve(output)}`
]);
