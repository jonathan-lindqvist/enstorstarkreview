import { spawn, spawnSync } from 'node:child_process';
import {
	copyFileSync,
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
import { totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Runs the CI checks inside the docker-compose.ci.yml container: `make check` runs the fast
// checks, `make ci` all but the full-only ones, and `make ci FULL=1` every check. GitHub Actions
// runs `make ci CHECKS=<group>`, which includes the named group. The checkout is mounted
// read-only at /src; the checks run on a copy and their reports go to /out.
const source = '/src';
const checkout = '/work/checkout';
const output = '/out';
// Mounted at the same path on the Docker host, which resolves the rehearsal's bind mounts.
const sharedTemporary = '/tmp/enstorstarkreview-ci';

const symbols = { passed: '✓', failed: '✗', skipped: '–', deferred: '–' };
const notes = { skipped: 'skipped', deferred: 'skipped: run `make ci FULL=1` to include it' };

const formatResult = ({ name, status, seconds }) =>
	`${symbols[status]} ${name} (${notes[status] ?? `${seconds}s`})`;

// `groups` is the comma-separated CHECKS of `make ci CHECKS=...`; GitHub runs each group as its own
// job. The required setup always runs. `full` is `make ci FULL=1`.
export function checksFor(tier, checks, groups = '', full = false) {
	if (tier !== 'ci' && tier !== 'check') throw new Error('Usage: run.js check|ci');
	const selected = tier === 'ci' ? checks : checks.filter((check) => !check.ciOnly);
	if (!groups) return full ? selected : selected.filter((check) => !check.fullOnly);
	const groupOf = (check) => check.group ?? 'checks';
	const wanted = groups.split(',');
	const unknown = wanted.filter((group) => !selected.some((check) => groupOf(check) === group));
	if (unknown.length > 0) throw new Error(`Unknown CHECKS: ${unknown.join(', ')}`);
	return selected.filter((check) => check.required || wanted.includes(groupOf(check)));
}

// The checks a plain `make ci` leaves to `make ci FULL=1`; reported as skipped, never as failures.
export const deferredChecks = (tier, checks, groups = '', full = false) =>
	tier === 'ci' && !groups && !full ? checks.filter((check) => check.fullOnly) : [];

// A required check runs alone; the checks between required checks run concurrently, at most `jobs`
// at once in declared order. Each check's output is buffered and printed with its result, so
// concurrent output never interleaves.
export async function runChecks(
	checks,
	{ now = () => performance.now(), log = console.log, github = false, jobs = Infinity } = {}
) {
	const results = [];
	let blocked = false;
	for (let start = 0; start < checks.length; ) {
		let end = start + 1;
		if (!checks[start].required) while (end < checks.length && !checks[end].required) end++;
		const group = checks.slice(start, end);
		start = end;
		if (blocked) {
			results.push(...group.map(({ name }) => ({ name, status: 'skipped' })));
			continue;
		}
		const groupResults = [];
		let next = 0;
		const lane = async () => {
			while (next < group.length) {
				const index = next++;
				groupResults[index] = await runCheck(group[index], { now, log, github });
			}
		};
		await Promise.all(Array.from({ length: Math.min(jobs, group.length) }, lane));
		results.push(...groupResults);
		blocked = group.some(
			(check, index) => check.required && groupResults[index].status !== 'passed'
		);
	}
	return results;
}

async function runCheck(check, { now, log, github }) {
	log(`▶ ${check.name}`);
	const started = now();
	const chunks = [];
	let passed = false;
	try {
		passed = (await check.run((chunk) => chunks.push(Buffer.from(chunk)))) === true;
	} catch (error) {
		chunks.push(Buffer.from(`${error instanceof Error ? error.message : String(error)}\n`));
	}
	const result = {
		name: check.name,
		status: passed ? 'passed' : 'failed',
		seconds: Math.round((now() - started) / 1000)
	};
	let text = Buffer.concat(chunks).toString();
	if (text && !text.endsWith('\n')) text += '\n';
	const outcome = passed || !github ? formatResult(result) : `::error::${check.name} failed`;
	log(
		github
			? `::group::${check.name}\n${text}::endgroup::\n${outcome}`
			: `\n── ${check.name} ──\n${text}${outcome}`
	);
	return result;
}

// A Playwright shard needs about 1.5 GB beside the databases; small Docker VMs run checks in turn.
export function jobsFor({ memory, requested = '' }) {
	if (requested) {
		if (!/^[1-9]\d*$/.test(requested)) throw new Error('JOBS must be a positive whole number');
		return Number(requested);
	}
	const gigabytes = memory / 1024 ** 3;
	return Math.min(3, Math.max(1, Math.floor((gigabytes - 1) / 1.5)));
}

// Exit status 137 is a SIGKILL, which in a container usually means the kernel ran out of memory.
export function exitHint(code, signal) {
	if (code !== 137 && signal !== 'SIGKILL') return '';
	return '\nKilled: Docker probably ran out of memory. Give Docker more memory, or run `make ci JOBS=1`.\n';
}

export function formatSummary(results) {
	const count = (status) => results.filter((result) => result.status === status).length;
	const [failed, skipped, deferred] = [count('failed'), count('skipped'), count('deferred')];
	const outcome =
		failed + skipped > 0
			? `CI failed: ${failed} of ${results.length} checks failed${skipped ? `, ${skipped} skipped` : ''}.`
			: deferred > 0
				? `All checks passed; ${deferred} skipped. \`make ci FULL=1\` runs every check.`
				: 'All checks passed.';
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
	return (write) =>
		new Promise((resolve, reject) => {
			const child = spawn(command, args, {
				cwd: checkout,
				stdio: ['ignore', 'pipe', 'pipe'],
				env: { ...process.env, ...env }
			});
			child.stdout.on('data', write);
			child.stderr.on('data', write);
			child.on('error', reject);
			child.on('close', (code, signal) => {
				const hint = exitHint(code, signal);
				if (hint) write(hint);
				resolve(code === 0);
			});
		});
}

// Shards running side by side each need their own MongoDB; one at a time, or alone on a GitHub runner,
// they share mongo-1 as a single Playwright run did.
export function shardDatabases({ jobs, shards }) {
	const separate = jobs > 1 && shards.length > 1;
	return Object.fromEntries(
		shards.map((shard) => [shard, separate ? `mongo-${shard}` : 'mongo-1'])
	);
}

// Set by the entry point before any check runs: each shard's database and when the extras are up.
const databases = { hosts: {}, ready: Promise.resolve(true) };

// The stack starts only mongo-1; run.js starts the others on the host daemon when shards need them.
function startDatabases(hosts) {
	const extra = [...new Set(Object.values(hosts))].filter((host) => host !== 'mongo-1');
	if (extra.length === 0) return Promise.resolve(true);
	const compose = [
		'compose',
		'-p',
		process.env.CI_PROJECT,
		'-f',
		join(source, 'docker-compose.ci.yml')
	];
	return new Promise((resolve) => {
		const child = spawn('docker', [...compose, 'up', '-d', '--wait', '--no-build', ...extra], {
			stdio: 'ignore'
		});
		child.on('error', () => resolve(false));
		child.on('close', (code) => resolve(code === 0));
	});
}

const integrationShards = 3;
const integrationShard = (shard) => ({
	name: `Integration tests (${shard}/${integrationShards})`,
	ciOnly: true,
	group: `integration-${shard}`,
	run: async (write) => {
		if (!(await databases.ready)) {
			write(
				'Starting the shard databases failed; see `docker compose logs` for mongo-2 and mongo-3.\n'
			);
			return false;
		}
		return run(
			'npm',
			[
				'run',
				'test:integration',
				'--',
				`--shard=${shard}/${integrationShards}`,
				`--output=test-results/shard-${shard}`
			],
			{
				env: {
					PLAYWRIGHT_PREBUILT: 'true',
					MONGO_URI: `mongodb://${databases.hosts[shard]}:27017/enstorstark`,
					PLAYWRIGHT_PORT: String(4173 + shard * 10),
					PLAYWRIGHT_WEBHOOK_PORT: String(4174 + shard * 10),
					REVIEW_IMAGE_DIR: `/tmp/playwright-images-${shard}`
				}
			}
		)(write);
	}
});

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

export const checks = [
	{ name: 'Copy checkout', required: true, run: copyCheckout },
	{
		name: 'Install dependencies',
		required: true,
		run: run('npm', ['ci', '--ignore-scripts=false'])
	},
	// Production mode, like Playwright's own build.
	{
		name: 'Build app',
		ciOnly: true,
		required: true,
		run: run('npm', ['run', 'build'], { env: { NODE_ENV: 'production' } })
	},
	// The longest checks start first. The rehearsal only tests backups and deployment, so a plain
	// `make ci` skips it unless FULL=1; GitHub always runs it.
	{
		name: 'Backup and restore rehearsal',
		ciOnly: true,
		fullOnly: true,
		group: 'rehearsal',
		run: run('npm', ['run', 'test:deploy:restore'], { env: { TMPDIR: sharedTemporary } })
	},
	...Array.from({ length: integrationShards }, (_, index) => integrationShard(index + 1)),
	{ name: 'Formatting', run: run('npx', ['prettier', '--check', '.']) },
	{ name: 'Markdown line breaks', run: run('npm', ['run', 'lint:markdown']) },
	{ name: 'Linting', run: run('npx', ['eslint', '.']) },
	{ name: 'Type checking', run: run('npm', ['run', 'check']) },
	{ name: 'OpenAPI lint', run: run('npm', ['run', 'api:lint']) },
	{ name: 'CI and deployment tests', run: run('npm', ['run', 'test:ci']) },
	{ name: 'Shell scripts', run: run('shellcheck', ['scripts/deploy/ssh-command.sh']) },
	{ name: 'Unit tests and coverage', run: run('npm', ['run', 'test:coverage']) }
];

// Copies file by file: Node's native cpSync leaves write-only, empty files and fails with EACCES
// on the Colima (virtiofs) bind mount that /out is on macOS.
export function copyDirectory(from, to) {
	mkdirSync(to, { recursive: true });
	for (const entry of readdirSync(from, { withFileTypes: true })) {
		const [source, target] = [join(from, entry.name), join(to, entry.name)];
		if (entry.isDirectory()) copyDirectory(source, target);
		else if (entry.isSymbolicLink()) symlinkSync(readlinkSync(source), target);
		else copyFileSync(source, target);
	}
}

function writeReports(results) {
	for (const report of ['coverage', 'test-results']) {
		const from = join(checkout, report);
		if (existsSync(from)) copyDirectory(from, join(output, report));
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
	const selection = [process.argv[2], checks, process.env.CI_CHECKS, process.env.CI_FULL === '1'];
	const selected = checksFor(...selection);
	const deferred = deferredChecks(...selection);
	emptyDirectory(output);
	// A container may be limited below the memory of the Docker VM it runs in.
	const limit = process.constrainedMemory?.() ?? 0;
	const memory = limit > 0 ? Math.min(limit, totalmem()) : totalmem();
	const jobs = jobsFor({ memory, requested: process.env.CI_JOBS });
	const concurrency = `Up to ${jobs} check${jobs === 1 ? '' : 's'} at a time (${(memory / 1024 ** 3).toFixed(1)} GB for Docker; set JOBS to change).`;
	console.log(concurrency);
	for (const { name } of deferred) console.log(`Skipping ${name}; \`make ci FULL=1\` runs it.`);
	const shards = selected
		.map((check) => check.group?.match(/^integration-(\d+)$/)?.[1])
		.filter(Boolean)
		.map(Number);
	databases.hosts = shardDatabases({ jobs, shards });
	// Starts while the checkout is copied, installed, and built.
	databases.ready = startDatabases(databases.hosts);
	const results = [
		...(await runChecks(selected, { github: process.env.GITHUB_ACTIONS === 'true', jobs })),
		...deferred.map(({ name }) => ({ name, status: 'deferred' }))
	];
	try {
		console.log(['', 'CI summary', '', ...writeReports(results), '', concurrency].join('\n'));
	} finally {
		// Root writes the reports; hand them to the checkout's owner so they can be removed.
		const { uid, gid } = statSync(source);
		spawnSync('chown', ['-R', `${uid}:${gid}`, output]);
	}
	process.exitCode = results.every(({ status }) => status === 'passed' || status === 'deferred')
		? 0
		: 1;
}
