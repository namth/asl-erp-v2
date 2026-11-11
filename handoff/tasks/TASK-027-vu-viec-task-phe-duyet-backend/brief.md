# TASK-027 — Backend vụ việc, stage, task, phân công & phê duyệt (TSK-07, TSK-08, TSK-19)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (Need-to-know, bất biến #1, khoá tiền)
> **Phụ thuộc:** TASK-008 (đã merge), TASK-021 (workflow) và TASK-019 (sinh vụ việc) chỉ cần khi chạy thật; test tự dựng vụ việc bằng INSERT. Code chạy ở máy chính khi có slot.

## 1. Mục tiêu
API không gian vụ việc: danh sách theo phạm vi, chi tiết, vòng đời, stage (khoá chờ thu tiền, cổng duyệt), phân công, task (máy trạng thái, phụ thuộc), bình luận, yêu cầu bổ sung (DEC-07), hàng chờ duyệt và quyết định duyệt, việc của tôi.

## 2. Tài liệu bắt buộc đọc
- `CONTEXT.md` mục 3 (#1, #2, #6); `docs/14-decisions.md` DEC-04, DEC-05, DEC-07
- `docs/07-api-contracts.md` **§3.4** (bảng endpoint + mẫu `GET /cases/{id}`, `PATCH …/status`, `POST …/change-requests`, `POST /approvals/{id}/decide`, `GET /me/tasks`), §1.3
- `docs/12-business-rules.md` §1.2–1.4, §2.1–2.6
- `docs/06-database-schema.md` bảng `cases`, `case_assignments`, `case_stages`, `case_tasks`, `case_task_dependencies`, `case_task_comments`, `approval_requests`, `workflow_change_requests`, `billing_milestones`; §3 (đồ thị) và bảng chính sách `06` §3.3
- `docs/13-test-cases-and-qa.md` các TC-WF-*, TC-SEC-01/02/10–13 liên quan vụ việc
- Code có sẵn: `backend/app/guards/need_to_know.py`, `backend/app/guards/access_policy.py`, `backend/app/core/security.py`, `backend/app/services/audit.py`

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `backend/app/api/cases.py`, `backend/app/api/approvals.py`, `backend/app/api/me.py`
- `backend/app/services/cases.py`, `backend/app/services/case_tasks.py`, `backend/app/services/approvals.py`, `backend/app/services/change_requests.py`
- `backend/app/schemas/cases.py`
- `backend/app/main.py` (gắn router)

**Người viết test:** `backend/tests/test_cases_workspace.py`, `backend/tests/test_task_flow.py`, `backend/tests/test_approvals.py` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; `backend/tests/` (trừ file của task); `backend/app/guards/`, `backend/app/services/audit.py`, `backend/alembic/`; `frontend/`, `docs/`, `qlcvaslgate-old/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- Mọi route `/cases/{id}/…` gọi `verify_need_to_know(user, case_id, scope)` (phạm vi ghi trong bảng §3.4); không thuộc phạm vi → 403 `NEED_TO_KNOW_DENIED` và audit `ACCESS_DENIED`. Danh sách `GET /cases` chỉ trả vụ việc người xem vượt guard phạm vi `progress` (lọc ở truy vấn/đồ thị, không lọc sau phân trang).
- Đổi trạng thái task trong **một transaction**, khoá dòng task (`FOR UPDATE`): kiểm vụ việc `PAUSED` (`CASE_PAUSED`), `is_legacy` (`LEGACY_CASE_READ_ONLY`), stage khác `ACTIVE` (`STAGE_LOCKED`), phụ thuộc (`PREREQUISITE_TASK_NOT_COMPLETED`, `details.blocked_by`), máy trạng thái (`INVALID_STATE_TRANSITION`). `IN_PROGRESS → WAITING_APPROVAL` tạo `approval_requests` (type TASK). Task `COMPLETED`: nếu mọi task của stage xong → stage `COMPLETED` hoặc `WAITING_APPROVAL` (tạo approval STAGE_GATE); stage kế: `blocking_milestone` chưa `PAID_CONFIRMED` → `WAITING_PAYMENT`, ngược lại `ACTIVE`; task có `triggers_milestone_order` → đợt thu đó `AWAITING_PAYMENT`. Audit `TASK_STATUS_CHANGED`.
- `POST /approvals/{id}/decide`: kiểm người duyệt theo `12` §2.2 (`APPROVAL_NOT_ALLOWED` khi không đủ thẩm quyền hoặc tự duyệt); `REJECT` bắt buộc `comment`; TASK duyệt → `COMPLETED` (chạy đúng chuỗi hệ quả trên), trả về → `IN_PROGRESS`; STAGE_GATE duyệt → stage `COMPLETED` + mở stage kế; CHANGE_REQUEST duyệt → tạo task `is_ad_hoc = true` liên kết yêu cầu. Audit `APPROVAL_DECIDED`.
- `POST /cases/{id}/change-requests`: `STRICT` → 403 `STRICT_GOVERNANCE_VIOLATION`; `FLEXIBLE` → 201 `PENDING` + approval CHANGE_REQUEST cho Quản lý phụ trách. Không endpoint nào khác tạo task/stage trong vụ việc đang chạy.
- `PUT /cases/{id}/assignments`: thay toàn bộ, đúng 1 `CASE_MANAGER`, ≤ 1 `SUPERVISOR`; gỡ người còn task dở → 409 `ASSIGNEE_HAS_OPEN_TASKS`; cập nhật Neo4j `:ASSIGNED_TO` **ngay trong request** + outbox; audit.
- `POST /cases/{id}/status`: theo `12` §1.2 (`INITIALIZING → ACTIVE` cần CASE_MANAGER + ≥ 1 EXECUTOR; `TERMINATED` huỷ đợt thu chưa `PAID_CONFIRMED`).
- `GET /me/tasks`: chỉ task `assigned_to = người xem` trên vụ việc người xem còn quyền; `due=overdue|today|week` theo giờ Việt Nam.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test — mỗi dòng ≥ 1 test)
- [ ] Need-to-know: luật sư không được phân công → 403 ở `GET /cases/{id}` và mọi route con, có audit `ACCESS_DENIED`; Trưởng phòng phòng khác → 403; Giám đốc xem được; `GET /cases` không trả vụ việc ngoài phạm vi (kể cả khi tìm đúng mã); ACCOUNTANT chỉ `?view=progress`.
- [ ] Task: `TODO → IN_PROGRESS` bị chặn khi phụ thuộc chưa xong (422, `blocked_by`); stage `LOCKED`/`WAITING_PAYMENT` → 409 `STAGE_LOCKED`; vụ việc `PAUSED` → 409 `CASE_PAUSED`; legacy → 409; nhảy `TODO → COMPLETED` → 409 `INVALID_STATE_TRANSITION`.
- [ ] Chuỗi hệ quả: hoàn thành task cuối của stage → stage kế `ACTIVE` (không chặn tiền) hoặc `WAITING_PAYMENT` (có chặn); task kích hoạt → đợt thu `AWAITING_PAYMENT`; stage `requires_approval` → `WAITING_APPROVAL` + approval STAGE_GATE.
- [ ] Phê duyệt: tự duyệt → 403 `APPROVAL_NOT_ALLOWED`; người không đủ thẩm quyền → 403; REJECT thiếu comment → 422; duyệt TASK → `COMPLETED`; trả về → `IN_PROGRESS`; `GET /approvals` chỉ trả mục người xem được duyệt.
- [ ] DEC-07: `STRICT` → 403 `STRICT_GOVERNANCE_VIOLATION`; `FLEXIBLE` → 201 PENDING, chưa có task; duyệt → có đúng 1 task `is_ad_hoc = true`.
- [ ] Phân công: 0 hoặc 2 CASE_MANAGER → 422; gỡ người còn task dở → 409; gỡ phân công → luật sư đó bị 403 **ngay request kế tiếp**.
- [ ] Vòng đời: `INITIALIZING → ACTIVE` thiếu nhân sự → 409/422; `TERMINATED` thiếu lý do → 422, có lý do → đợt thu chưa thu thành `CANCELLED`.
- [ ] `GET /me/tasks` đúng người, đúng `summary`, lọc `due`. Bình luận 1–5000 ký tự. Toàn bộ `backend/tests` vẫn xanh.

## 6. Ràng buộc & bẫy cần tránh
- Không sửa test; không nhánh riêng cho test; không mock DB/Neo4j trong code sản phẩm. `audit_logs` chỉ INSERT qua `log_audit_event`.
- Không endpoint tạo task/stage trực tiếp (bất biến #1).
- **Người viết test:**
  - Máy thợ không có DB/Redis → chỉ cần `python3 -m py_compile` qua; trưởng phòng chạy kiểm đỏ ở máy chính.
  - **Cấp phiên trong test bằng access token tự ký** (ADMIN/MANAGER/ACCOUNTANT bắt buộc 2FA nên không đăng nhập bằng mật khẩu được): `jwt.encode({"sub": user_id, "jti": uuid4, "iat": now, "exp": now+1800, "typ": "access"}, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)`, đặt cookie `access_token` và `csrf_token` (`domain="testserver"`), gửi header `X-CSRF-Token` cùng giá trị.
  - Dữ liệu dựng bằng INSERT trong fixture: phòng ban, loại vụ việc (mã **chỉ chữ in hoa** 3–4 ký tự, vd `"T" + 3 chữ ngẫu nhiên`), khách hàng `FOREIGN`, vụ việc đủ cột NOT NULL (`client_id`, `matter_type_id`, `department_id`, `workflow_mode`, `contract_value`, `status`), stage/task/phụ thuộc/đợt thu; đồng bộ cạnh Neo4j `:ASSIGNED_TO`/`:LEADS` cho người dùng test (gắn email `tsk07-…@asllaw.vn`).
  - `verify.sh` theo mẫu TASK-008: `export ACCESS_TOKEN_EXPIRE_MINUTES=30`, `export REDIS_URL=redis://127.0.0.1:6379/9`, `export PYTHONPATH=.`, `.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider`. Không `|| true`.
- Chạy test chỉ qua `python3 scripts/handoff.py verify <ID>`. Ghi file bằng công cụ ghi file (tự tạo thư mục cha); `mkdir`, `;`, `||`, `|`, `xargs` bị từ chối; không tìm file ngoài dự án.
