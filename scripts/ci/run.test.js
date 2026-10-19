import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checksFor, copyDirectory, formatCoverage, formatSummary, runChecks } from './run.js';

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

test('every check runs and reports its own outcome after an earlier failure', () => {
	const ran = [];
	const check = (name, passed) => ({ name, run: () => (ran.push(name), passed) });
	const results = runChecks([check('Formatting', false), check('Linting', true)], {
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

test('a failed required check skips the remaining checks without running them', () => {
	let ran = false;
	const results = runChecks(
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

test('a check that throws fails without stopping later checks', () => {
	const logged = [];
	const results = runChecks(
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
