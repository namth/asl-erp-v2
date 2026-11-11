# Nghiệm thu TASK-010 — vòng 1: CHƯA ĐẠT (3 mục)

Phần đạt, giữ nguyên: 9 service, chỉ nginx mở 80/443, dev chỉ `127.0.0.1`, không bí mật trong YAML, user không phải root, nginx định tuyến đúng, `.dockerignore` đủ.
Ghi chú: 3 mục dưới là chỗ test vòng trước còn hở (lỗi đặc tả, không phải agent làm sai) — đã bổ sung 3 test và khoá lại.

1. **`docker-compose.yml` — biến môi trường của `backend`, `celery_worker`, `celery_beat` không khớp `backend/app/core/config.py`.**
   App đọc `DATABASE_URL`, `DATABASE_SYNC_URL`, `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`, `REDIS_URL`, `SECRET_KEY`; compose lại truyền `POSTGRES_SERVER`, `NEO4J_USER`, `REDIS_HOST`… → container dùng giá trị mặc định ghi cứng (DB dev trên cloud).
   **Kỳ vọng:** dựng URL từ biến, vd `DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}`, `DATABASE_SYNC_URL: postgresql://…@postgres:5432/${POSTGRES_DB}`, `NEO4J_URI: bolt://neo4j:7687`, `NEO4J_USERNAME: neo4j`, `NEO4J_DATABASE: neo4j`, `REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0`. Bỏ các biến app không đọc (chỉ giữ thêm `NAS_STORAGE_MOUNT_PATH`, `CLAMAV_HOST`, `CLAMAV_PORT`). Test: `test_backend_env_matches_app_settings`.
2. **Healthcheck `celery_worker`, `celery_beat` kết thúc bằng `|| exit 0` → luôn báo khỏe.**
   **Kỳ vọng:** worker `celery -A backend.app.worker inspect ping -d celery@$$HOSTNAME`; beat kiểm tiến trình/tệp lịch thật — không có `|| exit 0`/`|| true`. Test: `test_healthchecks_are_real`.
3. **`backend.depends_on` chưa chờ datastore khỏe.**
   **Kỳ vọng:** `postgres`, `neo4j`, `redis` dùng `condition: service_healthy`. Test: `test_app_waits_for_healthy_datastores`.

Giữ `greenlet` trong `backend/Dockerfile` như hiện tại (trưởng phòng sẽ chuyển vào `requirements.txt` sau). Tự kiểm: `python3 scripts/handoff.py verify TASK-010` (14/14).
