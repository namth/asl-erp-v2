#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-019 — file này bị khoá. Chạy từ thư mục gốc repo. Exit 0 = đạt.
set -euo pipefail
PY=.venv/bin/python
export ACCESS_TOKEN_EXPIRE_MINUTES=30
export REDIS_URL=redis://127.0.0.1:6379/11
export DATA_ENCRYPTION_MASTER_KEY="MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="  # base64 của 32 byte, giống TASK-011
export PYTHONPATH=.
redis-cli ping >/dev/null
# Migration cột tỷ lệ mặc định của loại vụ việc (người code tạo file này)
$PY backend/tests/apply_sql.py backend/alembic/versions/003_matter_type_commission_defaults.sql
$PY -m pytest backend/tests -q -p no:cacheprovider
