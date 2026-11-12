#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-042 — do trưởng phòng viết, file này bị khoá.
set -euo pipefail
cd frontend
if grep -nE "badge: '[0-9]+'" src/lib/menu.ts; then
  echo "LỖI: src/lib/menu.ts vẫn còn badge số cứng" >&2
  exit 1
fi
npx tsc --noEmit -p tsconfig.json
npx vitest run
npx next lint
