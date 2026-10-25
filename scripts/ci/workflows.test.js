import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from 'yaml';
import { checks } from './run.js';

const workflow = parse(
	readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
);
const jobs = Object.entries(workflow.jobs);

const triggered = (eventName, action, branch = 'main') => {
	const trigger = workflow.on[eventName];
	if (!trigger || !trigger.branches.includes(branch)) return false;
	return (
		eventName !== 'pull_request' ||
		(trigger.types ?? ['opened', 'synchronize', 'reopened']).includes(action)
	);
};

// These workflow conditions use the shared JavaScript/GitHub boolean-expression subset.
// Evaluate the actual YAML so an omitted job guard is caught by the event matrix.
const admitted = (job, eventName, draft) => {
	const expression = String(job.if ?? 'true').replace(/^\s*\$\{\{([\s\S]*)\}\}\s*$/, '$1');
	return Boolean(
		runInNewContext(
			expression,
			{
				github: {
					event_name: eventName,
					event: eventName === 'pull_request' ? { pull_request: { draft } } : {}
				},
				cancelled: () => false
			},
			{ timeout: 100 }
		)
	);
};

test('draft PR events admit no CI job, including the required check', () => {
	for (const action of ['opened', 'synchronize', 'reopened', 'converted_to_draft']) {
		for (const [name, job] of jobs) {
			assert.equal(
				triggered('pull_request', action) && admitted(job, 'pull_request', true),
				false,
				`${action}: ${name}`
			);
		}
	}
});

test('active PRs run every check, including becoming ready without a new commit', () => {
	for (const action of ['opened', 'synchronize', 'reopened', 'ready_for_review']) {
		assert.equal(triggered('pull_request', action), true, action);
		for (const [name, job] of jobs) {
			assert.equal(admitted(job, 'pull_request', false), true, `${action}: ${name}`);
		}
	}
});

test('conversion back to draft cancels the previous run without starting jobs', () => {
	assert.equal(triggered('pull_request', 'converted_to_draft'), true);
	assert.equal(workflow.concurrency['cancel-in-progress'], true);
	const expression = workflow.concurrency.group.match(/\$\{\{([\s\S]*?)\}\}/)[1];
	const group = (draft) =>
		runInNewContext(expression, {
			github: { event: { pull_request: { number: 42, draft } }, ref: 'refs/pull/42/merge' }
		});
	assert.equal(group(false), group(true));
});

test('main pushes still run all jobs without a PR payload; other branches do not trigger', () => {
	assert.equal(triggered('push'), true);
	assert.equal(triggered('push', undefined, 'feature'), false);
	assert.equal(triggered('pull_request', 'opened', 'feature'), false);
	for (const [name, job] of jobs) assert.equal(admitted(job, 'push'), true, name);
});

test('each check group of `make ci` runs as its own job, with the same entry point', () => {
	const { ci } = workflow.jobs;
	const groups = new Set(
		checks.filter((check) => !check.required).map((check) => check.group ?? 'checks')
	);
	assert.deepEqual([...ci.strategy.matrix.checks].sort(), [...groups].sort());
	assert.equal(ci.strategy['fail-fast'], false);
	const step = ci.steps.find((item) => item.run?.startsWith('make'));
	assert.equal(step.run.trim(), 'make ci CHECKS="$CHECKS"');
	assert.equal(step.env.CHECKS, '${{ matrix.checks }}');
	assert.equal(step['continue-on-error'], undefined);
});

test('the required check passes only when every check group passed', () => {
	assert.deepEqual(Object.keys(workflow.jobs), ['ci', 'passed']);
	const { passed } = workflow.jobs;
	// The protect-main ruleset requires this check by name.
	assert.equal(passed.name, 'CI passed');
	assert.equal(passed.needs, 'ci');
	// It must also run, and fail, when a group fails.
	assert.match(passed.if, /!cancelled\(\)/);
	assert.deepEqual(passed.steps, [
		{ run: 'test "$RESULT" = success', env: { RESULT: '${{ needs.ci.result }}' } }
	]);
});

test('the checkout persists no credentials', () => {
	const checkout = workflow.jobs.ci.steps.find((item) =>
		item.uses?.startsWith('actions/checkout@')
	);
	assert.equal(checkout.with['persist-credentials'], false);
});

test('make ci on GitHub can cache the CI image in the Actions cache', () => {
	const { steps } = workflow.jobs.ci;
	const index = (predicate) => steps.findIndex(predicate);
	const makeCi = index((step) => step.run?.startsWith('make ci'));
	const buildx = index((step) => step.uses?.startsWith('docker/setup-buildx-action@'));
	const runtime = index(
		(step) =>
			step.uses?.startsWith('actions/github-script@') &&
			step.with.script.includes('core.exportVariable') &&
			step.with.script.includes("startsWith('ACTIONS_')")
	);
	assert.ok(buildx >= 0 && buildx < makeCi, 'buildx is set up before make ci');
	assert.ok(runtime >= 0 && runtime < makeCi, 'the cache token is exported before make ci');
	for (const step of steps.filter((item) => item.uses)) {
		assert.match(step.uses, /@[0-9a-f]{40}$/, `${step.uses} is pinned to a commit SHA`);
	}
});
