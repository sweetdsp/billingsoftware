# Bill Maker convenience targets (requires GNU make + Docker)
.PHONY: help env dev up down logs build migrate test lint

COMPOSE := docker compose
COMPOSE_DEV := docker compose -f docker-compose.dev.yml

help:
	@echo "Targets: env dev up down logs build migrate test lint"

env:
	@test -f .env || { echo "Missing .env - create it (variables are listed in CLAUDE.md, 'Environment Variables')"; exit 1; }

dev: env
	$(COMPOSE_DEV) up --build

up: env
	$(COMPOSE) up --build -d

down:
	$(COMPOSE) down
	$(COMPOSE_DEV) down

logs:
	$(COMPOSE) logs -f

build: env
	$(COMPOSE) build

migrate:
	$(COMPOSE) exec backend alembic upgrade head

test:
	cd backend && pytest --cov=app --cov-fail-under=80
	cd frontend && npm test

lint:
	cd backend && ruff check . && ruff format --check . && mypy app
	cd frontend && npm run lint && npm run type-check
