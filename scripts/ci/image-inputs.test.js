import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dependencyManifest, playwrightInputs } from './image-inputs.js';

const read = (file) => JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
const manifest = read('package.json');
const lockfile = read('package-lock.json');

const withScript = { ...manifest, scripts: { ...manifest.scripts, extra: 'echo extra' } };

const bumped = (name, version) => [
	{ ...manifest, devDependencies: { ...manifest.devDependencies, [name]: version } },
	{
		...lockfile,
		packages: {
			...lockfile.packages,
			'': {
				...lockfile.packages[''],
				devDependencies: { ...lockfile.packages[''].devDependencies, [name]: version }
			},
			[`node_modules/${name}`]: { ...lockfile.packages[`node_modules/${name}`], version }
		}
	}
];

test('the dependency manifest ignores script edits but not dependency changes', () => {
	assert.deepEqual(dependencyManifest(withScript), dependencyManifest(manifest));
	assert.equal(dependencyManifest(manifest).scripts, undefined);
	assert.deepEqual(dependencyManifest(manifest).devDependencies, manifest.devDependencies);
	assert.deepEqual(dependencyManifest(manifest).overrides, manifest.overrides);
	assert.notDeepEqual(dependencyManifest(bumped('vite', '9.0.0')[0]), dependencyManifest(manifest));
});

test('the Playwright inputs change only with the locked Playwright packages', () => {
	const current = playwrightInputs(manifest, lockfile);
	assert.deepEqual(playwrightInputs(withScript, lockfile), current);
	assert.deepEqual(playwrightInputs(...bumped('vite', '9.0.0')), current);
	assert.notDeepEqual(playwrightInputs(...bumped('@playwright/test', '9.9.9')), current);
});

test('the Playwright lockfile keeps the locked integrity of only its dependency tree', () => {
	const { manifest: playwrightManifest, lockfile: playwrightLockfile } = playwrightInputs(
		manifest,
		lockfile
	);
	const version = manifest.devDependencies['@playwright/test'];
	assert.deepEqual(playwrightManifest.devDependencies, { '@playwright/test': version });
	assert.deepEqual(Object.keys(playwrightLockfile.packages).sort(), [
		'',
		'node_modules/@playwright/test',
		'node_modules/fsevents',
		'node_modules/playwright',
		'node_modules/playwright-core'
	]);
	for (const [path, entry] of Object.entries(playwrightLockfile.packages)) {
		if (path) assert.deepEqual(entry, lockfile.packages[path]);
	}
});

test('the Playwright inputs refuse a manifest or lockfile without Playwright', () => {
	const { '@playwright/test': _, ...devDependencies } = manifest.devDependencies;
	assert.throws(() => playwrightInputs({ ...manifest, devDependencies }, lockfile), /Playwright/);
	const { 'node_modules/playwright-core': __, ...packages } = lockfile.packages;
	assert.throws(() => playwrightInputs(manifest, { ...lockfile, packages }), /playwright-core/);
});
