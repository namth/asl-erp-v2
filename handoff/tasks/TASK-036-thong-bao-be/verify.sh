#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-036 — do trưởng phòng viết, file này bị khoá.
set -euo pipefail
export ACCESS_TOKEN_EXPIRE_MINUTES=30
export REDIS_URL=redis://127.0.0.1:6379/5
export DATA_ENCRYPTION_MASTER_KEY="${DATA_ENCRYPTION_MASTER_KEY:-MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=}"
export PYTHONPATH=.
timeout 900 .venv/bin/python -m pytest -q -p no:cacheprovider \
  backend/tests/test_notifications_api.py \
  backend/tests/test_no_test_hooks_in_app.py
