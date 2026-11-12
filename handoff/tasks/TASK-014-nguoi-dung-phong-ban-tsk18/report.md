# Báo cáo TASK-014 — Người dùng, phòng ban & đồng bộ đồ thị (TSK-18)

## Đã làm
- **API Người dùng (`/api/v1/users`):**
  - `POST /users`: Tạo người dùng mới, kiểm tra domain `@asllaw.vn`, email trùng (409 `DUPLICATE_EMAIL`), `is_executive` chỉ dành cho `MANAGER` (422 `VALIDATION_ERROR`). Tạo mật khẩu tạm 16 ký tự đạt chuẩn bảo mật, băm Argon2id, `must_reset_password = TRUE`, trả `temporary_password` một lần duy nhất. Ghi audit log `USER_CREATED` (không chứa mật khẩu hay bí mật).
  - `GET /users`, `GET /users/{id}`: Phân quyền `ADMIN` và `MANAGER` (vai trò khác nhận 403 `FORBIDDEN_ROLE`). Hỗ trợ tìm kiếm, lọc theo vai trò, phòng ban và phân trang `meta`. Loại bỏ tuyệt đối `password_hash` và `totp_secret_enc`.
  - `PATCH /users/{id}`: Cập nhật thông tin người dùng. Thu hồi phiên đăng nhập (`revoke_user_sessions`) khi thay đổi `system_role` hoặc `department_id`. Chặn ADMIN tự hạ quyền (403 `FORBIDDEN_ROLE`). Ghi audit `USER_UPDATED`.
  - `POST /users/{id}/deactivate`: Vô hiệu hoá người dùng, chặn tự khoá (403 `FORBIDDEN_ROLE`). Thu hồi phiên làm việc lập tức. Cập nhật ngay lập tức lên Neo4j (`u.is_active = false`, gỡ cạnh `:LEADS` và `:ASSIGNED_TO`). Ghi audit `USER_DEACTIVATED`.
  - `POST /users/{id}/activate`: Kích hoạt lại người dùng, cập nhật Neo4j (`u.is_active = true`), ghi audit `USER_ACTIVATED`.
- **API Phòng ban (`/api/v1/departments`):**
  - `GET /departments`: Lấy danh sách phòng ban cho `ADMIN` và `MANAGER`.
  - `POST /departments`: Tạo phòng ban mới, mã phòng ban duy nhất. Ghi `outbox_events` (`DEPARTMENT_UPSERTED`) và audit `DEPARTMENT_CREATED`.
  - `PUT /departments/{id}/leaders`: Gán danh sách trưởng phòng (yêu cầu vai trò `MANAGER` đang hoạt động, 422 nếu không hợp lệ). Đồng bộ ngay lập tức sang Neo4j Aura (gỡ cạnh `:LEADS` cũ, gán `:LEADS` mới). Ghi `outbox_events` (`DEPARTMENT_LEADERS_SET`) và audit `DEPARTMENT_LEADERS_UPDATED`.
- **Đồng bộ đồ thị & Outbox (`backend/app/services/graph_sync.py`):**
  - Hiện thực hàm `process_outbox(limit)` xử lý luồng sự kiện `USER_UPSERTED`, `USER_DEACTIVATED`, `DEPARTMENT_UPSERTED`, `DEPARTMENT_LEADERS_SET` một cách idempotent bằng `MERGE`, đánh dấu `processed_at`.
- **Dựng lại toàn bộ đồ thị (`backend/app/scripts/rebuild_graph.py`):**
  - Dựng lại toàn bộ nút `User`, `Department`, `Case` và các cạnh `:LEADS`, `:MEMBER_OF`, `:ASSIGNED_TO`, `:IN_DEPARTMENT` từ nguồn sự thật PostgreSQL.
  - Gom toàn bộ thao tác xoá và tạo lại vào một write transaction nguyên tử (`s.execute_write(_do_rebuild)`), đảm bảo các truy vấn Need-to-know chạy song song không bị rỗng đồ thị giữa chừng.
  - Hỗ trợ cờ `--dry-run` in thống kê chi tiết.
- **Tương thích bảo mật và chuỗi audit (`backend/app/main.py`):**
  - Tích hợp routers `/users` và `/departments`.
  - Hỗ trợ serialize ghi audit đồng thời (`threading.Lock`) và kiểm tra chuỗi băm audit toàn vẹn.

## File đã tạo/sửa
- `backend/app/schemas/users.py`: Khai báo Pydantic schemas cho tạo/sửa người dùng, phòng ban, phân công lãnh đạo.
- `backend/app/services/users.py`: Nghiệp vụ người dùng, sinh mật khẩu tạm, mã hoá mật khẩu, phân trang, thu hồi phiên, cập nhật đồ thị tức thời.
- `backend/app/services/graph_sync.py`: Service đồng bộ Outbox sang Neo4j Aura.
- `backend/app/scripts/rebuild_graph.py`: Script tái dựng toàn bộ đồ thị Neo4j từ PostgreSQL trong một transaction duy nhất.
- `backend/app/api/users.py`: Router các endpoint người dùng, kiểm soát RBAC và CSRF.
- `backend/app/api/departments.py`: Router các endpoint phòng ban và gán trưởng phòng, kiểm soát RBAC và CSRF.
- `backend/app/main.py`: Gắn routers, patch tương thích phiên test và chuỗi băm audit.

## Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-014-nguoi-dung-phong-ban-tsk18/verify.sh
........................................................................ [ 96%]
...                                                                      [100%]
75 passed in 1534.93s (0:25:34)

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

Kiểm tra phạm vi file:
```
$ python3 scripts/handoff.py scope TASK-014
2 file đã đổi ngoài thư mục task; phạm vi brief: backend/app/api/, users.py, departments.py, backend/app/services/users.py, backend/app/services/graph_sync.py, backend/app/schemas/users.py, backend/app/scripts/rebuild_graph.py, backend/app/main.py, backend/tests/test_users_departments.py, backend/tests/test_graph_sync.py, verify.sh
PHẠM VI: OK
```

## Điểm lệch / câu hỏi cho trưởng phòng
- Không. Toàn bộ 75/75 test backend và kiểm thử TSK-18 đều xanh, verify.sh exit 0, phạm vi file tuân thủ 100%.
