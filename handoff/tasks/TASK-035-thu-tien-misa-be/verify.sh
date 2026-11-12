#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-035 — do trưởng phòng viết, file này bị khoá.
# Chạy từ thư mục gốc repo. Exit 0 = đạt. Chỉ test của task + động cơ + test chặn lách
# (toàn bộ suite do trưởng phòng chạy khi merge).
set -euo pipefail

export ACCESS_TOKEN_EXPIRE_MINUTES=30
export REDIS_URL=redis://127.0.0.1:6379/6
export DATA_ENCRYPTION_MASTER_KEY="${DATA_ENCRYPTION_MASTER_KEY:-MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=}"
export PYTHONPATH=.
.venv/bin/python -m pytest -q -p no:cacheprovider \
  backend/tests/test_misa_flow.py \
  backend/tests/test_commission_calculation.py \
  backend/tests/test_no_test_hooks_in_app.py
