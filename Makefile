# Docker-only workflow for local development; see docker-compose.dev.yml.

COMPOSE ?= $(shell docker compose version >/dev/null 2>&1 && echo 'docker compose' || echo 'docker-compose')
DEV = $(COMPOSE) -f docker-compose.dev.yml

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
