# TASK-022 — CI GitHub Actions, Makefile & lint (TSK-16 phần CI)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không (không chứa bí mật; CI dùng DB tạm trong service container)

## 1. Mục tiêu
Mỗi lần push/PR, CI tự chạy lint + typecheck + test cho frontend và backend trên hạ tầng tạm (Postgres 16, Redis 7, Neo4j 5 trong service container), dựng schema bằng Alembic và seed dữ liệu — không phụ thuộc DB dev trên cloud. `Makefile` gom lệnh để chạy giống nhau ở máy dev và CI.

## 2. Tài liệu bắt buộc đọc
- `docs/11-tasks.md` mục TSK-16; `docs/09-conventions.md` §4 (git workflow)
- `docker-compose.yml`, `docker-compose.dev.yml` (tên biến môi trường), `backend/alembic.ini`, `backend/alembic/env.py`, `backend/app/core/config.py` (các biến app đọc), `backend/app/scripts/seed.py`, `frontend/package.json`

## 3. Phạm vi file
**Được tạo/sửa:**
- `.github/workflows/ci.yml`
- `Makefile`
- `ruff.toml`


**Người viết test:** `tests/infra/test_task_022_ci.py` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; `backend/app/`, `backend/tests/`, `frontend/src/`, `frontend/tests/`, `docs/`, `qlcvaslgate-old/`.

## 4. Đặc tả chi tiết
- `ci.yml`: kích hoạt `push` (mọi nhánh) và `pull_request`; `concurrency` huỷ lần chạy cũ cùng nhánh; `permissions: contents: read`. Action ghim theo **tag phiên bản cụ thể** (vd `actions/checkout@v4.2.2`), không `@main`/`@master`.
  - Job `frontend`: Node 22, `npm ci` trong `frontend/`, rồi `lint`, `typecheck`, `test`, `build`; cache npm theo `frontend/package-lock.json`.
  - Job `backend`: Python 3.11; `services` gồm `postgres:16-alpine`, `redis:7-alpine`, `neo4j:5-community` (mỗi service có `options: --health-cmd …` hoặc chờ sẵn sàng); `pip install -r backend/requirements.txt ruff`; `ruff check backend`; `alembic -c backend/alembic.ini upgrade head`; `python -m backend.app.scripts.seed`; `pytest backend/tests -q`.
  - Biến môi trường job backend: `DATABASE_URL`, `DATABASE_SYNC_URL`, `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`, `REDIS_URL`, `SECRET_KEY`, `DATA_ENCRYPTION_MASTER_KEY`, `ASL_OWNER_PASSWORD`, `ASL_APP_PASSWORD`, `ACCESS_TOKEN_EXPIRE_MINUTES=30` — giá trị chỉ dành cho CI (vd `ci-only-…`), trỏ `localhost` của runner. Không dùng `secrets.*` cho các giá trị này; không có URL cloud.
- `Makefile` (target `.PHONY`): `lint` (ruff + `npm --prefix frontend run lint`), `typecheck`, `test-frontend`, `test-backend`, `test` (= cả hai), `migrate` (`alembic upgrade head`), `seed`, `check-prototype` (`python3 scripts/check-prototype.py --strict`). Dùng biến `PY ?= .venv/bin/python`.
- `ruff.toml`: `target-version = "py311"`, `line-length = 120`, chọn tối thiểu `E9`, `F63`, `F7`, `F82` (lỗi cú pháp/tên chưa định nghĩa) — **không** sửa code backend để qua lint; nếu `ruff check backend` báo lỗi ở code có sẵn, ghi vào `report.md` mục câu hỏi.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test)
- [ ] `actionlint` không báo lỗi cho `.github/workflows/ci.yml` (`verify.sh` chạy `go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7`).
- [ ] Test Python (chỉ thư viện chuẩn, đọc YAML bằng cách tìm chuỗi/dòng — không cần PyYAML): có 2 job `frontend`, `backend`; mọi `uses:` ghim `@v<số>`; có 3 service đúng image; có bước `alembic … upgrade head`, `seed`, `pytest backend/tests`, `ruff check backend`; có `concurrency`, `permissions`; không chuỗi `supabase.co`, `neo4j.io`, `secrets.`; mọi biến môi trường bắt buộc ở §4 xuất hiện.
- [ ] `make -n` của từng target ở §4 chạy được (exit 0) và in đúng lệnh chính.
- [ ] `ruff.toml` có đúng `target-version`, `line-length`, bộ luật tối thiểu.

## 6. Ràng buộc & bẫy cần tránh
- Không đưa bí mật thật hay URL DB dev/cloud vào bất kỳ file nào.
- Không sửa code sản phẩm để "qua CI".
- Chạy test chỉ qua `python3 scripts/handoff.py verify TASK-022`. Ghi file bằng công cụ ghi file (tự tạo thư mục cha); `mkdir`, `npx`, `|`, `xargs` bị từ chối.
