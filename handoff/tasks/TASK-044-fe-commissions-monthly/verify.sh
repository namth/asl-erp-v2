#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-044 — do trưởng phòng viết.
set -euo pipefail
cd frontend
if grep -rniE "disburs|payout|Đã chi|Tích lu[ỹy]" src; then
  echo "LỖI: còn dấu vết trạng thái chi trả (DEC-09)" >&2
  exit 1
fi
npx tsc --noEmit -p tsconfig.json
npx vitest run
npx next lint
