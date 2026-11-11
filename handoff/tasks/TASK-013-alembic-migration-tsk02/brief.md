# TASK-013 — Alembic migration, hai user DB & bảng bất biến (TSK-02)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (migration, phân quyền DB)

## 1. Mục tiêu
Thay việc áp tay `backend/alembic/versions/001_initial_schema.sql` bằng Alembic thật: `alembic upgrade head` dựng toàn bộ schema trên DB trống, `downgrade base` gỡ sạch; tạo hai role `asl_owner` (sở hữu schema) và `asl_app` (ứng dụng) đúng bất biến #6.

## 2. Tài liệu bắt buộc đọc
- `CONTEXT.md` mục 3 (bất biến #6); `docs/11-tasks.md` mục TSK-02
- `docs/06-database-schema.md` §1 (hai user DB) và mục `audit_logs`, `misa_transactions`, `commission_transactions`
- Test: `tests/infra/test_task_013_migrations.py` (hợp đồng nghiệm thu)

## 3. Phạm vi file
**Được tạo/sửa:** `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/script.py.mako`, `backend/alembic/versions/` (file `.py` mới; **giữ** `001_initial_schema.sql` làm nguồn, revision đầu đọc và chạy file này).
**Không được sửa:** mọi file trong `tests.lock`; `backend/app/`, `backend/tests/`, `docs/`, `qlcvaslgate-old/`.

## 4. Đặc tả chi tiết
- `env.py` lấy URL từ biến môi trường `DATABASE_SYNC_URL` (driver `psycopg` 3 — dùng dạng `postgresql+psycopg://`), không import engine async của app, không có URL mặc định ghi cứng.
- Revision `0001_baseline`: chạy `001_initial_schema.sql` (tách câu lệnh đúng cách, chú ý khối `$$ … $$` của hàm). `downgrade` xoá toàn bộ đối tượng do nó tạo (bảng, hàm trigger, phân vùng).
- Revision `0002_roles_and_grants`:
  - Tạo role `asl_owner`, `asl_app` (LOGIN, NOSUPERUSER) nếu chưa có; mật khẩu từ `ASL_OWNER_PASSWORD`, `ASL_APP_PASSWORD` (thiếu biến → lỗi rõ ràng).
  - Chuyển sở hữu mọi bảng/sequence/hàm trong `public` (trừ `alembic_version`) sang `asl_owner`.
  - `asl_app`: `USAGE` schema; `SELECT, INSERT, UPDATE, DELETE` mọi bảng, **trừ** `audit_logs`, `misa_transactions`, `commission_transactions` chỉ `SELECT, INSERT`; `USAGE, SELECT` sequence; `ALTER DEFAULT PRIVILEGES FOR ROLE asl_owner` để bảng tạo sau cũng cấp đúng (bảng mới không phải 3 bảng trên).
  - Thêm trigger `BEFORE UPDATE OR DELETE … RAISE EXCEPTION` cho `commission_transactions` (2 bảng kia đã có trong 0001).
  - `downgrade`: thu hồi quyền, trả sở hữu về role chạy migration, xoá trigger mới; xoá role chỉ khi không còn sở hữu đối tượng nào.
- Chuỗi revision tuyến tính, đúng 1 head.

## 5. Tiêu chí nghiệm thu
- [ ] `python3 scripts/handoff.py verify TASK-013` exit 0 (Postgres tạm trong Docker)
- [ ] `upgrade head` → `downgrade base` → `upgrade head` đều chạy được
- [ ] `asl_app` không UPDATE/DELETE/TRUNCATE được 3 bảng bất biến; trigger chặn cả `asl_owner`

## 6. Ràng buộc & bẫy cần tránh
- Không chạy migration vào DB dev dùng chung (`127.0.0.1:65432`) hay Supabase — chỉ Postgres tạm của test.
- Không ghi mật khẩu/URL thật trong file nào. Không sửa `001_initial_schema.sql` trừ khi bắt buộc để tách câu lệnh — nếu sửa, ghi lý do vào `report.md`.
- `backend/alembic/versions/002_user_recovery_codes.sql` có thể xuất hiện từ TASK-011 — không đụng tới.
- Chạy test chỉ qua `python3 scripts/handoff.py verify TASK-013`. File tạm ghi trong thư mục dự án; không dùng lệnh có `|`/`xargs`; không gọi `.venv/bin/python` trực tiếp.
