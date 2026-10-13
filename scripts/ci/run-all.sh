#!/usr/bin/env bash
# The CI checks, run in the `make ci` container both locally and by .github/workflows/ci.yml
# (one job per stage). Add or change checks here, not in the workflow.
#
# Usage: run-all.sh [quality|coverage|integration]...
# Without arguments the stages come from $CI_STAGES, and an empty value runs all three.
#
# The coverage stage compares against the base revision that `make ci` archives to
# /tmp/baseline.tar. The Docker backup rehearsal (test:deploy:restore) needs a Docker daemon
# and stays in the workflow.
set -euo pipefail

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

quality() {
	step 'Typecheck'
	npm run check
	step 'Lint'
	npm run lint
	npm run api:lint
	step 'CI and deployment script tests'
	npm run test:ci
	shellcheck scripts/deploy/ssh-command.sh scripts/ci/run-all.sh
}

coverage() {
	local baseline=/tmp/baseline
	mkdir -p "$baseline"
	tar -x -f /tmp/baseline.tar -C "$baseline"
	if [ ! -f "$baseline/package.json" ]; then
		echo 'No coverage baseline: run through make ci, which archives the base revision.' >&2
		return 1
	fi
	step 'Coverage: base revision'
	node scripts/ci/run-coverage.js "$baseline" coverage/baseline
	step 'Coverage: working tree'
	node scripts/ci/run-coverage.js . coverage/candidate
	node scripts/ci/coverage.js coverage/baseline/coverage-summary.json \
		coverage/candidate/coverage-summary.json
}

integration() {
	step 'Integration tests'
	npm run test:integration
}

stages=("$@")
# Word splitting is the point: CI_STAGES is a space-separated list.
# shellcheck disable=SC2206
[ ${#stages[@]} -gt 0 ] || stages=(${CI_STAGES:-})
[ ${#stages[@]} -gt 0 ] || stages=(quality coverage integration)
for stage in "${stages[@]}"; do
	case "$stage" in
		quality | coverage | integration) "$stage" ;;
		*)
			echo "Unknown stage: $stage (expected quality, coverage, or integration)" >&2
			exit 2
			;;
	esac
done
step 'All checks passed'
