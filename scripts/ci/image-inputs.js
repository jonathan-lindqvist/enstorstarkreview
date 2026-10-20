import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Install inputs for the Dockerfile.ci layers, so script edits don't rebuild them.

const installFields = [
	'name',
	'version',
	'type',
	'engines',
	'dependencies',
	'devDependencies',
	'optionalDependencies',
	'peerDependencies',
	'overrides',
	'workspaces'
];

export function dependencyManifest(manifest) {
	return Object.fromEntries(
		installFields.filter((field) => field in manifest).map((field) => [field, manifest[field]])
	);
}

// Node-style lookup: nearest node_modules up from the package.
function resolve(packages, from, name) {
	let directory = from;
	for (;;) {
		const path = `${directory ? `${directory}/` : ''}node_modules/${name}`;
		if (path in packages) return path;
		if (!directory) return undefined;
		const parent = directory.lastIndexOf('/node_modules/');
		directory = parent === -1 ? '' : directory.slice(0, parent);
	}
}

export function playwrightInputs(manifest, lockfile) {
	const name = '@playwright/test';
	const version = manifest.devDependencies?.[name];
	if (!version) throw new Error('package.json has no Playwright dependency');
	const root = {
		name: `${manifest.name}-playwright`,
		version: '0.0.0',
		devDependencies: { [name]: version }
	};
	const packages = { '': root };
	const pending = [['', name, false]];
	while (pending.length) {
		const [from, dependency, optional] = pending.pop();
		const path = resolve(lockfile.packages, from, dependency);
		if (!path) {
			if (optional) continue;
			throw new Error(`package-lock.json has no ${dependency}`);
		}
		if (path in packages) continue;
		const entry = lockfile.packages[path];
		packages[path] = entry;
		for (const required of Object.keys(entry.dependencies ?? {})) {
			pending.push([path, required, false]);
		}
		for (const required of Object.keys(entry.optionalDependencies ?? {})) {
			pending.push([path, required, true]);
		}
	}
	return {
		manifest: { ...root, private: true },
		lockfile: {
			name: root.name,
			version: root.version,
			lockfileVersion: lockfile.lockfileVersion,
			requires: true,
			packages
		}
	};
}

const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, '\t')}\n`);

function writeInputs(source, output) {
	const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
	const lockfile = JSON.parse(readFileSync(join(source, 'package-lock.json'), 'utf8'));
	const playwright = playwrightInputs(manifest, lockfile);
	const layers = {
		dependencies: { manifest: dependencyManifest(manifest), lockfile },
		playwright
	};
	for (const [layer, inputs] of Object.entries(layers)) {
		const directory = join(output, layer);
		mkdirSync(directory, { recursive: true });
		writeJson(join(directory, 'package.json'), inputs.manifest);
		writeJson(join(directory, 'package-lock.json'), inputs.lockfile);
		copyFileSync(join(source, '.npmrc'), join(directory, '.npmrc'));
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const [source, output] = process.argv.slice(2);
	if (!source || !output) throw new Error('Usage: image-inputs.js <source> <output>');
	writeInputs(source, output);
}
