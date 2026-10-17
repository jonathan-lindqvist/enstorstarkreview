import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from 'yaml';

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
const admitted = (job, eventName, draft, dependenciesSucceeded = true) => {
	const expression = String(job.if ?? 'true').replace(/^\s*\$\{\{([\s\S]*)\}\}\s*$/, '$1');
	if (!dependenciesSucceeded && !/\b(always|failure|cancelled|success)\s*\(/.test(expression))
		return false;
	return Boolean(
		runInNewContext(
			expression,
			{
				github: {
					event_name: eventName,
					event: eventName === 'pull_request' ? { pull_request: { draft } } : {}
				},
				always: () => true,
				success: () => dependenciesSucceeded,
				failure: () => !dependenciesSucceeded,
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

test('the required check runs the same `make ci` entry point as a local run', () => {
	assert.deepEqual(Object.keys(workflow.jobs), ['ci']);
	const { ci } = workflow.jobs;
	// The protect-main ruleset requires this check by name.
	assert.equal(ci.name, 'CI passed');
	const step = ci.steps.find((item) => item.run);
	assert.equal(step.run.trim(), 'make ci');
	assert.equal(step['continue-on-error'], undefined);
	assert.equal(
		step.env.CI_BASE_SHA,
		'${{ github.event.pull_request.base.sha || github.event.before }}'
	);
});

test('the checkout has the baseline history but no persisted credentials', () => {
	const checkout = workflow.jobs.ci.steps.find((item) =>
		item.uses?.startsWith('actions/checkout@')
	);
	assert.equal(checkout.with['fetch-depth'], 0);
	assert.equal(checkout.with['persist-credentials'], false);
});
