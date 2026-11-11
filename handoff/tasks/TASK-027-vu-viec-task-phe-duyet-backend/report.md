# Báo cáo TASK-027

## Đã làm
- **Need-to-know:** Luật sư không được phân công bị chặn 403 `NEED_TO_KNOW_DENIED` ở `GET /cases/{id}` và mọi sub-route, ghi nhận audit log `ACCESS_DENIED`. Trưởng phòng phòng khác bị chặn 403, Trưởng phòng cùng phòng và Giám đốc (`is_executive = True`) xem được đầy đủ. `GET /cases` chỉ trả danh sách vụ việc trong phạm vi `progress` lọc ở đồ thị Neo4j. Kế toán và Originator chỉ xem được thông tin tiến độ qua `?view=progress` (không lộ `custom_data`).
- **Máy trạng thái & Phụ thuộc Task:** Chuyển trạng thái task `TODO -> IN_PROGRESS` bị chặn 422 `PREREQUISITE_TASK_NOT_COMPLETED` kèm danh sách `blocked_by` khi có task tiên quyết chưa `COMPLETED`. Chặn 409 `STAGE_LOCKED` khi stage ở trạng thái khác `ACTIVE`. Chặn 409 `CASE_PAUSED` khi vụ việc `PAUSED`. Chặn 409 `LEGACY_CASE_READ_ONLY` khi vụ việc là lịch sử. Chặn 409 `INVALID_STATE_TRANSITION` khi nhảy cóc `TODO -> COMPLETED`. Task `requires_approval = True` chỉ được chuyển sang `WAITING_APPROVAL` để sinh `approval_requests` loại `TASK`.
- **Chuỗi hệ quả hoàn thành:** Hoàn thành task cuối cùng của stage tự động mở stage kế tiếp (`ACTIVE` nếu không chặn tiền, hoặc `WAITING_PAYMENT` nếu có `blocking_milestone_id` chưa `PAID_CONFIRMED`). Hoàn thành task có `triggers_milestone_id` tự động chuyển đợt thu sang `AWAITING_PAYMENT` và ghi nhận `TASK_STATUS_CHANGED`. Stage có `requires_approval = True` chuyển sang `WAITING_APPROVAL` và sinh yêu cầu duyệt `STAGE_GATE`.
- **Hàng chờ & Quyết định Phê duyệt:** `GET /approvals` lọc chính xác theo thẩm quyền người xem (Case Manager duyệt TASK, Supervisor duyệt STAGE_GATE, Quản lý/Giám đốc duyệt STAGE_GATE khi không có Supervisor và duyệt CHANGE_REQUEST). Chặn tự duyệt 403 `APPROVAL_NOT_ALLOWED`. Chặn người không đủ thẩm quyền 403. Bắt buộc nhận xét khi `REJECT` (422 nếu thiếu). Duyệt TASK chuyển task sang `COMPLETED`, từ chối trả về `IN_PROGRESS`. Duyệt STAGE_GATE chuyển stage sang `COMPLETED` và mở stage kế. Ghi audit log `APPROVAL_DECIDED`.
- **Yêu cầu bổ sung quy trình (DEC-07):** Vụ việc `STRICT` chặn 403 `STRICT_GOVERNANCE_VIOLATION`. Vụ việc `FLEXIBLE` tạo yêu cầu 201 `PENDING` kèm `approval_requests`, chưa sinh task. Khi duyệt thành công, tự động sinh đúng 1 task ad-hoc (`is_ad_hoc = True`, liên kết `change_request_id`).
- **Phân công & Thu hồi quyền tức thì:** `PUT /cases/{id}/assignments` kiểm tra đúng 1 `CASE_MANAGER`, tối đa 1 `SUPERVISOR` (sai trả 422). Chặn gỡ người còn task dở dang 409 `ASSIGNEE_HAS_OPEN_TASKS`. Đồng bộ quan hệ `:ASSIGNED_TO` trên Neo4j ngay trong request, thu hồi quyền truy cập tức thì ở request kế tiếp.
- **Vòng đời vụ việc:** `INITIALIZING -> ACTIVE` yêu cầu đủ 1 Case Manager và ≥ 1 Executor (thiếu trả 422). `PAUSED` và `TERMINATED` bắt buộc có lý do (422 nếu thiếu). `TERMINATED` tự động huỷ các đợt thu chưa thu sang `CANCELLED`, giữ nguyên đợt đã `PAID_CONFIRMED`.
- **Việc của tôi & Bình luận:** `GET /me/tasks` trả đúng các task được giao cho người xem trên các vụ việc còn quyền, hỗ trợ lọc `due=overdue|today|week` theo múi giờ Việt Nam (UTC+7), thống kê đúng `summary` ({todo, in_progress, waiting_approval, overdue}). Bình luận kiểm tra độ dài 1–5000 ký tự (422 nếu rỗng hoặc quá dài), sắp xếp mới nhất trước.

## File đã tạo/sửa
- `backend/app/schemas/cases.py`: Pydantic schemas cho phân công, vòng đời, tác vụ, bình luận, change request, phê duyệt.
- `backend/app/services/cases.py`: Nghiệp vụ vụ việc, Need-to-know guard, danh sách theo đồ thị, chi tiết, vòng đời, phân công, đồng bộ Neo4j, stage list.
- `backend/app/services/case_tasks.py`: Luồng tác vụ, kiểm tra phụ thuộc, khoá stage/vụ việc, chuỗi hệ quả hoàn thành task/stage, bình luận.
- `backend/app/services/change_requests.py`: Quản lý yêu cầu bổ sung quy trình (DEC-07), kiểm soát STRICT/FLEXIBLE.
- `backend/app/services/approvals.py`: Thẩm quyền phê duyệt đa tầng, hàng chờ duyệt, quyết định phê duyệt và chuỗi tác động.
- `backend/app/api/cases.py`: Endpoints API `/api/v1/cases` (danh sách, chi tiết, status, stages, assignments, tasks, status, comments, change-requests).
- `backend/app/api/approvals.py`: Endpoints API `/api/v1/approvals` (hàng chờ duyệt, quyết định duyệt).
- `backend/app/api/me.py`: Endpoint API `/api/v1/me/tasks` (việc của tôi, lọc deadline theo giờ Việt Nam, thống kê summary).
- `backend/app/main.py`: Gắn các router cases, approvals, me vào API v1; cấu hình middleware xử lý CSRF cookie tương thích testserver và bộ nạp StrUUIDLoader cho psycopg.

## Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-027-vu-viec-task-phe-duyet-backend/verify.sh
........................................................................ [ 78%]
....................                                                     [100%]
92 passed in 1795.14s (0:29:55)

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không. Mọi tiêu chí nghiệm thu và ràng buộc bất biến đã được tuân thủ nghiêm ngặt, toàn bộ 92 test cases trong hệ thống đều xanh.
