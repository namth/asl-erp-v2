#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-044
set -euo pipefail

cd frontend

echo "==> 1. Kiểm tra không còn dấu vết trạng thái chi trả (DEC-09)"
if grep -rniE "disburs|payout|Đã chi|Tích lu[ỹy]" src; then
  echo "LỖI: còn dấu vết trạng thái chi trả (DEC-09) trong frontend/src" >&2
  exit 1
fi

echo "==> 2. Kiểm tra kiểu TypeScript"
npx tsc --noEmit -p tsconfig.json

echo "==> 3. Chạy test Vitest"
npx vitest run

echo "==> 4. Kiểm tra Lint Next.js"
npx next lint
