import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
	checksFor,
	copyDirectory,
	exitHint,
	formatCoverage,
	formatSummary,
	jobsFor,
	runChecks
} from './run.js';

const clock = () => {
	let time = 0;
	return () => (time += 2000);
};

test('make check runs the fast checks; make ci runs every check in the same order', () => {
	const checks = [
		{ name: 'Linting' },
		{ name: 'Integration tests', ciOnly: true },
		{ name: 'Unit tests' }
	];
	assert.deepEqual(
		checksFor('check', checks).map(({ name }) => name),
		['Linting', 'Unit tests']
	);
	assert.deepEqual(checksFor('ci', checks), checks);
	for (const tier of [undefined, '', 'full', 'CI']) {
		assert.throws(() => checksFor(tier, checks), /Usage/, String(tier));
	}
});

test('CHECKS selects groups of checks, keeping the required setup', () => {
	const checks = [
		{ name: 'Install dependencies', required: true },
		{ name: 'Integration tests (1/2)', ciOnly: true, group: 'integration-1' },
		{ name: 'Integration tests (2/2)', ciOnly: true, group: 'integration-2' },
		{ name: 'Linting' }
	];
	const names = (groups) => checksFor('ci', checks, groups).map(({ name }) => name);
	assert.deepEqual(
		names(''),
		checks.map(({ name }) => name)
	);
	assert.deepEqual(names('integration-2'), ['Install dependencies', 'Integration tests (2/2)']);
	assert.deepEqual(names('checks,integration-1'), [
		'Install dependencies',
		'Integration tests (1/2)',
		'Linting'
	]);
	assert.throws(() => checksFor('ci', checks, 'integration'), /Unknown CHECKS: integration/);
	assert.throws(() => checksFor('check', checks, 'integration-1'), /Unknown CHECKS/);
});

test('the number of checks at once follows the memory Docker has, unless JOBS is set', () => {
	const gigabytes = (value) => value * 1024 ** 3;
	assert.equal(jobsFor({ memory: gigabytes(16) }), 3);
	assert.equal(jobsFor({ memory: gigabytes(7.7) }), 3);
	assert.equal(jobsFor({ memory: gigabytes(3.8) }), 1);
	assert.equal(jobsFor({ memory: gigabytes(4.5) }), 2);
	assert.equal(jobsFor({ memory: gigabytes(1.9) }), 1);
	assert.equal(jobsFor({ memory: gigabytes(2), requested: '5' }), 5);
	assert.equal(jobsFor({ memory: gigabytes(16), requested: '1' }), 1);
	for (const requested of ['0', '-1', '1.5', 'many']) {
		assert.throws(() => jobsFor({ memory: gigabytes(16), requested }), /JOBS/, requested);
	}
});

test('a check killed by the kernel explains that Docker ran out of memory', () => {
	assert.match(exitHint(137, null), /out of memory.*JOBS=1/s);
	assert.match(exitHint(null, 'SIGKILL'), /out of memory/);
	assert.equal(exitHint(1, null), '');
	assert.equal(exitHint(0, null), '');
});

test('every check runs and reports its own outcome after an earlier failure', async () => {
	const ran = [];
	const check = (name, passed) => ({ name, run: () => (ran.push(name), passed) });
	const results = await runChecks([check('Formatting', false), check('Linting', true)], {
		now: clock(),
		log: () => {}
	});
	assert.deepEqual(ran, ['Formatting', 'Linting']);
	assert.deepEqual(
		results.map(({ name, status }) => [name, status]),
		[
			['Formatting', 'failed'],
			['Linting', 'passed']
		]
	);
	const [timed] = await runChecks([check('Shell scripts', true)], { now: clock(), log: () => {} });
	assert.equal(timed.seconds, 2);
});

test('a failed required check skips the remaining checks without running them', async () => {
	let ran = false;
	const results = await runChecks(
		[
			{ name: 'Install dependencies', required: true, run: () => false },
			{ name: 'Linting', run: () => (ran = true) }
		],
		{ now: clock(), log: () => {} }
	);
	assert.equal(ran, false);
	assert.deepEqual(
		results.map(({ status }) => status),
		['failed', 'skipped']
	);
});

test('a check that throws fails without stopping later checks', async () => {
	const logged = [];
	const results = await runChecks(
		[
			{
				name: 'Copy checkout',
				run: () => {
					throw new Error('git ls-files failed');
				}
			},
			{ name: 'Linting', run: () => true }
		],
		{ now: clock(), log: (line) => logged.push(line) }
	);
	assert.deepEqual(
		results.map(({ status }) => status),
		['failed', 'passed']
	);
	assert.ok(logged.some((line) => line.includes('git ls-files failed')));
});

const deferred = () => {
	let resolve;
	const promise = new Promise((done) => (resolve = done));
	return { promise, resolve };
};

