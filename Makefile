# Docker-only workflows: local development (docker-compose.dev.yml) and the CI checks
# (docker-compose.ci.yml).

COMPOSE ?= $(shell docker compose version >/dev/null 2>&1 && echo 'docker compose' || echo 'docker-compose')
DEV = $(COMPOSE) -f docker-compose.dev.yml
# Each checkout gets its own CI stack, so runs from different worktrees cannot tear each other down.
# A worktree's .git file points to the main repository's .git directory; the CI container mounts it.
CI_PROJECT = enstorstarkreview-ci-$(shell printf %s '$(CURDIR)' | cksum | cut -d' ' -f1)
# On GitHub Actions the CI image's layers also go to the Actions cache.
CI_FILES = -f docker-compose.ci.yml $(if $(filter true,$(GITHUB_ACTIONS)),-f docker-compose.ci.github.yml)
# `make ci CHECKS=integration-1,rehearsal` runs only those check groups; GitHub runs one per job.
# `make ci JOBS=1` overrides how many checks run at once, which otherwise follows Docker's memory.
CI_COMPOSE = GIT_COMMON_DIR='$(shell git rev-parse --path-format=absolute --git-common-dir)' \
	CI_CHECKS='$(CHECKS)' CI_JOBS='$(JOBS)' \
	$(COMPOSE) -p $(CI_PROJECT) $(CI_FILES)

.PHONY: help
help:
	@echo 'Development:'
	@echo '  make dev                 start app + database (http://localhost:5173)'
	@echo '  make dev-down            stop the stack, keep database and dependencies'
	@echo '  make dev-reset           stop the stack and wipe database + dependencies'
	@echo '  make dev-rebuild         rebuild images + dependencies (package.json, Dockerfile.dev, db/)'
	@echo
	@echo 'Verification:'
	@echo '  make check               run the fast CI checks in Docker (about a minute)'
	@echo '  make ci                  run every CI check in Docker, as GitHub Actions does'

# Reuses the existing images; dev-rebuild picks up image changes.
.PHONY: dev
dev:
	$(DEV) up

# The dependency volume keeps its old contents, so a package.json change needs this.
.PHONY: dev-rebuild
dev-rebuild:
	$(DEV) down
	-docker volume rm enstorstarkreview-dev_dev-node-modules
	$(DEV) up --build

.PHONY: dev-down
dev-down:
	$(DEV) down

.PHONY: dev-reset
dev-reset:
	$(DEV) down -v

# `make check` runs the fast CI checks and `make ci` all of them; GitHub Actions runs `make ci`.
# Both run scripts/ci/run.js in a fresh container, write reports to ci-output/, and end with a
# summary. This stack's leftovers from an interrupted run are removed first.
.PHONY: check ci
# The fast checks need no database.
check: CI_RUN_FLAGS = --no-deps
check ci:
	@mkdir -p ci-output
	$(CI_COMPOSE) down -v --remove-orphans
	$(CI_COMPOSE) build
	$(CI_COMPOSE) run --rm $(CI_RUN_FLAGS) ci node /src/scripts/ci/run.js $@; \
		status=$$?; $(CI_COMPOSE) down -v --remove-orphans; exit $$status
