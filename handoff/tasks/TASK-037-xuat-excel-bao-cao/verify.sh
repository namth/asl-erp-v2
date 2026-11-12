#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-037 — do trưởng phòng viết, file này bị khoá. Hàm thuần, không cần DB.
set -euo pipefail
export PYTHONPATH=.
.venv/bin/python -m pytest -q -p no:cacheprovider \
  backend/tests/test_report_export.py \
  backend/tests/test_no_test_hooks_in_app.py
