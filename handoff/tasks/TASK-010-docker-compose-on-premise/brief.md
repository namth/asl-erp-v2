# TASK-010 — Docker Compose cụm dịch vụ On-Premise (TSK-01)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** có (lộ cổng/bí mật)

## 1. Mục tiêu
Định nghĩa cụm 9 container chạy trên máy chủ văn phòng, cùng bản ghi đè cho môi trường dev, để mọi task sau có hạ tầng chạy thử thống nhất.

## 2. Tài liệu bắt buộc đọc
- `docs/11-tasks.md` mục TSK-01; `docs/05-architecture.md` (sơ đồ container, mạng, NAS)
- `docs/10-env-and-security.md` (biến môi trường, Redis có mật khẩu)
- Test: `tests/infra/test_task_010_compose.py` (hợp đồng nghiệm thu)

## 3. Phạm vi file
**Được tạo/sửa:**
- `docker-compose.yml`, `docker-compose.dev.yml`
- `docker/` (vd `docker/nginx/nginx.conf`, `docker/nginx/gen-dev-cert.sh`, `docker/frontend.Dockerfile`)
- `backend/Dockerfile`, `.dockerignore`
- `.env.example` (chỉ thêm khoá còn thiếu, giá trị giả)

**Không được sửa:**
- Mọi file trong `tests.lock`; `backend/app/`, `backend/tests/`, `frontend/`, `docs/`, `qlcvaslgate-old/`

## 4. Đặc tả chi tiết
- Đúng 9 service: `nginx`, `frontend`, `backend`, `celery_worker`, `celery_beat`, `postgres` (`postgres:16-…`), `neo4j` (`neo4j:5…`), `redis` (`redis:7-…`), `clamav`. Ghim tag cụ thể, không `latest`.
- `docker-compose.yml` = cấu hình production: **chỉ `nginx` mở cổng** (`80`, `443`); mọi service có `healthcheck` và `restart: unless-stopped`; một mạng bridge nội bộ chung; volume có tên cho dữ liệu postgres/neo4j/redis; thư mục NAS mount qua biến `${NAS_MOUNT_PATH}`.
- Bí mật chỉ qua biến môi trường (`env_file: .env` hoặc `${VAR}`), không viết giá trị mật khẩu trong YAML. Redis chạy với `--requirepass ${REDIS_PASSWORD}`.
- `backend`: build `backend/Dockerfile` (Python 3.11 slim, cài `backend/requirements.txt`, chạy `uvicorn backend.app.main:app` dưới user không phải root, healthcheck gọi `/api/v1/health`). `celery_worker`/`celery_beat` dùng cùng image, lệnh `celery -A backend.app.worker …` (module worker sẽ có ở task sau).
- `frontend`: build `docker/frontend.Dockerfile` từ thư mục `frontend/` (Next.js standalone, chạy user không phải root).
- `nginx`: SSL nội bộ, `/api/` → `backend:8000`, còn lại → `frontend:3000`; `gen-dev-cert.sh` tạo chứng chỉ tự ký cho dev (không commit khoá riêng).
- `docker-compose.dev.yml`: chỉ mở thêm cổng `postgres`, `neo4j`, `redis` ra **`127.0.0.1`** (không bao giờ `0.0.0.0`).

## 5. Tiêu chí nghiệm thu
- [ ] `python3 scripts/handoff.py verify TASK-010` exit 0
- [ ] `docker compose config` hợp lệ cho cả bản production và bản production + dev
- [ ] Ảnh `backend` build được và import được `backend.app.main` bên trong container

## 6. Ràng buộc & bẫy cần tránh
- Không `docker compose up` cả cụm (máy đang chạy Redis cục bộ ở cổng 6379); test chỉ `config` và `build`.
- Không chép bí mật từ `backend/app/core/config.py` hay `.env` vào bất kỳ file nào.
- Không sửa code backend để "cho build qua" — thiếu gì ghi vào `report.md`.
- Chạy test chỉ bằng `python3 scripts/handoff.py verify TASK-010`.
