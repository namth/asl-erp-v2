#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-014 — do kỹ sư kiểm thử viết, file này bị khoá.
# Chạy từ thư mục gốc repo. Exit 0 = đạt. Cần: .venv, Redis cục bộ, đường hầm PostgreSQL dev.
set -euo pipefail
PY=.venv/bin/python
# Hợp đồng API: access token sống 30 phút (07 §3.1) — biến môi trường thắng giá trị trong .env cục bộ
export ACCESS_TOKEN_EXPIRE_MINUTES=30
# Redis DB riêng cho task này (task khác chạy song song dùng DB khác)
export REDIS_URL=redis://127.0.0.1:6379/13
redis-cli ping >/dev/null || { echo "Redis cục bộ chưa chạy (redis-server)"; exit 1; }
# Chạy test người dùng & phòng ban, đồng bộ đồ thị + toàn bộ test backend (không được làm hỏng)
$PY -m pytest backend/tests -q -p no:cacheprovider
