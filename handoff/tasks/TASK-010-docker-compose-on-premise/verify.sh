#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-010 — do trưởng phòng viết, file này bị khoá.
# Chạy từ thư mục gốc repo. Exit 0 = đạt. Cần Docker đang chạy.
set -euo pipefail
docker info >/dev/null 2>&1 || { echo "Docker chưa chạy"; exit 1; }
python3 -m unittest tests/infra/test_task_010_compose.py -v
