import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverageBaseline, formatSummary, runChecks } from './run.js';

const clock = () => {
	let time = 0;
	return () => (time += 2000);
};

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
				name: 'Unit tests and coverage',
				run: () => {
					throw new Error('No baseline');
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
	assert.ok(logged.some((line) => line.includes('No baseline')));
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

const unused = () => assert.fail('The merge base must not replace an explicit baseline');

test('only a full nonzero lowercase commit SHA is accepted as the coverage baseline', () => {
	const sha = 'a'.repeat(40);
	assert.equal(coverageBaseline({ CI_BASE_SHA: sha }, unused), sha);
	for (const invalid of [
		'0'.repeat(40),
		'A'.repeat(40),
		'a'.repeat(39),
		'main',
		'--output=/etc/passwd',
		`${sha}\n`
	]) {
		assert.throws(() => coverageBaseline({ CI_BASE_SHA: invalid }, unused), undefined, invalid);
		assert.throws(() => coverageBaseline({}, () => invalid), undefined, invalid);
	}
});

test('GitHub runs must supply the baseline; local runs default to the merge base', () => {
	const sha = 'b'.repeat(40);
	assert.throws(() => coverageBaseline({ GITHUB_ACTIONS: 'true', CI_BASE_SHA: '' }, () => sha));
	assert.equal(coverageBaseline({ GITHUB_ACTIONS: 'true', CI_BASE_SHA: sha }, unused), sha);
	assert.equal(
		coverageBaseline({ CI_BASE_SHA: '' }, () => sha),
		sha
	);
});
