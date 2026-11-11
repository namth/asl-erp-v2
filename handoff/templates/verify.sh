#!/usr/bin/env bash
# Lệnh xác minh tự động cho {{ID}} — do trưởng phòng viết, file này bị khoá.
# Chạy từ thư mục gốc repo. Exit 0 = đạt.
set -euo pipefail

# Mẫu — sửa theo task:
#   npx vitest run tests/<file-của-task>.test.ts
#   npx tsc --noEmit -p tsconfig.json     # LUÔN dùng -p; truyền file vào tsc sẽ bỏ qua tsconfig.json (lock sẽ từ chối)
echo "TODO: Claude điền lệnh xác minh cho {{ID}}"
exit 1
