#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-018 — do kỹ sư kiểm thử viết, file này bị khoá.
# Chạy từ thư mục gốc repo. Exit 0 = đạt.
set -euo pipefail

PY=.venv/bin/python
export ACCESS_TOKEN_EXPIRE_MINUTES=30
export REDIS_URL=redis://127.0.0.1:6379/12
export DATA_ENCRYPTION_MASTER_KEY="MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="  # base64 của 32 byte, giống TASK-011
export PYTHONPATH=.

redis-cli ping >/dev/null || { echo "Redis cục bộ chưa chạy (redis-server)"; exit 1; }

# Chạy test của task và toàn bộ test backend (không được làm hỏng)
$PY -m pytest backend/tests -q -p no:cacheprovider
