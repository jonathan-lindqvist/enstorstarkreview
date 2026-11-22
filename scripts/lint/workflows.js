import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument } from 'yaml';

export function checkWorkflow(path, source) {
	const locations = new LineCounter();
	const workflow = parseDocument(source, { lineCounter: locations, prettyErrors: false });
	const findings = [];

	const report = (id, offset, message) => {
		findings.push({ path, line: locations.linePos(offset).line, id, message });
	};

	for (const error of workflow.errors) {
		report('ci/workflow-yaml', error.pos[0], `Fix invalid workflow YAML. ${error.message}`);
	}
	if (findings.length) return findings;

	const resolve = (node) => (isAlias(node) ? node.resolve(workflow) : node);
	const field = (node, key) => {
		const map = resolve(node);
		return isMap(map) ? map.get(key, true) : undefined;
	};
	const value = (node) => {
		const scalar = resolve(node);
		return isScalar(scalar) ? scalar.value : undefined;
	};
	const checkReference = (node) => {
		const use = field(node, 'uses');
		const reference = value(use);
		if (typeof reference !== 'string' || reference.startsWith('./')) return;
		const offset = use.range[0];
		if (reference.startsWith('docker://')) {
			if (!/@sha256:[a-f0-9]{64}$/i.test(reference)) {
				report('ci/pin-action', offset, 'Pin this Docker action with an immutable @sha256 digest.');
			}
		} else if (!/@[a-f0-9]{40}$/i.test(reference)) {
			report(
				'ci/pin-action',
				offset,
				'Pin this action or reusable workflow to a reviewed full commit SHA.'
			);
		}
		if (
			reference.split('@')[0].toLowerCase() === 'actions/checkout' &&
			value(field(field(node, 'with'), 'persist-credentials')) !== false
		) {
			report(
				'ci/checkout-credentials',
				offset,
				'Set with.persist-credentials: false on actions/checkout to keep the token out of Git configuration.'
			);
		}
	};

	const jobs = resolve(workflow.get('jobs', true));
	if (!isMap(jobs)) return findings;
	for (const { value: job } of jobs.items) {
		checkReference(job);
		const steps = resolve(field(job, 'steps'));
		if (!isSeq(steps)) continue;
		for (const step of steps.items) {
			checkReference(step);
			const run = field(step, 'run');
			const script = value(run);
			if (typeof script === 'string' && script.includes('${{')) {
				report(
					'ci/no-direct-shell-expression',
					run.range[0],
					'Pass GitHub expressions through step env and quote the shell variable in run.'
				);
			}
		}
	}
	return findings;
}
