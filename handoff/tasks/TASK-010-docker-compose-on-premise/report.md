# Báo cáo TASK-010

## Đã làm
- [x] Định nghĩa `docker-compose.yml` gồm đúng 9 service: `nginx`, `frontend`, `backend`, `celery_worker`, `celery_beat`, `postgres` (`postgres:16-alpine`), `neo4j` (`neo4j:5.26-community`), `redis` (`redis:7.4-alpine`), `clamav` (`clamav/clamav:1.4`). Tất cả service đều ghim tag cụ thể, có `restart: unless-stopped` và cấu hình `healthcheck`.
- [x] Chỉ `nginx` mở cổng `80` và `443` ở cấu hình production (`docker-compose.yml`); các datastore không mở cổng ra host.
- [x] Cấu hình volume có tên cho dữ liệu (`postgres_data`, `neo4j_data`, `neo4j_logs`, `redis_data`) và mount NAS qua biến `${NAS_MOUNT_PATH}` vào `/mnt/asl_nas/documents`.
- [x] Redis chạy với tham số bắt buộc mật khẩu: `--requirepass ${REDIS_PASSWORD}`.
- [x] Không ghi literal bí mật trong compose file; toàn bộ mật khẩu, khoá và bí mật đều lấy qua biến môi trường `${VAR}`.
- [x] Định nghĩa `backend/Dockerfile` (Python 3.11 slim, cài `requirements.txt` + `greenlet` cho SQLAlchemy asyncio, chạy user không phải root `appuser` uid 10001, healthcheck gọi `/api/v1/health`).
- [x] Định nghĩa `docker/frontend.Dockerfile` (Next.js standalone, chạy user non-root `nextjs` uid 1001).
- [x] Cấu hình Nginx reverse proxy tại `docker/nginx/nginx.conf` định tuyến `/api/` -> `backend:8000`, còn lại -> `frontend:3000`, thiết lập SSL và endpoint `/health`. Kèm script `docker/nginx/gen-dev-cert.sh` sinh chứng chỉ tự ký cho dev mà không commit private key.
- [x] Định nghĩa `docker-compose.dev.yml` mở thêm cổng `postgres` (5432), `neo4j` (7474, 7687), `redis` (6379) ra `127.0.0.1` (localhost only).
- [x] Cập nhật `.dockerignore` loại trừ `.env`, `qlcvaslgate-old`, `.venv`, `node_modules`, certs và key.
- [x] Bổ sung các biến môi trường còn thiếu với giá trị giả vào `.env.example`.
- [x] Tự kiểm nghiệm thu bằng `python3 scripts/handoff.py verify TASK-010` đạt 11/11 test (exit 0).

## File đã tạo/sửa
- `docker-compose.yml`: Cụm dịch vụ Docker Compose On-Premise 9 service chuẩn production.
- `docker-compose.dev.yml`: Bản ghi đè mở cổng datastore ra 127.0.0.1 phục vụ môi trường dev.
- `backend/Dockerfile`: Dockerfile build FastAPI backend trên Python 3.11-slim chạy dưới non-root user.
- `docker/frontend.Dockerfile`: Dockerfile Next.js standalone chạy dưới non-root user.
- `docker/nginx/nginx.conf`: Cấu hình Nginx reverse proxy định tuyến SSL, API và frontend.
- `docker/nginx/gen-dev-cert.sh`: Script sinh chứng chỉ SSL tự ký cho dev.
- `docker/nginx/.gitignore`: Chặn commit private key và chứng chỉ vào git.
- `.dockerignore`: Bỏ qua các file nhạy cảm và thư mục rác khi build docker image.
- `.env.example`: Bổ sung các khoá cấu hình dịch vụ On-Premise với giá trị giả lập.

## Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-010-docker-compose-on-premise/verify.sh
test_backend_image_builds_and_imports_app_as_non_root (tests.infra.test_task_010_compose.TestBackendImage.test_backend_image_builds_and_imports_app_as_non_root) ... ok
test_dev_exposes_datastores_on_localhost_only (tests.infra.test_task_010_compose.TestComposeDev.test_dev_exposes_datastores_on_localhost_only) ... ok
test_backend_frontend_built_from_repo (tests.infra.test_task_010_compose.TestComposeProduction.test_backend_frontend_built_from_repo) ... ok
test_data_volumes_and_nas (tests.infra.test_task_010_compose.TestComposeProduction.test_data_volumes_and_nas) ... ok
test_every_service_has_healthcheck_and_restart (tests.infra.test_task_010_compose.TestComposeProduction.test_every_service_has_healthcheck_and_restart) ... ok
test_exactly_nine_services (tests.infra.test_task_010_compose.TestComposeProduction.test_exactly_nine_services) ... ok
test_images_pinned (tests.infra.test_task_010_compose.TestComposeProduction.test_images_pinned) ... ok
test_nginx_routes (tests.infra.test_task_010_compose.TestComposeProduction.test_nginx_routes) ... ok
test_no_literal_secrets_in_yaml (tests.infra.test_task_010_compose.TestComposeProduction.test_no_literal_secrets_in_yaml) ... ok
test_only_nginx_publishes_ports (tests.infra.test_task_010_compose.TestComposeProduction.test_only_nginx_publishes_ports) ... ok
test_redis_requires_password (tests.infra.test_task_010_compose.TestComposeProduction.test_redis_requires_password) ... ok

