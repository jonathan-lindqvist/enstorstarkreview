import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const names = ['lines', 'branches', 'functions', 'statements'];

function readTotals(report) {
	const totals = names.map((metric) => {
		const value = report?.total?.[metric];
		if (
			!value ||
			!Number.isSafeInteger(value.covered) ||
			!Number.isSafeInteger(value.total) ||
			value.covered < 0 ||
			value.total < value.covered
		) {
			throw new Error(`Invalid or missing ${metric} coverage counts`);
		}
		return { metric, covered: value.covered, total: value.total };
	});
	if (totals.every((value) => value.total === 0)) {
		throw new Error('Coverage report contains no executable code');
	}
	return totals;
}

export function compareCoverage(baseline, candidate) {
	const before = readTotals(baseline);
	const after = readTotals(candidate);
	const metrics = before.map((previous, index) => {
		const current = after[index];
		const fraction = (value) =>
			value.total === 0 ? [1n, 1n] : [BigInt(value.covered), BigInt(value.total)];
		const [oldCovered, oldTotal] = fraction(previous);
		const [newCovered, newTotal] = fraction(current);
		return {
			metric: previous.metric,
			before: previous,
			after: current,
			passed: newCovered * oldTotal >= oldCovered * newTotal
		};
	});
	return { passed: metrics.every((metric) => metric.passed), metrics };
}

function summary(comparison) {
	const percentage = (value) =>
		`${(value.total === 0 ? 100 : (100 * value.covered) / value.total).toFixed(4)}% (${value.covered}/${value.total})`;
	return [
		'## Coverage compared with main',
		'',
		'| Metric | Baseline | Candidate | Result |',
		'| --- | --- | --- | --- |',
		...comparison.metrics.map(
			(value) =>
				`| ${value.metric} | ${percentage(value.before)} | ${percentage(value.after)} | ${value.passed ? 'Pass' : 'Decrease'} |`
		),
		'',
		'Comparisons use exact counts; displayed percentages are rounded.',
		''
	].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		if (process.argv.length !== 4)
			throw new Error('Usage: coverage.js BASELINE_JSON CANDIDATE_JSON');
		const comparison = compareCoverage(
			JSON.parse(readFileSync(process.argv[2], 'utf8')),
			JSON.parse(readFileSync(process.argv[3], 'utf8'))
		);
		const output = summary(comparison);
		console.log(output);
		if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, output);
		if (!comparison.passed) process.exitCode = 1;
	} catch (error) {
		console.error(error instanceof Error ? error.message : 'Coverage comparison failed');
		process.exitCode = 1;
	}
}
