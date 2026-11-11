#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-017 — do người viết test thiết lập, file này bị khoá.
# Chạy từ thư mục gốc repo. Exit 0 = đạt.
set -euo pipefail

echo "=== [1/5] Cài đặt dependencies frontend ==="
npm --prefix frontend install

echo "=== [2/5] Type-check toàn bộ dự án frontend ==="
npm --prefix frontend run typecheck

echo "=== [3/5] Lint toàn bộ mã nguồn frontend ==="
npm --prefix frontend run lint

echo "=== [4/5] Chạy toàn bộ test suite frontend (vitest) ==="
npm --prefix frontend run test

echo "=== [5/5] Build thử nghiệm dự án frontend (Next.js) ==="
npm --prefix frontend run build

echo "=== TẤT CẢ KIỂM TRA ĐÃ ĐẠT CHO TASK-017 ==="