test('checks between required checks run at the same time', { timeout: 2000 }, async () => {
	const lintingStarted = deferred();
	const results = await runChecks(
		[
			{ name: 'Formatting', run: async () => (await lintingStarted.promise, true) },
			{ name: 'Linting', run: () => (lintingStarted.resolve(), true) }
		],
		{ now: clock(), log: () => {} }
	);
	assert.deepEqual(
		results.map(({ status }) => status),
		['passed', 'passed']
	);
});

test('no more than `jobs` checks run at once, starting in declared order', async () => {
	const started = [];
	let running = 0;
	let peak = 0;
	const check = (name) => ({
		name,
		run: async () => {
			started.push(name);
			peak = Math.max(peak, ++running);
			await new Promise((resolve) => setTimeout(resolve, 5));
			running--;
			return true;
		}
	});
	await runChecks(['Integration tests', 'Formatting', 'Linting', 'Unit'].map(check), {
		now: clock(),
		log: () => {},
		jobs: 2
	});
	assert.equal(peak, 2);
	assert.deepEqual(started, ['Integration tests', 'Formatting', 'Linting', 'Unit']);
});

test('a required check runs alone after every earlier check, before any later one', async () => {
	const events = [];
	const check = (name, required = false) => ({
		name,
		required,
		run: async () => {
			events.push(`${name} started`);
			await new Promise((resolve) => setTimeout(resolve, name === 'Formatting' ? 20 : 0));
			events.push(`${name} finished`);
			return true;
		}
	});
	await runChecks(
		[check('Formatting'), check('Linting'), check('Build app', true), check('Unit')],
		{
			now: clock(),
			log: () => {}
		}
	);
	assert.deepEqual(events, [
		'Formatting started',
		'Linting started',
		'Linting finished',
		'Formatting finished',
		'Build app started',
		'Build app finished',
		'Unit started',
		'Unit finished'
	]);
});

test('each check prints its own output with its result, in finishing order', async () => {
	const linted = deferred();
	const logged = [];
	const results = await runChecks(
		[
			{
				name: 'Formatting',
				run: async (output) => {
					output('formatting line 1\n');
					await linted.promise;
					output('formatting line 2\n');
					return false;
				}
			},
			{
				name: 'Linting',
				run: async (output) => {
					output('linting line\n');
					setTimeout(linted.resolve, 0);
					return true;
				}
			}
		],
		{ now: clock(), log: (line) => logged.push(line) }
	);
	assert.deepEqual(
		results.map(({ name }) => name),
		['Formatting', 'Linting']
	);
	const blocks = logged.filter((line) => line.includes('line'));
	assert.equal(blocks.length, 2);
	assert.match(blocks[0], /linting line\n✓ Linting \(\d+s\)$/);
	assert.match(blocks[1], /formatting line 1\nformatting line 2\n✗ Formatting \(\d+s\)$/);
});

test('on GitHub each check output is a collapsed group and a failure an annotation', async () => {
	const logged = [];
	await runChecks([{ name: 'Linting', run: (output) => (output('problem\n'), false) }], {
		now: clock(),
		log: (line) => logged.push(line),
		github: true
	});
	assert.ok(
		logged.includes('::group::Linting\nproblem\n::endgroup::\n::error::Linting failed'),
		logged.join('\n---\n')
	);
});

test('the summary marks every check and counts failures and skips', () => {
	assert.deepEqual(
		formatSummary([
			{ name: 'Formatting', status: 'passed', seconds: 3 },
			{ name: 'Linting', status: 'failed', seconds: 12 },
			{ name: 'Integration tests', status: 'skipped' }
		]),
		[
			'✓ Formatting (3s)',
			'✗ Linting (12s)',
			'– Integration tests (skipped)',
			'',
			'CI failed: 1 of 3 checks failed, 1 skipped.'
		]
	);
	assert.equal(
		formatSummary([{ name: 'Formatting', status: 'passed', seconds: 1 }]).at(-1),
		'All checks passed.'
	);
});

test('the coverage line lists each measured metric and ignores a missing report', () => {
	const metric = (pct) => ({ total: 10, covered: 7, skipped: 0, pct });
	const report = {
		total: {
			lines: metric(75.93),
			statements: metric(75.3),
			functions: metric(81.54),
			branches: metric(75.34)
		}
	};
	assert.equal(
		formatCoverage(report),
		'Coverage: lines 75.93%, branches 75.34%, functions 81.54%, statements 75.3%'
	);
	assert.equal(formatCoverage(undefined), undefined);
	assert.equal(formatCoverage({ total: {} }), undefined);
});

test('reports are copied with their nested files, contents, and permissions', () => {
	const root = mkdtempSync(join(tmpdir(), 'ci-reports-'));
	try {
		mkdirSync(join(root, 'from/src'), { recursive: true });
		writeFileSync(join(root, 'from/src/hooks.server.ts.html'), '<html></html>');
		copyDirectory(join(root, 'from'), join(root, 'to'));
		const copied = join(root, 'to/src/hooks.server.ts.html');
		assert.equal(readFileSync(copied, 'utf8'), '<html></html>');
		assert.equal(
			statSync(copied).mode & 0o777,
			statSync(join(root, 'from/src/hooks.server.ts.html')).mode & 0o777
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
