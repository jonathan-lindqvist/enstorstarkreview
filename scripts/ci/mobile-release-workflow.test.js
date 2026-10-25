import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { parse } from 'yaml';

const workflow = parse(
	readFileSync(new URL('../../.github/workflows/mobile-release.yml', import.meta.url), 'utf8')
);
const jobs = Object.entries(workflow.jobs);

const platformJobs = jobs.filter(([name]) => name !== 'changes');

const runs = (job, outputs) => {
	const expression = String(job.if ?? 'true').replace(/^\s*\$\{\{([\s\S]*)\}\}\s*$/, '$1');
	return Boolean(runInNewContext(expression, { needs: { changes: { outputs } } }));
};
// Runs the change job's script for a manual run, which never calls the release script.
const manualOutputs = (platform) => {
	const outputs = join(mkdtempSync(join(tmpdir(), 'mobile-release-')), 'outputs');
	const step = workflow.jobs.changes.steps.find((item) => item.id === 'changed');
	execFileSync('bash', ['-e', '-c', step.run], {
		env: {
			PATH: process.env.PATH,
			GITHUB_EVENT_NAME: 'workflow_dispatch',
			GITHUB_OUTPUT: outputs,
			PLATFORM: platform
		}
	});
	return readFileSync(outputs, 'utf8');
};
const releaseStep = (job) => job.steps.find((step) => step.run?.includes('release.py'));

test('releases run every day at 09:00 in Stockholm and by hand, never for pushes or PRs', () => {
	assert.deepEqual(Object.keys(workflow.on).sort(), ['schedule', 'workflow_dispatch']);
	assert.deepEqual(workflow.on.schedule, [{ cron: '0 9 * * *', timezone: 'Europe/Stockholm' }]);
	const { inputs } = workflow.on.workflow_dispatch;
	assert.deepEqual(Object.keys(inputs).sort(), ['build_number', 'platform']);
	assert.deepEqual(inputs.platform.options, ['both', 'ios', 'android']);
	assert.equal(inputs.build_number.required, false);
	assert.equal(workflow.concurrency['cancel-in-progress'], false);
});

test('a first job decides which apps to build; the platform jobs start only for those', () => {
	const { changes } = workflow.jobs;
	assert.match(changes['runs-on'], /^ubuntu-/);
	assert.equal(changes.permissions, undefined);
	for (const [name, job] of platformJobs) {
		assert.equal(job.needs, 'changes', name);
		assert.equal(changes.outputs[name], `\${{ steps.changed.outputs.${name} }}`, name);
		assert.equal(runs(job, { [name]: 'true' }), true, name);
		assert.equal(runs(job, { [name]: 'false' }), false, name);
	}
});

test('the daily run builds only apps that changed since their last release', () => {
	const step = workflow.jobs.changes.steps.find((item) => item.id === 'changed');
	assert.match(step.run, /python3 mobile\/scripts\/release\.py changed ios android/);
	const checkout = workflow.jobs.changes.steps.find((item) =>
		item.uses?.startsWith('actions/checkout@')
	);
	assert.equal(checkout.with['fetch-depth'], 0);
});

test('a manual run always releases the chosen platforms', () => {
	assert.equal(manualOutputs('both'), 'ios=true\nandroid=true\n');
	assert.equal(manualOutputs('ios'), 'ios=true\nandroid=false\n');
	assert.equal(manualOutputs('android'), 'ios=false\nandroid=true\n');
});

test('the release step passes the build number override and nothing else', () => {
	for (const [name, job] of platformJobs) {
		const step = releaseStep(job);
		assert.match(step.run, new RegExp(`release\\.py ${name} `), name);
		assert.match(step.run, /--no-push-tag/, name);
		assert.doesNotMatch(step.run, /--if-changed|FORCE/, name);
		assert.equal(step.env.BUILD_NUMBER, '${{ inputs.build_number }}', name);
		assert.match(step.run, /\$\{BUILD_NUMBER:\+--build-number "\$BUILD_NUMBER"\}/, name);
	}
});

test('iOS releases with the Xcode pinned in mobile/ios/.xcode-version', () => {
	const select = workflow.jobs.ios.steps.find((step) => step.run?.includes('xcode-select'));
	assert.match(
		select.run,
		/xcode-select -s "\/Applications\/Xcode_\$\(cat mobile\/ios\/\.xcode-version\)\.app"/
	);
});

test('secrets stay out of shell code and the checkout keeps no credentials', () => {
	assert.deepEqual(workflow.permissions, { contents: 'read' });
	for (const [name, job] of jobs) {
		const checkout = job.steps.find((step) => step.uses?.startsWith('actions/checkout@'));
		assert.equal(checkout.with['persist-credentials'], false, name);
		// The build number is the commit count, so the release needs the whole history.
		assert.equal(checkout.with['fetch-depth'], 0, name);
		for (const step of job.steps) {
			assert.doesNotMatch(step.run ?? '', /\$\{\{\s*(secrets|github\.token|steps\.)/, name);
			if (step.uses?.includes('@')) {
				assert.match(step.uses, /@[0-9a-f]{40}$/, `${step.uses} is pinned to a commit SHA`);
			}
		}
	}
});

test('only the tag push sees the job token, after the build', () => {
	for (const [name, job] of platformJobs) {
		const withToken = job.steps.filter((step) =>
			Object.values(step.env ?? {}).some((value) => String(value).includes('github.token'))
		);
		assert.equal(withToken.length, 1, name);
		assert.match(withToken[0].run, /git push/, name);
		assert.ok(job.steps.indexOf(withToken[0]) > job.steps.indexOf(releaseStep(job)), name);
	}
	assert.deepEqual(workflow.jobs.ios.permissions, { contents: 'write' });
	assert.deepEqual(workflow.jobs.android.permissions, { contents: 'write', 'id-token': 'write' });
});

test('Android gets a Play token through Workload Identity Federation, with no key file', () => {
	const { android } = workflow.jobs;
	const auth = android.steps.find((step) => step.uses?.startsWith('google-github-actions/auth@'));
	assert.equal(
		auth.with.service_account,
		'play-publisher@enstorstarkreview.iam.gserviceaccount.com'
	);
	assert.equal(auth.with.token_format, 'access_token');
	assert.equal(auth.with.access_token_scopes, 'https://www.googleapis.com/auth/androidpublisher');
	assert.equal(auth.with.create_credentials_file, false);
	assert.equal(auth.with.export_environment_variables, false);
	assert.equal(
		releaseStep(android).env.PLAY_ACCESS_TOKEN,
		`\${{ steps.${auth.id}.outputs.access_token }}`
	);
});

test('iOS signs in the cloud with the App Store Connect key', () => {
	const { env } = releaseStep(workflow.jobs.ios);
	assert.ok(env.ASC_KEY_ID && env.ASC_ISSUER_ID);
	assert.match(workflow.jobs.ios['runs-on'], /^macos-/);
});
