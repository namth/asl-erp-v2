#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-033 — do trưởng phòng viết, file này bị khoá.
# Chạy từ thư mục gốc repo. Exit 0 = đạt. Chỉ chạy test của task + test liên quan audit
# (toàn bộ suite do trưởng phòng chạy khi merge, để vòng sửa của agent ngắn).
set -euo pipefail

export ACCESS_TOKEN_EXPIRE_MINUTES=30
export REDIS_URL=redis://127.0.0.1:6379/7
export DATA_ENCRYPTION_MASTER_KEY="${DATA_ENCRYPTION_MASTER_KEY:-MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=}"
export PYTHONPATH=.
.venv/bin/python -m pytest -q -p no:cacheprovider \
  backend/tests/test_audit_log_api.py \
  backend/tests/test_seed_and_audit.py \
  backend/tests/test_no_test_hooks_in_app.py
