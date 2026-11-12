#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-027 — do kỹ sư kiểm thử viết, file này bị khoá.
# Chạy từ thư mục gốc repo. Exit 0 = đạt.
set -euo pipefail

export ACCESS_TOKEN_EXPIRE_MINUTES=30
export REDIS_URL=redis://127.0.0.1:6379/9
export PYTHONPATH=.
.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider
