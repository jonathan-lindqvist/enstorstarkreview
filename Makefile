# Docker-only workflow for local development; see docker-compose.dev.yml.

COMPOSE ?= $(shell docker compose version >/dev/null 2>&1 && echo 'docker compose' || echo 'docker-compose')
DEV = $(COMPOSE) -f docker-compose.dev.yml
CI = $(COMPOSE) -f docker-compose.ci.yml
# Coverage must not drop below the revision this branch forked from; GitHub CI passes the PR base.
CI_BASE ?= $(shell git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD main)
# Space-separated stages of scripts/ci/run-all.sh (quality coverage integration); empty runs all.
STAGES ?=

.PHONY: help
help:
	@echo 'make dev                 start app + database (http://localhost:5173)'
	@echo 'make dev-down            stop the stack, keep database and dependencies'
	@echo 'make dev-reset           stop the stack and wipe database + dependencies'
	@echo 'make dev-reinstall       reinstall dependencies after a package.json change'
	@echo 'make dev-logs            follow the app log'
	@echo 'make dev-shell           open a shell in the app container'
	@echo 'make dev-test            run the unit tests in the app container'
	@echo 'make dev-create-user USERNAME=<name> PASSWORD=<pass>'
	@echo 'make dev-seed [COUNT=<n>] [FRESH=1]   seed random demo bars (default 20)'
	@echo 'make dev-api-types       regenerate API types from openapi/v1.yaml and lint the spec'
	@echo 'make ci [STAGES=<stages>] [CI_BASE=<rev>]   run the CI checks in Docker, exactly as GitHub CI does'

.PHONY: dev
dev:
	$(DEV) up --build

# The dependency volume keeps its old contents, so a package.json change needs this.
.PHONY: dev-reinstall
dev-reinstall:
	$(DEV) down
	-docker volume rm enstorstarkreview-dev_dev-node-modules
	$(DEV) up --build

.PHONY: dev-down
dev-down:
	$(DEV) down

.PHONY: dev-reset
dev-reset:
	$(DEV) down -v

.PHONY: dev-logs
dev-logs:
	$(DEV) logs -f app

.PHONY: dev-shell
dev-shell:
	$(DEV) exec app bash

.PHONY: dev-test
dev-test:
	$(DEV) exec app npm run test:unit -- --run

.PHONY: dev-create-user
dev-create-user:
	@test -n '$(USERNAME)' -a -n '$(PASSWORD)' \
		|| { echo 'Usage: make dev-create-user USERNAME=<name> PASSWORD=<pass>'; exit 1; }
	$(DEV) exec app npm run create-user -- '$(USERNAME)' '$(PASSWORD)'

.PHONY: dev-seed
dev-seed:
	$(DEV) exec app npm run seed-bars -- $(COUNT) $(if $(FRESH),--fresh,)

# Run after changing openapi/v1.yaml; writes src/lib/types/api-v1.d.ts.
.PHONY: dev-api-types
dev-api-types:
	$(DEV) exec app npm run api:types
	$(DEV) exec app npm run api:lint

# GitHub CI runs this target too, one job per stage. The baseline is only archived when the
# coverage stage runs; otherwise the mounted file is left empty. Tears the stack down whatever
# the outcome and exits with the checks' status.
.PHONY: ci
ci:
	$(if $(or $(if $(strip $(STAGES)),,all),$(findstring coverage,$(STAGES))),git archive --format=tar -o .ci-baseline.tar $(CI_BASE),: > .ci-baseline.tar)
	CI_STAGES='$(STAGES)' $(CI) up --build --attach ci --exit-code-from ci; status=$$?; $(CI) down -v; exit $$status
