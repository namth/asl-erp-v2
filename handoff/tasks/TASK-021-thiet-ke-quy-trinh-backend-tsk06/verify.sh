#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-021 — do trưởng phòng viết, file này bị khoá.
# Chạy từ thư mục gốc repo. Exit 0 = đạt. Cần: .venv, Redis cục bộ, PostgreSQL dev.
set -euo pipefail

export ACCESS_TOKEN_EXPIRE_MINUTES=30
export REDIS_URL=redis://127.0.0.1:6379/10
export PYTHONPATH=.

.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider
