#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-022
# Chạy từ thư mục gốc repo. Exit 0 = đạt.
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/go/bin:$PATH"

echo "=== 1. actionlint .github/workflows/ci.yml ==="
go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7 .github/workflows/ci.yml

echo "=== 2. Unit tests tests/infra/test_task_022_ci.py ==="
python3 -m unittest tests/infra/test_task_022_ci.py -v

echo "=== 3. make -n cho từng target ==="
for target in lint typecheck test-frontend test-backend test migrate seed check-prototype; do
    echo "make -n $target"
    make -n "$target"
done

echo "Xác minh hoàn tất: tất cả tiêu chí của TASK-022 đều đạt."
