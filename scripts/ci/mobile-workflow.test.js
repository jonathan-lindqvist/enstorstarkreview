import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from 'yaml';

const source = readFileSync(new URL('../../.github/workflows/mobile.yml', import.meta.url), 'utf8');
const workflow = parse(source);
const jobs = Object.entries(workflow.jobs);

const admitted = (job, eventName, draft) => {
	const expression = String(job.if ?? 'true').replace(/^\s*\$\{\{([\s\S]*)\}\}\s*$/, '$1');
	return Boolean(
		runInNewContext(expression, {
			github: {
				event_name: eventName,
				event: eventName === 'pull_request' ? { pull_request: { draft } } : {}
			}
		})
	);
};

test('mobile checks run for app and contract changes on PRs to main and on main', () => {
	for (const eventName of ['pull_request', 'push']) {
		const trigger = workflow.on[eventName];
		assert.deepEqual(trigger.branches, ['main'], eventName);
		for (const path of ['mobile/**', 'openapi/**', '.github/workflows/mobile.yml']) {
			assert.ok(trigger.paths.includes(path), `${eventName}: ${path}`);
		}
	}
	assert.ok(workflow.on.pull_request.types.includes('ready_for_review'));
});

test('draft PRs run no mobile job; ready PRs and main pushes run all', () => {
	for (const [name, job] of jobs) {
		assert.equal(admitted(job, 'pull_request', true), false, `draft: ${name}`);
		assert.equal(admitted(job, 'pull_request', false), true, `ready: ${name}`);
		assert.equal(admitted(job, 'push'), true, `push: ${name}`);
	}
	assert.equal(workflow.concurrency['cancel-in-progress'], true);
});

test('PR jobs get a read-only token, no secrets, and no persisted credentials', () => {
	assert.deepEqual(workflow.permissions, { contents: 'read' });
	assert.doesNotMatch(source, /secrets\./);
	for (const [name, job] of jobs) {
		assert.equal(job.permissions, undefined, `${name} keeps the read-only token`);
		const checkout = job.steps.find((step) => step.uses?.startsWith('actions/checkout@'));
		assert.equal(checkout.with['persist-credentials'], false, name);
		for (const step of job.steps.filter((item) => item.uses?.includes('@'))) {
			assert.match(step.uses, /@[0-9a-f]{40}$/, `${step.uses} is pinned to a commit SHA`);
		}
	}
});

test('Android runs its unit tests, screenshot comparison, and lint on Linux', () => {
	const { android } = workflow.jobs;
	assert.match(android['runs-on'], /^ubuntu-/);
	const commands = android.steps.map((step) => step.run ?? '').join('\n');
	for (const task of [':app:testDebugUnitTest', ':app:verifyRoborazziDebug', ':app:lintDebug']) {
		assert.match(commands, new RegExp(task), task);
	}
});

test('iOS runs the model tests on a macOS runner', () => {
	const { ios } = workflow.jobs;
	assert.match(ios['runs-on'], /^macos-/);
	const commands = ios.steps.map((step) => step.run ?? '').join('\n');
	assert.match(commands, /xcodebuild test[\s\S]*-scheme EnStorStarkModelTests/);
});

test('iOS builds with the Xcode pinned in mobile/ios/.xcode-version', () => {
	const pinned = readFileSync(new URL('../../mobile/ios/.xcode-version', import.meta.url), 'utf8');
	assert.match(pinned, /^\d+\.\d+(\.\d+)?\n$/);
	const select = workflow.jobs.ios.steps.find((step) => step.run?.includes('xcode-select'));
	assert.match(
		select.run,
		/xcode-select -s "\/Applications\/Xcode_\$\(cat \.xcode-version\)\.app"/
	);
	assert.equal(
		select['working-directory'] ?? workflow.jobs.ios.defaults.run['working-directory'],
		'mobile/ios'
	);
});
