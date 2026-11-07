#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-001 — do trưởng phòng viết, file này bị khoá.
# Chạy từ thư mục gốc repo. Exit 0 = đạt.
set -euo pipefail

python3 -m unittest tests/prototype/test_task_001_cleanup.py -v
python3 scripts/check-prototype.py --strict | tail -1
node --check prototype/assets/layout.js
echo "TASK-001: PASS"
