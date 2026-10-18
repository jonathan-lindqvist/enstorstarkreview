import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checksFor, formatCoverage, formatSummary, runChecks } from './run.js';

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
	assert.equal(results[0].seconds, 2);
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

test('consecutive concurrent checks start together and print their output as one block each', async () => {
	const logged = [];
	let releaseRehearsal;
	const results = await runChecks(
		[
			{ name: 'Linting', run: () => true },
			{
				name: 'Backup and restore rehearsal',
				concurrent: true,
				// Finishes only after the next check has started, so a sequential runner never returns.
				run: (output) =>
					new Promise((resolve) => {
						output.push('rehearsal line\n');
						releaseRehearsal = () => resolve(true);
					})
			},
			{
				name: 'Integration tests',
				concurrent: true,
				run: async (output) => {
					output.push('playwright line\n');
					releaseRehearsal();
					return false;
				}
			}
		],
		{ now: clock(), log: (line) => logged.push(line) }
	);
	assert.deepEqual(
		results.map(({ name, status }) => [name, status]),
		[
			['Linting', 'passed'],
			['Backup and restore rehearsal', 'passed'],
			['Integration tests', 'failed']
		]
	);
	const block = (name) => logged.slice(logged.indexOf(`\n▶ ${name}`)).slice(0, 2);
	assert.deepEqual(block('Integration tests'), ['\n▶ Integration tests', 'playwright line']);
	assert.deepEqual(block('Backup and restore rehearsal'), [
		'\n▶ Backup and restore rehearsal',
		'rehearsal line'
	]);
});

test('a failed required check also skips the concurrent checks after it', async () => {
	let ran = false;
	const results = await runChecks(
		[
			{ name: 'Install dependencies', required: true, run: () => false },
			{ name: 'Backup and restore rehearsal', concurrent: true, run: async () => (ran = true) },
			{ name: 'Integration tests', concurrent: true, run: async () => (ran = true) }
		],
		{ now: clock(), log: () => {} }
	);
	assert.equal(ran, false);
	assert.deepEqual(
		results.map(({ status }) => status),
		['failed', 'skipped', 'skipped']
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
