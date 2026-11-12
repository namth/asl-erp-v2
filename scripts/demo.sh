#!/usr/bin/env bash
# Môi trường DEMO cục bộ: Postgres/Neo4j/Redis trong Docker (docker-compose.demo.yml),
# backend FastAPI cổng 8000, frontend Next.js cổng 3100 (proxy /api/v1 sang backend).
#
#   scripts/demo.sh up       # bật DB, tạo schema + dữ liệu demo nếu DB còn trống
#   scripts/demo.sh reset    # xoá sạch dữ liệu demo rồi dựng lại
#   scripts/demo.sh backend  # chạy API (giữ terminal)
#   scripts/demo.sh frontend # chạy giao diện (giữ terminal)
#   scripts/demo.sh otp      # in mã 2FA hiện tại cho tài khoản demo
#   scripts/demo.sh down     # tắt DB demo (giữ dữ liệu)
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.demo.yml)
# Mật khẩu chỉ dùng cho DB demo trên máy cá nhân (cổng mở ở 127.0.0.1).
export APP_ENV=development
export DATABASE_URL="postgresql+asyncpg://asl_demo:asl_demo_local@127.0.0.1:55432/asl_demo"
export DATABASE_SYNC_URL="postgresql://asl_demo:asl_demo_local@127.0.0.1:55432/asl_demo"
export NEO4J_URI="bolt://127.0.0.1:7688" NEO4J_USERNAME=neo4j NEO4J_PASSWORD=asl_demo_local NEO4J_DATABASE=neo4j
export REDIS_URL="redis://127.0.0.1:6380/0"
export PYTHONPATH=.
PY=.venv/bin/python

psql_demo() { "${COMPOSE[@]}" exec -T postgres psql -q -v ON_ERROR_STOP=1 -U asl_demo -d asl_demo "$@"; }

apply_schema() {
  # Chuỗi migration alembic (0001 → head). Mật khẩu vai trò asl_owner/asl_app chỉ dùng cho DB demo.
  (cd backend && ASL_OWNER_PASSWORD=asl_demo_owner ASL_APP_PASSWORD=asl_demo_app PYTHONPATH=.. \
     ../.venv/bin/alembic upgrade head 2>&1 | grep -vE "migration\] (Context impl|Will assume)")
}

wipe() {
  psql_demo -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" > /dev/null
  "${COMPOSE[@]}" exec -T neo4j cypher-shell -u neo4j -p asl_demo_local "MATCH (n) DETACH DELETE n" > /dev/null
  "${COMPOSE[@]}" exec -T redis redis-cli FLUSHALL > /dev/null
}

case "${1:-}" in
  up)
    "${COMPOSE[@]}" up -d --wait
    if [ "$(psql_demo -Atc "SELECT to_regclass('public.users') IS NOT NULL")" != "t" ]; then
      apply_schema
    fi
    "$PY" -m backend.app.scripts.seed_demo
    ;;
  reset)
    "${COMPOSE[@]}" up -d --wait
    wipe
    apply_schema
    "$PY" -m backend.app.scripts.seed_demo
    ;;
  backend)
    exec .venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir backend
    ;;
  frontend)
    cd frontend
    export BACKEND_ORIGIN="http://127.0.0.1:8000"
    exec npx next dev -p 3100
    ;;
  otp)
    "$PY" -c "import pyotp; from backend.app.scripts.seed_demo import DEMO_TOTP_SECRET as s; print(pyotp.TOTP(s).now())"
    ;;
  down)
    "${COMPOSE[@]}" down
    ;;
  *)
    sed -n '2,10p' "$0"; exit 1 ;;
esac
