import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareCoverage } from './coverage.js';

const report = (covered = 80, total = 100) => ({
	total: Object.fromEntries(
		['lines', 'branches', 'functions', 'statements'].map((metric) => [
			metric,
			{ covered, total, skipped: 0, pct: 100 }
		])
	)
});

test('equal and improved coverage pass all four metrics', () => {
	assert.equal(compareCoverage(report(), report()).passed, true);
	assert.equal(compareCoverage(report(), report(81)).passed, true);
});

test('a decrease in any metric fails even when other metrics improve', () => {
	for (const metric of ['lines', 'branches', 'functions', 'statements']) {
		const candidate = report(90);
		candidate.total[metric].covered = 79;
		assert.equal(compareCoverage(report(), candidate).passed, false, metric);
	}
});

test('tiny decreases cannot hide behind rounded or supplied percentages', () => {
	assert.equal(compareCoverage(report(999999, 1000000), report(999998, 1000000)).passed, false);
});

test('new uncovered code lowers coverage even when the covered count stays the same', () => {
	assert.equal(compareCoverage(report(), report(80, 101)).passed, false);
});

test('removing uncovered code can improve coverage', () => {
	assert.equal(compareCoverage(report(), report(80, 99)).passed, true);
});

test('cross multiplication stays exact beyond safe Number products', () => {
	const total = Number.MAX_SAFE_INTEGER;
	assert.equal(compareCoverage(report(total - 1, total), report(total - 2, total)).passed, false);
});

test('missing, malformed, and impossible reports fail closed', () => {
	for (const invalid of [
		undefined,
		null,
		{},
		{ total: {} },
		report(-1),
		report(101),
		report(1.5)
	]) {
		assert.throws(() => compareCoverage(report(), invalid));
		assert.throws(() => compareCoverage(invalid, report()));
	}
	const missing = report();
	delete missing.total.branches;
	assert.throws(() => compareCoverage(report(), missing));
});

test('an entirely empty report fails, but an empty individual metric represents 100%', () => {
	assert.throws(() => compareCoverage(report(), report(0, 0)));
	const candidate = report();
	candidate.total.functions = { covered: 0, total: 0, skipped: 0, pct: 100 };
	assert.equal(compareCoverage(report(), candidate).passed, true);
});
