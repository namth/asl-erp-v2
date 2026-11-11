#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-009 — do người kiểm viết, file này bị khoá.
# Chạy từ thư mục gốc repo. Exit 0 = đạt.
set -euo pipefail

# 1. Cài đặt dependencies (package-lock.json sinh từ lần đầu)
npm --prefix frontend install --no-audit --no-fund

# 2. Lint
npm --prefix frontend run lint

# 3. Typecheck
npm --prefix frontend run typecheck

# 4. Vitest chạy toàn bộ test trong frontend/tests/
npm --prefix frontend run test

# 5. Build Next.js
npm --prefix frontend run build
