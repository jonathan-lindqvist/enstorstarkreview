import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Only used by the development image. The volume is shared across image rebuilds,
// so its contents, rather than the image's install layer, must match the checkout.
export function syncDependencies(root = process.cwd(), install = execFileSync) {
	const hash = createHash('sha256');
	for (const file of ['package.json', 'package-lock.json', '.npmrc']) {
		hash
			.update(file)
			.update('\0')
			.update(readFileSync(join(root, file)))
			.update('\0');
	}
	hash.update(`${process.version}:${process.platform}:${process.arch}:scripts-enabled-v1`);
	const fingerprint = hash.digest('hex');
	const marker = join(root, 'node_modules', '.dev-dependencies');
	try {
		if (readFileSync(marker, 'utf8') === fingerprint) return;
	} catch (error) {
		if (error.code !== 'ENOENT') throw error;
	}

	// A failed/interrupted install must never leave a valid marker or start Vite.
	rmSync(marker, { force: true });
	install('npm', ['ci', '--ignore-scripts=false'], { cwd: root, stdio: 'inherit' });
	writeFileSync(`${marker}.tmp`, fingerprint);
	renameSync(`${marker}.tmp`, marker);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	syncDependencies();
}
