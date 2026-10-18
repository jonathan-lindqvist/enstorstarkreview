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

// Runs the CI checks inside the docker-compose.ci.yml container: `make check` runs the fast
// checks and `make ci` all of them; GitHub Actions runs `make ci`. The checkout is mounted
// read-only at /src; the checks run on a copy and their reports go to /out.
const source = '/src';
const checkout = '/work/checkout';
const output = '/out';
// Mounted at the same path on the Docker host, which resolves the rehearsal's bind mounts.
const sharedTemporary = '/tmp/enstorstarkreview-ci';

const symbols = { passed: '✓', failed: '✗', skipped: '–' };

const formatResult = ({ name, status, seconds }) =>
	`${symbols[status]} ${name} (${status === 'skipped' ? 'skipped' : `${seconds}s`})`;

export function checksFor(tier, checks) {
	if (tier === 'ci') return checks;
	if (tier === 'check') return checks.filter((check) => !check.ciOnly);
	throw new Error('Usage: run.js check|ci');
}

export function runChecks(
	checks,
	{ now = () => performance.now(), log = console.log, github = false } = {}
) {
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

// The floor itself is enforced by `npm run test:coverage`; this only reports the measurement.
export function formatCoverage(report) {
	const metrics = ['lines', 'branches', 'functions', 'statements'];
	const total = report?.total;
	if (!metrics.every((metric) => typeof total?.[metric]?.pct === 'number')) return undefined;
	return `Coverage: ${metrics.map((metric) => `${metric} ${total[metric].pct}%`).join(', ')}`;
}

function run(command, args, { env = {} } = {}) {
	const result = spawnSync(command, args, {
		cwd: checkout,
		stdio: 'inherit',
		env: { ...process.env, ...env }
	});
	if (result.error) throw result.error;
	return result.status === 0;
}

function emptyDirectory(directory) {
	mkdirSync(directory, { recursive: true });
	for (const entry of readdirSync(directory)) {
		rmSync(join(directory, entry), { recursive: true, force: true });
	}
}

// Checks the working tree as Git sees it: tracked and new files, without ignored ones.
function copyCheckout() {
	// The container only reads the checkout, whose owner is a host user.
	const git = spawnSync(
		'git',
		[
			'-c',
			'safe.directory=*',
			'-C',
			source,
			'ls-files',
			'-z',
			'--cached',
			'--others',
			'--exclude-standard'
		],
		{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
	);
	if (git.error) throw git.error;
	if (git.status !== 0) throw new Error(`git ls-files failed: ${git.stderr.trim()}`);
	emptyDirectory(checkout);
	for (const file of new Set(git.stdout.split('\0').filter(Boolean))) {
		const from = join(source, file);
		// Skips files deleted but not yet committed, and nested repositories and submodules, which
		// ls-files lists as directories; GitHub's checkout contains none of them either.
		const stats = lstatSync(from, { throwIfNoEntry: false });
		if (!stats || stats.isDirectory()) continue;
		const to = join(checkout, file);
		mkdirSync(dirname(to), { recursive: true });
		if (stats.isSymbolicLink()) symlinkSync(readlinkSync(from), to);
		else copyFileSync(from, to);
	}
	return true;
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
	{ name: 'Unit tests and coverage', run: () => run('npm', ['run', 'test:coverage']) },
	{
		name: 'Backup and restore rehearsal',
		ciOnly: true,
		run: () => run('npm', ['run', 'test:deploy:restore'], { env: { TMPDIR: sharedTemporary } })
	},
	{ name: 'Integration tests', ciOnly: true, run: () => run('npm', ['run', 'test:integration']) }
];

function writeReports(results) {
	for (const report of ['coverage', 'test-results']) {
		const from = join(checkout, report);
		if (existsSync(from)) cpSync(from, join(output, report), { recursive: true });
	}
	const coverageReport = join(output, 'coverage/coverage-summary.json');
	const coverage = existsSync(coverageReport)
		? formatCoverage(JSON.parse(readFileSync(coverageReport, 'utf8')))
		: undefined;
	const summary = formatSummary(results);
	writeFileSync(
		join(output, 'summary.md'),
		[
			'## CI',
			'',
			...results.map((result) => `- ${formatResult(result)}`),
			'',
			summary.at(-1),
			...(coverage ? ['', coverage] : []),
			''
		].join('\n')
	);
	return [...summary, ...(coverage ? ['', coverage] : [])];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const selected = checksFor(process.argv[2], checks);
	emptyDirectory(output);
	const results = runChecks(selected, { github: process.env.GITHUB_ACTIONS === 'true' });
	try {
		console.log(['', 'CI summary', '', ...writeReports(results)].join('\n'));
	} finally {
		// Root writes the reports; hand them to the checkout's owner so they can be removed.
		const { uid, gid } = statSync(source);
		spawnSync('chown', ['-R', `${uid}:${gid}`, output]);
	}
	process.exitCode = results.every((result) => result.status === 'passed') ? 0 : 1;
}
