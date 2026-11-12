#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-051 — do trưởng phòng viết, file này bị khoá.
set -euo pipefail
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run test
