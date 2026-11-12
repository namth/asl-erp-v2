#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-042 — do trưởng phòng viết, file này bị khoá.
set -euo pipefail
cd frontend
! grep -nE "badge: '[0-9]+'" src/lib/menu.ts
npx tsc --noEmit -p tsconfig.json
npx vitest run
npx next lint
