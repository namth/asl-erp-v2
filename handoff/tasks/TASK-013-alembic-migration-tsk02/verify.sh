#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-013 — do trưởng phòng viết, file này bị khoá.
# Chạy từ thư mục gốc repo. Exit 0 = đạt. Cần Docker (dựng Postgres tạm ở 127.0.0.1:55432).
set -euo pipefail
docker info >/dev/null 2>&1 || { echo "Docker chưa chạy"; exit 1; }
.venv/bin/python -m pytest tests/infra/test_task_013_migrations.py -q -p no:cacheprovider
