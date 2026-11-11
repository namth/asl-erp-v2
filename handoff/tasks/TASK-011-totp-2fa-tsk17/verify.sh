#!/usr/bin/env bash
# Lệnh xác minh tự động cho TASK-011 — do kỹ sư kiểm thử viết, file này bị khoá.
# Chạy từ thư mục gốc repo. Exit 0 = đạt.
set -euo pipefail

PY=.venv/bin/python
# Hợp đồng API: access token sống 30 phút (07 §3.1)
export ACCESS_TOKEN_EXPIRE_MINUTES=30
# Redis DB riêng cho task này (task khác chạy song song dùng DB khác)
export REDIS_URL=redis://127.0.0.1:6379/14
# Khoá master 32 byte base64 dùng để mã hoá AES-256-GCM bí mật TOTP trong test
export DATA_ENCRYPTION_MASTER_KEY="MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="

redis-cli ping >/dev/null || { echo "Redis cục bộ chưa chạy (redis-server)"; exit 1; }

# Áp migration tạo bảng user_recovery_codes nếu có file
if [ -f backend/alembic/versions/002_user_recovery_codes.sql ]; then
  $PY backend/tests/apply_sql.py backend/alembic/versions/002_user_recovery_codes.sql
fi

# Chạy toàn bộ test backend (kể cả test_auth.py và test_two_factor.py mới)
$PY -m pytest backend/tests -q -p no:cacheprovider
