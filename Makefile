PY ?= .venv/bin/python

.PHONY: lint typecheck test-frontend test-backend test migrate seed check-prototype

lint:
	ruff check backend
	npm --prefix frontend run lint

typecheck:
	npm --prefix frontend run typecheck

test-frontend:
	npm --prefix frontend run test

test-backend:
	$(PY) -m pytest backend/tests

test: test-frontend test-backend

migrate:
	alembic -c backend/alembic.ini upgrade head

seed:
	$(PY) -m backend.app.scripts.seed

check-prototype:
	python3 scripts/check-prototype.py --strict
