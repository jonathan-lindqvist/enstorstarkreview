import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkNativeImports, checkPriceValueParity } from './native.js';
import { checkRepository } from './repository.js';
import { checkWorkflow } from './workflows.js';

const workflowPath = '.github/workflows/example.yml';
const sha = 'a'.repeat(40);
const digest = 'b'.repeat(64);

test('reports mutable workflow dependencies, persisted credentials, and shell interpolation', () => {
	const source = [
		'jobs:',
		'  test:',
		'    steps:',
		'      - uses: actions/checkout@v7',
		'      - uses: ./local-action',
		'      - uses: docker://alpine:latest',
		'      - run: echo "${{ github.event.pull_request.title }}"',
		'  call:',
		'    uses: org/repo/.github/workflows/test.yml@main'
	].join('\n');
	const findings = checkWorkflow(workflowPath, source);
	assert.deepEqual(
		findings.map(({ id, line }) => [id, line]),
		[
			['ci/pin-action', 4],
			['ci/checkout-credentials', 4],
			['ci/pin-action', 6],
			['ci/no-direct-shell-expression', 7],
			['ci/pin-action', 9]
		]
	);
	assert.ok(findings.every(({ path, message }) => path === workflowPath && message.length > 15));
	assert.match(findings[0].message, /commit SHA/);
	assert.match(findings[1].message, /persist-credentials: false/);
	assert.match(findings[3].message, /env.*quot/i);
});

test('allows pinned workflow dependencies and quoted shell environment variables', () => {
	const source = [
		'jobs:',
		'  test:',
		'    steps:',
		`      - uses: actions/checkout@${sha}`,
		'        with:',
		'          persist-credentials: false',
		`      - uses: docker://alpine@sha256:${digest}`,
		'      - env:',
		'          TITLE: ${{ github.event.pull_request.title }}',
		'        run: echo "$TITLE"',
		'  call:',
		`    uses: org/repo/.github/workflows/test.yml@${sha}`,
		'  local:',
		'    uses: ./.github/workflows/other.yml'
	].join('\n');
	assert.deepEqual(checkWorkflow(workflowPath, source), []);
	assert.match(checkWorkflow(workflowPath, 'jobs: [')[0].message, /YAML/i);
	assert.equal(
		checkWorkflow(
			workflowPath,
			`jobs: { test: { steps: [{ uses: 'Actions/Checkout@${sha}', with: { persist-credentials: 'true' } }] } }`
		)[0].id,
		'ci/checkout-credentials'
	);
});

const swiftPath = 'mobile/ios/Sources/EnStorStarkModel/Nested/Probe.swift';
const kotlinPath =
	'mobile/android/app/src/main/kotlin/se/enstorstarkreview/app/model/Nested/Probe.kt';

test('keeps native model imports separate from presentation', () => {
	const swift =
		'import Observation\n#if canImport(SwiftUI)\nimport struct SwiftUI.Color\n#endif\nimport EnStorStarkAPI\n@testable import EnStorStark\n/*\nimport UIKit\n*/';
	const kotlin =
		'import androidx.compose.runtime.mutableStateOf\nimport androidx.compose.ui.graphics.Color as Tint\nimport se.enstorstarkreview.app.ui.*\nimport se.enstorstarkreview.api.models.Review\n/*\nimport androidx.compose.material3.Text\n*/';
	for (const [path, source, lines] of [
		[swiftPath, swift, [3, 6]],
		[kotlinPath, kotlin, [2, 3]]
	]) {
		const findings = checkNativeImports(path, source);
		assert.deepEqual(
			findings.map(({ line }) => line),
			lines
		);
		assert.ok(
			findings.every(
				({ id, message }) => id === 'mobile/model-boundary' && /presentation/i.test(message)
			)
		);
	}
	assert.deepEqual(
		checkNativeImports(swiftPath.replace('EnStorStarkModel', 'EnStorStark'), swift),
		[]
	);
	assert.deepEqual(checkNativeImports(kotlinPath.replace('/model/', '/ui/'), kotlin), []);
});

const priceSources = () => ({
	web: {
		path: 'price-value.ts',
		source: `
		export const ASSUMED_BEER_VOLUME_CL = 40;
		export const PRICE_VALUE_GATES = [
			{ rating: 5, belowKrPerCl: 1.15 },
			{ rating: 4, belowKrPerCl: 1.6 }
		] as const;
		const MOST_EXPENSIVE_PRICE_VALUE_RATING = 0;
	`
	},
	ios: {
		path: 'PriceValue.swift',
		source: `
		public static let assumedVolumeCl = 40
		static let gates: [(rating: Int, belowKrPerCl: Double)] = [
			(5, 1.15), (4, 1.60),
		]
		static let mostExpensiveRating = 0
	`
	},
	android: {
		path: 'PriceValue.kt',
		source: `
		const val ASSUMED_VOLUME_CL = 40
		private val gates = listOf(
			5 to 1.15, // highest rating
			4 to 1.6,
		)
		private const val MOST_EXPENSIVE_RATING = 0
	`
	}
});

test('checks the registered web and native price-value declarations', () => {
	assert.deepEqual(checkPriceValueParity(priceSources()), []);
	const sources = priceSources();
	sources.ios.source = sources.ios.source
		.replace('40', '50')
		.replace('(5, 1.15), (4, 1.60)', '(4, 1.60), (5, 1.15)');
	sources.android.source = sources.android.source.replace('1.6,', '1.7,').replace('= 0', '= 1');
	const findings = checkPriceValueParity(sources);
	assert.equal(findings.length, 4);
	assert.ok(findings.every(({ id, line }) => id === 'mobile/price-value-parity' && line > 0));
	assert.ok(
		findings.some(({ path, message }) => path.endsWith('.swift') && /40.*50/.test(message))
	);
	assert.ok(
		findings.some(({ path, message }) => path.endsWith('.kt') && /1\.6.*1\.7/.test(message))
	);
});

test('reports unreadable declarations instead of silently ignoring a client', () => {
	const sources = priceSources();
	sources.android.source = sources.android.source.replace('4 to 1.6', 'calculatedGate()');
	assert.match(checkPriceValueParity(sources)[0]?.message ?? '', /Android.*literal/i);
});

test('the repository files satisfy the native and workflow checks', () => {
	assert.deepEqual(checkRepository(), []);
});
