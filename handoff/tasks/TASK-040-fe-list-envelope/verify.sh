#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-040 — do trưởng phòng viết, file này bị khoá.
set -euo pipefail
cd frontend
npx tsc --noEmit -p tsconfig.json
npx vitest run
