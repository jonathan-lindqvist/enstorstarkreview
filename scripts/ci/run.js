import { spawnSync } from 'node:child_process';
import {
	copyFileSync,
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	readlinkSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Runs every CI check inside the docker-compose.ci.yml container. `make ci` starts it, both
// locally and in GitHub Actions, with the checkout mounted read-only at /src.
const source = '/src';
const candidate = '/work/candidate';
const baseline = '/work/baseline';
const output = '/out';
// Mounted at the same path on the Docker host, which resolves the rehearsal's bind mounts.
const sharedTemporary = '/tmp/enstorstarkreview-ci';

const symbols = { passed: '✓', failed: '✗', skipped: '–' };

const formatResult = ({ name, status, seconds }) =>
	`${symbols[status]} ${name} (${status === 'skipped' ? 'skipped' : `${seconds}s`})`;

export function runChecks(checks, { now = Date.now, log = console.log, github = false } = {}) {
	const results = [];
	let blocked = false;
	for (const check of checks) {
		if (blocked) {
			results.push({ name: check.name, status: 'skipped' });
			continue;
		}
		log(github ? `::group::${check.name}` : `\n▶ ${check.name}`);
		const started = now();
		let passed = false;
		try {
			passed = check.run() === true;
		} catch (error) {
			log(error instanceof Error ? error.message : String(error));
		}
		const result = {
			name: check.name,
			status: passed ? 'passed' : 'failed',
			seconds: Math.round((now() - started) / 1000)
		};
		if (github) log('::endgroup::');
		log(passed || !github ? formatResult(result) : `::error::${check.name} failed`);
		results.push(result);
		blocked = !passed && check.required === true;
	}
	return results;
}

export function formatSummary(results) {
	const count = (status) => results.filter((result) => result.status === status).length;
	const [failed, skipped] = [count('failed'), count('skipped')];
	const outcome =
		failed + skipped === 0
			? 'All checks passed.'
			: `CI failed: ${failed} of ${results.length} checks failed${skipped ? `, ${skipped} skipped` : ''}.`;
	return [...results.map(formatResult), '', outcome];
}

export function coverageBaseline(env, mergeBase) {
	// GitHub supplies the event's exact baseline; a fallback there could compare a commit with itself.
	const revision = env.GITHUB_ACTIONS === 'true' || env.CI_BASE_SHA ? env.CI_BASE_SHA : mergeBase();
	if (typeof revision !== 'string' || !/^[a-f0-9]{40}$/.test(revision) || /^0+$/.test(revision)) {
		throw new Error('Expected a nonzero, lowercase, 40-character coverage baseline commit SHA');
	}
	return revision;
}

function run(command, args, { cwd = candidate, env = {} } = {}) {
	const result = spawnSync(command, args, {
		cwd,
		stdio: 'inherit',
		env: { ...process.env, ...env }
	});
	if (result.error) throw result.error;
	return result.status === 0;
}

function git(...args) {
	const result = spawnSync('git', ['-c', `safe.directory=${source}`, '-C', source, ...args], {
		encoding: 'utf8',
		maxBuffer: 64 * 1024 * 1024
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
	return result.stdout;
}

function emptyDirectory(directory) {
	mkdirSync(directory, { recursive: true });
	for (const entry of readdirSync(directory)) {
		rmSync(join(directory, entry), { recursive: true, force: true });
	}
}

// Checks the working tree as Git sees it: tracked and new files, without ignored ones.
function copyCheckout() {
	emptyDirectory(candidate);
	const files = git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0');
	for (const file of new Set(files.filter(Boolean))) {
		const from = join(source, file);
		// Deleted from the working tree but not yet committed.
		const stats = lstatSync(from, { throwIfNoEntry: false });
		if (!stats) continue;
		const to = join(candidate, file);
		mkdirSync(dirname(to), { recursive: true });
		if (stats.isSymbolicLink()) symlinkSync(readlinkSync(from), to);
		else copyFileSync(from, to);
	}
	return true;
}

function coverage() {
	const revision = coverageBaseline(process.env, () =>
		git('merge-base', 'HEAD', 'origin/main').trim()
	);
	console.log(`Baseline ${revision}`);
	emptyDirectory(baseline);
	const archive = `${baseline}.tar`;
	git('archive', `--output=${archive}`, revision);
	if (!run('tar', ['-xf', archive, '-C', baseline])) return false;
	const reports = join(output, 'coverage');
	const measure = (checkout, name) =>
		run('node', ['scripts/ci/run-coverage.js', checkout, join(reports, name)]);
	return (
		measure(baseline, 'baseline') &&
		measure(candidate, 'candidate') &&
		run(
			'node',
			[
				'scripts/ci/coverage.js',
				join(reports, 'baseline/coverage-summary.json'),
				join(reports, 'candidate/coverage-summary.json')
			],
			{ env: { GITHUB_STEP_SUMMARY: join(output, 'coverage.md') } }
		)
	);
}

const checks = [
	{ name: 'Copy checkout', required: true, run: copyCheckout },
	{
		name: 'Install dependencies',
		required: true,
		run: () => run('npm', ['ci', '--ignore-scripts=false'])
	},
	{ name: 'Formatting', run: () => run('npx', ['prettier', '--check', '.']) },
	{ name: 'Linting', run: () => run('npx', ['eslint', '.']) },
	{ name: 'Type checking', run: () => run('npm', ['run', 'check']) },
	{ name: 'OpenAPI lint', run: () => run('npm', ['run', 'api:lint']) },
	{ name: 'CI and deployment tests', run: () => run('npm', ['run', 'test:ci']) },
	{ name: 'Shell scripts', run: () => run('shellcheck', ['scripts/deploy/ssh-command.sh']) },
	{ name: 'Unit tests and coverage', run: coverage },
	{
		name: 'Backup and restore rehearsal',
		run: () => run('npm', ['run', 'test:deploy:restore'], { env: { TMPDIR: sharedTemporary } })
	},
	{ name: 'Integration tests', run: () => run('npm', ['run', 'test:integration']) }
];

function writeReports(results) {
	for (const report of ['playwright-report', 'test-results']) {
		const from = join(candidate, report);
		if (existsSync(from)) cpSync(from, join(output, report), { recursive: true });
	}
	const coverageTable = join(output, 'coverage.md');
	const summary = [
		'## CI',
		'',
		...results.map((result) => `- ${formatResult(result)}`),
		'',
		formatSummary(results).at(-1),
		'',
		existsSync(coverageTable) ? readFileSync(coverageTable, 'utf8') : ''
	];
	writeFileSync(join(output, 'summary.md'), summary.join('\n'));
	// Root creates the reports; hand them to the checkout's owner so they can be removed.
	const { uid, gid } = statSync(source);
	spawnSync('chown', ['-R', `${uid}:${gid}`, output]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	emptyDirectory(output);
	const results = runChecks(checks, { github: process.env.GITHUB_ACTIONS === 'true' });
	writeReports(results);
	console.log(['', 'CI summary', '', ...formatSummary(results)].join('\n'));
	process.exitCode = results.every((result) => result.status === 'passed') ? 0 : 1;
}
