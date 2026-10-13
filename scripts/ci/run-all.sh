#!/usr/bin/env bash
# Runs the checks from .github/workflows/ci.yml inside the `make ci` container.
# The coverage baseline is a tar of the base revision at /tmp/baseline.tar (written by
# `make ci`); without it the coverage comparison is skipped. The Docker backup rehearsal
# (test:deploy:restore) needs a Docker daemon and runs only in GitHub CI.
set -euo pipefail

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

step 'Typecheck'
npm run check
step 'Lint'
npm run lint
npm run api:lint
step 'CI and deployment script tests'
npm run test:ci
shellcheck scripts/deploy/ssh-command.sh scripts/ci/run-all.sh

baseline=/tmp/baseline
mkdir -p "$baseline"
if [ -f /tmp/baseline.tar ]; then tar -x -f /tmp/baseline.tar -C "$baseline"; fi
if [ -f "$baseline/package.json" ]; then
	step 'Coverage: base revision'
	node scripts/ci/run-coverage.js "$baseline" coverage/baseline
	step 'Coverage: working tree'
	node scripts/ci/run-coverage.js . coverage/candidate
	node scripts/ci/coverage.js coverage/baseline/coverage-summary.json \
		coverage/candidate/coverage-summary.json
else
	step 'Unit tests (no baseline given, coverage comparison skipped)'
	npm run test:unit -- --run
fi

step 'Integration tests'
npm run test:integration

step 'All checks passed'
