# TASK-046 — Backend Văn phòng số (TSK-15, SCR-15)

> Người giao: Claude (Trưởng phòng) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (phạm vi phòng ban theo vai trò)

## 1. Mục tiêu
Giao diện Văn phòng số (`frontend/src/hooks/use-floorplan.ts`, `use-floorplan-live.ts`, `frontend/src/lib/floorplan.ts`, kiểu `frontend/src/types/floorplan.ts`) đã có, backend chưa có. Viết `GET /api/v1/operations/floorplan` và `WS /ws/operations/floorplan`, phát sự kiện thời gian thực khi task đổi trạng thái và khi yêu cầu duyệt được gửi/quyết định.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` §3.7 (mẫu JSON + mục WebSocket) — nguồn sự thật
- `docs/features/virtual-office-floorplan.md` §5–7 (BR-FLOOR-01…04, TC-FL-*)
- Mẫu: `backend/app/api/notifications.py` (`ws_router`, xác thực cookie, Redis Pub/Sub), `backend/app/services/notifications.py` (publish), `backend/app/services/reports.py` (`resolve_scope` — phạm vi Trưởng phòng qua `department_leaders`), `backend/app/api/accounting.py` (psycopg đồng bộ qua `asyncio.to_thread`)

## 3. Phạm vi file
**Được tạo/sửa:**
- `backend/app/api/floorplan.py` (router HTTP + `ws_router`)
- `backend/app/services/floorplan.py` (truy vấn + `publish_floorplan_event`)
- `backend/app/services/case_tasks.py`, `backend/app/services/approvals.py`, `backend/app/services/change_requests.py` — **chỉ thêm** lời gọi phát sự kiện sau khi transaction commit; không đổi logic có sẵn
- `backend/app/main.py` — chỉ thêm import + `include_router`
- `backend/tests/test_floorplan.py` (tài khoản kiểm chéo viết, sau đó khoá)

**Không được sửa:** file trong `tests.lock`, `docs/`, `frontend/`, migration, `backend/app/guards/`.

## 4. Blueprint
- **Vai trò & phạm vi GET:** không phải `MANAGER` → `403 FORBIDDEN_ROLE`. `MANAGER` có `is_executive` → mọi phòng; bỏ trống `department_id` → phòng đầu tiên mình phụ trách trong `department_leaders`, không có thì phòng đầu tiên theo tên. `MANAGER` thường → chỉ phòng trong `department_leaders` của mình; bỏ trống → phòng đầu tiên theo tên; không phụ trách phòng nào, hoặc chọn phòng khác → `403 NEED_TO_KNOW_DENIED`. `department_id` sai định dạng → 422; không tồn tại → 404.
- **Dữ liệu:**
  - `department.leader`: người đầu tiên (theo tên) trong `department_leaders` của phòng; không có → `null`. `title` = `users.title`; `avatar_url` = `null` (chưa có ảnh).
  - Nhân sự (`workstations`): `users` đang hoạt động có `department_id` = phòng, **trừ** các trưởng phòng của phòng đó; `desk_index` 1..n theo `full_name`, `id`.
  - `in_progress_count` / `todo_count`: số `case_tasks` có `assigned_to` = người đó, trạng thái `IN_PROGRESS` / `TODO`. `is_idle = in_progress_count == 0` (BR-FLOOR-01).
  - `approval_queue`: `approval_requests` `PENDING` có `requested_by` thuộc danh sách nhân sự **và** vụ việc thuộc phòng; nhóm theo người, `requests` cũ nhất trước; `title` = tiêu đề task (`TASK`), tên stage (`STAGE_GATE`), lý do của yêu cầu bổ sung (`CHANGE_REQUEST`). `is_in_queue = pending_count > 0` (BR-FLOOR-02).
  - `stats`: `total_staff` = số bàn; `working_count`/`resting_count` theo `is_idle`; `pending_approvals_count` = tổng yêu cầu trong hàng đợi.
  - Phản hồi `{"success": true, "data": {...}}` đúng mẫu §3.7 (thêm `subject_type` trong mỗi request).
- **WebSocket:** như mục WS ở §3.7: xác thực cookie trước `accept` (đóng `4401`), kiểm phạm vi như GET (đóng `4403`), subscribe `floorplan:{department_id}`, chuyển tiếp từng tin JSON; huỷ subscribe khi ngắt.
- **Phát sự kiện:** `publish_floorplan_event(department_id, type, payload)` (async, nuốt lỗi Redis và ghi log — lỗi phát không được làm hỏng thao tác chính). Phòng = `users.department_id` của nhân sự liên quan; không có phòng → bỏ qua. Gọi sau commit ở: đổi trạng thái/đổi người giao task (phát cho người cũ và người mới, số đếm tính lại), tạo `approval_requests`, quyết định/huỷ yêu cầu.

## 5. Tiêu chí nghiệm thu (đo được — đầu vào để viết test)
- Giám đốc `200` cả hai phòng; Trưởng phòng A `200` phòng A, `403 NEED_TO_KNOW_DENIED` phòng B; Luật sư/Kế toán/Quản trị `403 FORBIDDEN_ROLE`; bỏ trống `department_id` với Trưởng phòng A → phòng A (TC-FL-01).
- Nhân sự có 3 task `IN_PROGRESS` + 2 `TODO` → `3`/`2`, `is_idle=false`; nhân sự không task đang làm → `is_idle=true`; `stats` khớp (TC-FL-02).
- Nhân sự có 2 yêu cầu `PENDING` → trong `approval_queue` với `pending_count=2`, `is_in_queue=true`; yêu cầu của người ngoài phòng hoặc vụ phòng khác không xuất hiện; trưởng phòng không có bàn (TC-FL-03).
- Duyệt yêu cầu cuối cùng qua API duyệt có sẵn → GET lại: người đó rời hàng đợi; client WS phòng đó nhận `EVENT_APPROVAL_DECIDED`; đổi trạng thái task qua API có sẵn → nhận `EVENT_TASK_STATUS_UPDATED` với số đếm mới (TC-FL-04, TC-FL-07).
- WS không cookie → đóng `4401`; Trưởng phòng A nối phòng B → đóng `4403`.
- `bash handoff/tasks/TASK-046-floorplan-backend/verify.sh` xanh; test cũ `test_task_flow.py`, `test_approvals.py` vẫn xanh.

## 6. Bẫy cần tránh
- Không đếm trong Python từ dữ liệu đã lọc sai phạm vi; không ghép giá trị vào chuỗi SQL.
- Không phát sự kiện trước commit; không để lỗi Redis làm 500 thao tác duyệt/đổi trạng thái.
- Không UPDATE/DELETE `audit_logs`; không gán đè hàm/biến môi trường lúc chạy.
- Không sửa test đã khoá; không `python3 -c` nhiều dòng; không `rm`/`&&`/`git`/`sed`/`cat`/`grep`. File tạm ở `handoff/tasks/TASK-046-floorplan-backend/scratch/`.
