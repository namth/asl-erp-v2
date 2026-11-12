# Báo cáo TASK-046: Backend Văn phòng số GET /operations/floorplan + WebSocket (TSK-15, SCR-15)

## Đã làm
- Triển khai endpoint HTTP `GET /api/v1/operations/floorplan` với phân quyền RBAC và kiểm tra Need-to-Know:
  - Giám đốc (`MANAGER`, `is_executive=True`) truy cập được mọi phòng; khi bỏ trống `department_id`, mặc định lấy phòng đầu tiên trong `department_leaders`, nếu không có thì lấy phòng đầu tiên theo tên trong hệ thống.
  - Trưởng phòng (`MANAGER` thường) chỉ được xem phòng trong `department_leaders` của mình; bỏ trống `department_id` mặc định lấy phòng đầu tiên mình phụ trách; xem phòng khác hoặc không phụ trách phòng nào trả về `403 NEED_TO_KNOW_DENIED`.
  - Các vai trò khác (`ATTORNEY`, `ACCOUNTANT`, `ADMIN`) bị từ chối với `403 FORBIDDEN_ROLE`.
  - Kiểm tra hợp lệ `department_id`: sai định dạng UUID trả về `422 VALIDATION_ERROR`; không tồn tại trả về `404 NOT_FOUND`.
- Truy vấn và tính toán dữ liệu floorplan theo đúng hợp đồng `docs/07-api-contracts.md` §3.7:
  - `department.leader`: lấy người đầu tiên theo tên trong `department_leaders` của phòng (`title` từ `users.title`, `avatar_url` là `null`). Trả về `null` nếu phòng chưa có trưởng phòng.
  - `workstations`: danh sách nhân sự đang hoạt động (`is_active = True`) thuộc phòng, loại trừ các trưởng phòng; sắp xếp theo tên (`full_name ASC, id ASC`); gán `desk_index` 1..n.
  - Đếm chính xác `in_progress_count` và `todo_count` từ `case_tasks`; xác định `is_idle = (in_progress_count == 0)`.
  - Hàng đợi duyệt `approval_queue`: gom nhóm theo nhân viên các yêu cầu `PENDING` thuộc vụ việc của phòng và nhân sự phòng; sắp xếp yêu cầu theo `requested_at ASC`; lấy đúng tiêu đề theo loại đối tượng (`TASK` -> tên task, `STAGE_GATE` -> tên giai đoạn, `CHANGE_REQUEST` -> lý do yêu cầu); đánh dấu `is_in_queue = True` trên workstation tương ứng.
  - Thống kê `stats`: `total_staff`, `working_count`, `resting_count`, `pending_approvals_count`.
- Triển khai endpoint WebSocket `WS /ws/operations/floorplan`:
  - Xác thực bằng cookie `access_token` trước khi accept (đóng kết nối với mã `4401` nếu thiếu hoặc không hợp lệ).
  - Kiểm tra vai trò `MANAGER` và phạm vi phòng ban tương tự HTTP GET (đóng kết nối với mã `4403` nếu không đủ quyền).
  - Đăng ký kênh Redis Pub/Sub `floorplan:{department_id}`, gửi `{"type": "READY"}` sau khi subscribe thành công và chuyển tiếp các sự kiện JSON cho client.
- Phát sự kiện thời gian thực (Pub/Sub):
  - Hàm `publish_floorplan_event(department_id, event_type, payload)` nuốt lỗi Redis và log warning, an toàn không làm hỏng luồng nghiệp vụ chính.
  - `notify_task_status_changed`: phát `EVENT_TASK_STATUS_UPDATED` kèm số đếm mới khi task đổi trạng thái hoặc đổi người được giao (`case_tasks.py`).
  - `notify_approval_submitted`: phát `EVENT_APPROVAL_SUBMITTED` khi nhân sự gửi yêu cầu duyệt task / giai đoạn / thay đổi (`case_tasks.py`, `change_requests.py`).
  - `notify_approval_decided`: phát `EVENT_APPROVAL_DECIDED` khi quản lý phê duyệt/từ chối yêu cầu (`approvals.py`).
  - Mọi sự kiện đều phát SAU KHI transaction DB đã commit thành công.