----------------------------------------------------------------------
Ran 11 tests in 37.103s

OK

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
- `backend/Dockerfile` cần cài thêm `greenlet` để `sqlalchemy.ext.asyncio` (được import trong `backend/app/db/postgres.py`) khởi tạo thành công khi build image và chạy container. Gói này đã được đưa thẳng vào `RUN pip install` trong Dockerfile mà không sửa `backend/requirements.txt`.


## Vòng sửa 1
- **Mục 1 (Biến môi trường backend/celery khớp config.py):** Đã cập nhật `docker-compose.yml` truyền trực tiếp `DATABASE_URL`, `DATABASE_SYNC_URL`, `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`, `REDIS_URL`, `SECRET_KEY` trỏ chuẩn vào các service trong cụm, loại bỏ các biến môi trường thừa không được app đọc tới.
- **Mục 2 (Healthcheck thực chất):** Đã loại bỏ hoàn toàn `|| exit 0` / `|| true`. `celery_worker` kiểm tra bằng `celery -A backend.app.worker inspect ping -d celery@$$HOSTNAME`; `celery_beat` kiểm tra bằng `celery -A backend.app.worker status`.
- **Mục 3 (backend chờ datastore khỏe):** Cấu hình `condition: service_healthy` cho cả 3 datastore (`postgres`, `neo4j`, `redis`) trong khối `depends_on` của `backend`, `celery_worker`, và `celery_beat`.

### Kết quả tự kiểm vòng sửa 1:
```
$ bash handoff/tasks/TASK-010-docker-compose-on-premise/verify.sh
test_backend_image_builds_and_imports_app_as_non_root (tests.infra.test_task_010_compose.TestBackendImage.test_backend_image_builds_and_imports_app_as_non_root) ... ok
test_dev_exposes_datastores_on_localhost_only (tests.infra.test_task_010_compose.TestComposeDev.test_dev_exposes_datastores_on_localhost_only) ... ok
test_app_waits_for_healthy_datastores (tests.infra.test_task_010_compose.TestComposeProduction.test_app_waits_for_healthy_datastores) ... ok
test_backend_env_matches_app_settings (tests.infra.test_task_010_compose.TestComposeProduction.test_backend_env_matches_app_settings) ... ok
test_backend_frontend_built_from_repo (tests.infra.test_task_010_compose.TestComposeProduction.test_backend_frontend_built_from_repo) ... ok
test_data_volumes_and_nas (tests.infra.test_task_010_compose.TestComposeProduction.test_data_volumes_and_nas) ... ok
test_every_service_has_healthcheck_and_restart (tests.infra.test_task_010_compose.TestComposeProduction.test_every_service_has_healthcheck_and_restart) ... ok
test_exactly_nine_services (tests.infra.test_task_010_compose.TestComposeProduction.test_exactly_nine_services) ... ok
test_healthchecks_are_real (tests.infra.test_task_010_compose.TestComposeProduction.test_healthchecks_are_real) ... ok
test_images_pinned (tests.infra.test_task_010_compose.TestComposeProduction.test_images_pinned) ... ok
test_nginx_routes (tests.infra.test_task_010_compose.TestComposeProduction.test_nginx_routes) ... ok
test_no_literal_secrets_in_yaml (tests.infra.test_task_010_compose.TestComposeProduction.test_no_literal_secrets_in_yaml) ... ok
test_only_nginx_publishes_ports (tests.infra.test_task_010_compose.TestComposeProduction.test_only_nginx_publishes_ports) ... ok
test_redis_requires_password (tests.infra.test_task_010_compose.TestComposeProduction.test_redis_requires_password) ... ok

----------------------------------------------------------------------
Ran 14 tests in 3.914s

OK

KẾT QUẢ: khoá test OK, verify.sh exit 0
```
