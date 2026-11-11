# TASK-014 — Người dùng, phòng ban & đồng bộ đồ thị (TSK-18)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (phân quyền, thu hồi phiên)
> **Phụ thuộc:** TASK-008 (đăng nhập, `get_current_user`, `verify_csrf`, `revoke_user_sessions`) — code chỉ bắt đầu sau khi TASK-008 merge; test viết được ngay theo hợp đồng.

## 1. Mục tiêu
Quản trị viên tạo/sửa/khoá người dùng, quản lý phòng ban và Trưởng phòng; mọi thay đổi phản ánh lên đồ thị Neo4j để guard Need-to-know luôn đúng. Khoá tài khoản hay đổi Trưởng phòng phải có hiệu lực ngay.

## 2. Tài liệu bắt buộc đọc
- `CONTEXT.md` mục 3 (#2, #5, #6); `docs/14-decisions.md` DEC-01
- `docs/07-api-contracts.md` §1.2, §1.3, §2 (dòng Người dùng, Phòng ban), §3.2
- `docs/06-database-schema.md` bảng `users`, `departments`, `department_leaders`, `outbox_events`; §3 (đồ thị) và §4 (đồng bộ PostgreSQL → Neo4j)
- Code có sẵn: `backend/app/guards/need_to_know.py`, `backend/app/db/neo4j.py`, `backend/app/scripts/seed.py`, `backend/app/services/audit.py`; cách dựng user/test trong `backend/tests/test_auth.py`

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `backend/app/api/` (router `users.py`, `departments.py`)
- `backend/app/services/users.py`, `backend/app/services/graph_sync.py`
- `backend/app/schemas/users.py`
- `backend/app/scripts/rebuild_graph.py`
- `backend/app/main.py` (gắn router)

**Người viết test:** `backend/tests/test_users_departments.py`, `backend/tests/test_graph_sync.py` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; `backend/tests/` (trừ file test của task); `backend/app/guards/`, `backend/app/services/audit.py`, `backend/alembic/`; `docs/`, `qlcvaslgate-old/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- Quyền: ghi chỉ `ADMIN`; `GET /users`, `GET /users/{id}`, `GET /departments` cho `ADMIN` và `MANAGER`; vai trò khác → 403 `FORBIDDEN`. Mọi route ghi qua `verify_csrf`.
- `POST /users`: email phải đuôi `@asllaw.vn`, trùng → 409 `DUPLICATE_EMAIL`; `is_executive` chỉ với `MANAGER` (422); mật khẩu tạm 16 ký tự ngẫu nhiên đạt chính sách, băm Argon2id, `must_reset_password = TRUE`; trả `temporary_password` **một lần** trong 201 (không ghi vào log/audit). Ghi audit `USER_CREATED`.
- `PATCH /users/{id}`: sửa `full_name`, `title`, `phone_number`, `system_role`, `is_executive`, `department_id`. Đổi `system_role` hoặc `department_id` → thu hồi phiên (`revoke_user_sessions`). ADMIN không tự hạ vai trò của chính mình (403). Audit `USER_UPDATED` với `before_state`/`after_state` (không chứa băm/bí mật).
- `POST /users/{id}/deactivate` `{ "reason" }`: theo `docs/07` §3.2; không tự khoá chính mình (403). Audit `USER_DEACTIVATED`. `POST /users/{id}/activate` mở lại (audit `USER_ACTIVATED`).
- `GET /users?q=&role=&department_id=&page=&limit=` có `meta` phân trang; không trả `password_hash`, `totp_secret_enc`.
- `POST /departments` `{code, name}`; `PUT /departments/{id}/leaders`: mọi id phải là `MANAGER` đang hoạt động (422), thay toàn bộ danh sách.
- **Đồng bộ đồ thị:** trong cùng transaction PostgreSQL ghi `outbox_events` (`event_type` vd `USER_UPSERTED`, `USER_DEACTIVATED`, `DEPARTMENT_LEADERS_SET`). Khoá tài khoản và gỡ Trưởng phòng **cập nhật Neo4j ngay trong request** (gỡ cạnh `:LEADS`, `:ASSIGNED_TO`, đặt `u.is_active=false`); `services/graph_sync.process_outbox(limit)` áp sự kiện còn lại bằng `MERGE` (idempotent) rồi đặt `processed_at`. Nhãn/quan hệ theo `docs/06` §3.
- `python -m backend.app.scripts.rebuild_graph [--dry-run]`: dựng lại `User`, `Department`, `:LEADS`, `:MEMBER_OF`, `:ASSIGNED_TO` từ PostgreSQL; `--dry-run` in số nút/cạnh sẽ tạo. Chạy 2 lần cho cùng kết quả. Đây là dựng lại **toàn bộ**: xoá nút `User`/`Department`/`Case` không còn trong PostgreSQL, tạo cả nút `Case` (từ bảng `cases`) để cạnh `:ASSIGNED_TO` có đích; sau khi chạy, đồ thị phải khớp tuyệt đối với PostgreSQL và `backend/tests/test_neo4j_guard.py` vẫn xanh.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test — mỗi dòng ≥ 1 test)
- [ ] ADMIN tạo user → 201 có `temporary_password`; đăng nhập bằng mật khẩu đó → 403 `PASSWORD_RESET_REQUIRED`; email sai đuôi/trùng → 422/409; `is_executive` với ATTORNEY → 422.
- [ ] MANAGER/ATTORNEY gọi route ghi → 403; ATTORNEY gọi `GET /users` → 403; route ghi thiếu CSRF → 403 `CSRF_INVALID`.
- [ ] Khoá tài khoản: phiên đang mở của user đó → 401 `TOKEN_REVOKED` ngay request kế tiếp; đăng nhập lại → 423; Neo4j: `u.is_active=false` và không còn cạnh `:LEADS`/`:ASSIGNED_TO` của user — kiểm **ngay sau request**, không gọi `process_outbox`.
- [ ] ADMIN tự khoá/tự hạ vai trò → 403. Đổi `system_role` → phiên cũ 401 `TOKEN_REVOKED`.
- [ ] `PUT leaders` với user không phải MANAGER → 422; với MANAGER → Neo4j có đúng cạnh `:LEADS` mới, cạnh cũ bị gỡ.
- [ ] Mỗi thao tác ghi tạo đúng 1 dòng `outbox_events`; `process_outbox` chạy 2 lần không nhân đôi nút/cạnh, đặt `processed_at`.
- [ ] `rebuild_graph` trên DB seed: số nút/cạnh khớp dữ liệu PostgreSQL; chạy 2 lần cho cùng kết quả.
- [ ] Audit đủ 4 hành động, không dòng nào chứa `temporary_password` hay `password_hash`. Toàn bộ `backend/tests` vẫn xanh.

## 6. Ràng buộc & bẫy cần tránh
- Không sửa test; không nhánh riêng cho test; không mock Neo4j/DB trong code sản phẩm.
- `audit_logs` chỉ INSERT qua `log_audit_event`. Không dùng `DELETE` trên `users` (chỉ khoá).
- Test và code chạy trên Neo4j dev chung: test chỉ tạo/xoá nút gắn email `tsk18-…@asllaw.vn` và phòng ban mã `T18…`, không xoá dữ liệu seed.
- **Người viết test:** máy thợ không có DB/Redis → chỉ cần `python3 -m py_compile` qua; trưởng phòng chạy kiểm đỏ ở máy chính. `verify.sh` giống TASK-008 (`export ACCESS_TOKEN_EXPIRE_MINUTES=30`, kiểm `redis-cli ping`, `.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider`).
- Chạy test chỉ qua `python3 scripts/handoff.py verify <ID>`. File tạm ghi trong thư mục dự án; không dùng `|`/`xargs`; không gọi `.venv/bin/python` trực tiếp.