## File đã tạo/sửa
- [backend/app/api/floorplan.py](file:///Users/namtran/agy-farm/worktrees/TASK-046/backend/app/api/floorplan.py): Router FastAPI chứa HTTP `GET /operations/floorplan` và WebSocket `WS /ws/operations/floorplan`.
- [backend/app/services/floorplan.py](file:///Users/namtran/agy-farm/worktrees/TASK-046/backend/app/services/floorplan.py): Xử lý phân quyền phạm vi, truy vấn dữ liệu floorplan, và các hàm phát sự kiện Redis Pub/Sub.
- [backend/app/main.py](file:///Users/namtran/agy-farm/worktrees/TASK-046/backend/app/main.py): Đăng ký `floorplan_router` (`/api/v1`) và `floorplan_ws_router`.
- [backend/app/services/case_tasks.py](file:///Users/namtran/agy-farm/worktrees/TASK-046/backend/app/services/case_tasks.py): Gọi phát sự kiện `EVENT_TASK_STATUS_UPDATED` và `EVENT_APPROVAL_SUBMITTED` sau khi commit transaction trong `patch_task` và `update_task_status`.
- [backend/app/services/approvals.py](file:///Users/namtran/agy-farm/worktrees/TASK-046/backend/app/services/approvals.py): Gọi phát sự kiện `EVENT_APPROVAL_DECIDED` và `EVENT_TASK_STATUS_UPDATED` sau khi commit transaction trong `decide_approval`.
- [backend/app/services/change_requests.py](file:///Users/namtran/agy-farm/worktrees/TASK-046/backend/app/services/change_requests.py): Gọi phát sự kiện `EVENT_APPROVAL_SUBMITTED` sau khi commit transaction trong `create_change_request`.

## Kết quả tự kiểm
- 34/35 test cases PASSED:
  - Toàn bộ suite cũ `backend/tests/test_task_flow.py` (10 tests) -> PASSED
  - Toàn bộ suite cũ `backend/tests/test_approvals.py` (11 tests) -> PASSED
  - `backend/tests/test_no_test_hooks_in_app.py` (1 test) -> PASSED
  - 12/13 test cases trong `backend/tests/test_floorplan.py` -> PASSED:
    - `test_director_access_all_departments_and_default`: PASSED
    - `test_department_leader_scope_and_default`: PASSED
    - `test_manager_without_assigned_departments_denied`: PASSED
    - `test_other_roles_forbidden`: PASSED
    - `test_unauthenticated_and_param_validation`: PASSED
    - `test_department_leader_workstations_and_stats_calculation`: PASSED
    - `test_department_without_leader_returns_null`: PASSED
    - `test_ws_authentication_and_scope_disconnect_codes`: PASSED
    - `test_ws_receives_redis_events_on_department_channel`: PASSED
    - `test_decide_approval_publishes_event_and_updates_floorplan`: PASSED
    - `test_task_status_update_publishes_event_and_updates_floorplan`: PASSED
    - `test_publish_floorplan_event_contract_and_resilience`: PASSED

- 1 test case FAILED do lỗi vi phạm ràng buộc DB unique constraint trong fixture setup của test:
```
=================================== FAILURES ===================================
__________________ test_approval_queue_details_and_isolation ___________________

    async def test_approval_queue_details_and_isolation():
...
            # 1. Staff A có 2 yêu cầu PENDING trên case_main:
            # Request 1 (cũ hơn, 30 phút trước): TASK
            task_a = insert_task(conn, case_main["id"], stage_main_id, staff_a["id"], "Soạn tờ khai đăng ký nhãn hiệu")
            appr_task = insert_approval_request(
                conn, case_main["id"], "TASK", task_a, staff_a["id"], status="PENDING", minutes_ago=30
            )
...
            # 4. Yêu cầu PENDING của Staff Other (ngoài phòng) -> không được vào queue phòng main
>           insert_approval_request(
                conn, case_main["id"], "TASK", task_a, staff_other["id"], status="PENDING", minutes_ago=15
            )

backend/tests/test_floorplan.py:554: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 
backend/tests/test_floorplan.py:112: in insert_approval_request
    conn.execute(
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <psycopg.Connection [BAD] at 0x10bcdcb50>
query = 'INSERT INTO approval_requests (id, case_id, subject_type, subject_id, requested_by,\n                                         status, requested_at)\n           VALUES (%s, %s, %s, %s, %s, %s, now() - make_interval(mins => %s))'
params = ('8ceb20ee-d7d1-4d8e-aff6-03aa7f9a1997', '098b1a1f-89d8-417a-bcb2-d443c286236f', 'TASK', '5565b529-4512-4092-97b1-92dcd99feb2e', '414734c3-4002-4740-8046-3004f169c496', 'PENDING', ...)
prepare = None, binary = False

    def execute(
        self,
        query: Query,
        params: Params | None = None,
        *,
        prepare: bool | None = None,
        binary: bool = False,
    ) -> Cursor[Row]:
...
>           raise ex.with_traceback(None)
E           psycopg.errors.UniqueViolation: duplicate key value violates unique constraint "idx_approval_pending_subject"
E           DETAIL:  Key (subject_type, subject_id)=(TASK, 5565b529-4512-4092-97b1-92dcd99feb2e) already exists.

../../qlcvasl-v2/.venv/lib/python3.11/site-packages/psycopg/connection.py:304: UniqueViolation
=========================== short test summary info ============================
FAILED backend/tests/test_floorplan.py::test_approval_queue_details_and_isolation
1 failed, 34 passed, 1 warning in 1337.91s (0:22:17)

KẾT QUẢ: khoá test OK, verify.sh exit 1
```

## Điểm lệch / câu hỏi cho trưởng phòng
Test `test_approval_queue_details_and_isolation` tại file `backend/tests/test_floorplan.py` (đang bị khoá trong `tests.lock`) bị lỗi do chính fixture setup của test:
- Tại dòng 527-530: Test tạo `task_a` và tạo một yêu cầu duyệt `appr_task` ở trạng thái `PENDING` cho `task_a`.
- Tại dòng 554: Test cố tình chèn thêm một yêu cầu duyệt thứ hai cũng ở trạng thái `PENDING` cho cùng `task_a` (`insert_approval_request(conn, case_main["id"], "TASK", task_a, staff_other["id"], status="PENDING", minutes_ago=15)`).
- PostgreSQL database có ràng buộc unique index: `idx_approval_pending_subject` trên `(subject_type, subject_id) WHERE status = 'PENDING'`, không cho phép một task có đồng thời 2 yêu cầu duyệt `PENDING`.
- Do đó PostgreSQL bắn exception `psycopg.errors.UniqueViolation` ngay khi test đang chuẩn bị dữ liệu fixture, trước khi API code được gọi.
- Đề xuất sửa file test: Tạo một task riêng cho `staff_other` (ví dụ `task_other_staff = insert_task(...)`) và dùng task đó khi gọi `insert_approval_request` ở dòng 554.
- Do `backend/tests/test_floorplan.py` nằm trong `tests.lock`, theo Quy tắc 2, 11, 13 và skill `/thuc-hien-task`, kỹ sư thực thi không được tự sửa file test bị khoá hoặc sửa schema DB, không nộp khi test còn đỏ, và dừng báo cáo xin trưởng phòng hỗ trợ.
