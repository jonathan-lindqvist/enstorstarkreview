import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncDependencies } from './sync-dependencies.js';

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), 'dev-dependencies-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	writeFileSync(join(root, 'package.json'), '{"name":"fixture"}');
	writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3}');
	writeFileSync(join(root, '.npmrc'), 'ignore-scripts=true\n');
	mkdirSync(join(root, 'node_modules'));
	let installs = 0;
	const install = (command, args, options) => {
		assert.equal(command, 'npm');
		assert.deepEqual(args, ['ci', '--ignore-scripts=false']);
		assert.equal(options.cwd, root);
		installs++;
		writeFileSync(join(root, 'node_modules', 'installed'), 'ready');
	};
	return { root, install, count: () => installs };
}

test('repairs an existing stale volume once, then skips unchanged dependencies', (t) => {
	const f = fixture(t);
	syncDependencies(f.root, f.install);
	assert.equal(f.count(), 1);
	assert.equal(readFileSync(join(f.root, 'node_modules', 'installed'), 'utf8'), 'ready');
	syncDependencies(f.root, f.install);
	assert.equal(f.count(), 1);
});

for (const file of ['package.json', 'package-lock.json', '.npmrc']) {
	test(`refreshes the volume when ${file} changes`, (t) => {
		const f = fixture(t);
		syncDependencies(f.root, f.install);
		writeFileSync(join(f.root, file), 'changed');
		syncDependencies(f.root, f.install);
		assert.equal(f.count(), 2);
	});
}

test('failed installation blocks startup and is retried on the next run', (t) => {
	const f = fixture(t);
	assert.throws(
		() =>
			syncDependencies(f.root, () => {
				throw new Error('npm failed');
			}),
		/npm failed/
	);
	syncDependencies(f.root, f.install);
	assert.equal(f.count(), 1);
});

test('a missing lockfile fails before installing anything', (t) => {
	const f = fixture(t);
	rmSync(join(f.root, 'package-lock.json'));
	assert.throws(() => syncDependencies(f.root, f.install), /ENOENT/);
	assert.equal(f.count(), 0);
});
