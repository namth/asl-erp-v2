# TASK-021 — Backend trình thiết kế quy trình, phiên bản & ngày nghỉ (TSK-06)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (bất biến #1 — quy trình có kiểm soát)
> **Phụ thuộc:** TASK-008 (đã merge). Code chạy ở máy chính khi có slot; test viết được ngay theo hợp đồng.

## 1. Mục tiêu
API cho Quản trị viên quản lý template quy trình có phiên bản, chế độ `STRICT`/`FLEXIBLE`, phát hành có kiểm tra đồ thị phụ thuộc, trường động của loại vụ việc và ngày nghỉ lễ. Template đã phát hành bất biến; vụ việc đang chạy giữ phiên bản cũ (TC-WF-04).

## 2. Tài liệu bắt buộc đọc
- `CONTEXT.md` mục 3 (#1, #6); `docs/14-decisions.md` DEC-07
- `docs/07-api-contracts.md` **§3.3a**, §1.2, §1.3
- `docs/06-database-schema.md` bảng `matter_types`, `workflow_templates`, `workflow_template_versions`, `template_stages`, `template_tasks`, `template_task_dependencies`, `holidays`, `cases`
- `docs/13-test-cases-and-qa.md` TC-WF-04 (và các TC-WF khác chạm phiên bản)
- Code có sẵn: `backend/app/core/security.py` (`get_current_user`, `verify_csrf`), `backend/app/services/audit.py`; cách dựng user/test trong `backend/tests/test_auth.py`

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `backend/app/api/workflows.py`, `backend/app/api/settings_holidays.py`
- `backend/app/services/workflows.py`, `backend/app/services/workflow_graph.py`
- `backend/app/schemas/workflows.py`
- `backend/app/main.py` (gắn router)

**Người viết test:** `backend/tests/test_workflow_builder.py` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; `backend/tests/` (trừ file của task); `backend/app/guards/`, `backend/app/services/audit.py`, `backend/alembic/`; `frontend/`, `docs/`, `qlcvaslgate-old/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- Quyền: ghi chỉ `ADMIN` (khác → 403 `FORBIDDEN_ROLE`), đọc `ADMIN`, `MANAGER`. Route ghi qua `verify_csrf`.
- `PUT /workflows/versions/{id}` chạy trong **một transaction**: xoá stage/task/phụ thuộc cũ của bản nháp rồi chèn lại từ cây; ánh xạ `key` → UUID mới để nối `depends_on`; `key` **không lưu DB** (không đổi schema). Phản hồi là cây vừa lưu theo quy tắc `key` của `GET` dưới đây; thứ tự task trong stage giữ đúng thứ tự gửi lên (lưu qua thứ tự chèn/`created_at` hoặc một cột thứ tự đã có — cần cột mới thì ghi `report.md` mục câu hỏi, không tự sửa schema).
- `publish`: khoá dòng phiên bản (`FOR UPDATE`); kiểm theo §3.3a; tìm chu trình bằng DFS/Kahn trong `services/workflow_graph.py` (hàm thuần, test được không cần DB); đặt `PUBLISHED`, `published_by`, `published_at`; bản `PUBLISHED` cũ cùng template → `RETIRED`; audit `WORKFLOW_PUBLISHED` (`after_state`: `version_no`, số stage/task). Phát hành 2 lần → `409 VERSION_NOT_DRAFT`.
- `POST /workflows/templates/{id}/versions`: sao chép sâu bản `PUBLISHED` mới nhất (stage, task, phụ thuộc) sang `DRAFT` `version_no + 1`.
- `GET /workflows/versions/{id}`: `key` trả về ổn định (vd `s{order}` cho stage, `t{stage_order}_{task_order}` cho task) để client nối phụ thuộc.
- Trường động: kiểm theo §3.3a, lưu `matter_types.custom_fields_schema`; audit `CUSTOM_FIELDS_UPDATED`.
- Ngày nghỉ: `PUT /settings/holidays` thay toàn bộ ngày của `year` (ngày ngoài năm → 422, trùng → 422); `GET` trả danh sách theo năm.
- Bất biến: không endpoint nào sửa được stage/task của bản `PUBLISHED`/`RETIRED`; vụ việc tham chiếu `template_version_id` cũ không bị ảnh hưởng khi phát hành bản mới.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test — mỗi dòng ≥ 1 test)
- [ ] DoD TSK-06: tạo template 3 stage, 6 task, 2 trường động ở **mỗi** chế độ; lưu → `GET` trả đúng cây (thứ tự, phụ thuộc, các trường task).
- [ ] TC-WF-04: phát hành bản 1; tạo vụ việc (INSERT thẳng `cases` với `template_version_id` bản 1); tạo bản 2, sửa, phát hành → bản 1 `RETIRED`, vụ việc vẫn trỏ bản 1, stage/task của bản 1 không đổi.
- [ ] `publish` chặn: chu trình (`DEPENDENCY_CYCLE` có `details.cycle`), phụ thuộc sang stage sau (`INVALID_DEPENDENCY`), stage rỗng, bản không có stage; phát hành lại bản đã phát hành → `VERSION_NOT_DRAFT`.
- [ ] `PUT` chặn mọi luật §3.3a bằng 422 `details.fields`; `PUT` vào bản `PUBLISHED` → `VERSION_NOT_DRAFT`; lỗi giữa chừng không để lại dữ liệu nửa vời (rollback).
- [ ] `ACTIVE_TEMPLATE_EXISTS`, `DRAFT_VERSION_EXISTS` đúng lúc; bản mới sao chép đủ cây của bản phát hành.
- [ ] `services/workflow_graph.py`: test thuần cho không chu trình, chu trình 2/3 nút, tự phụ thuộc, phụ thuộc sang stage sau.
- [ ] Trường động và ngày nghỉ theo §3.3a/§4; audit `WORKFLOW_PUBLISHED`, `CUSTOM_FIELDS_UPDATED`.
- [ ] Quyền: MANAGER đọc được, ghi → 403; ATTORNEY đọc → 403; thiếu CSRF → 403. Toàn bộ `backend/tests` vẫn xanh.

## 6. Ràng buộc & bẫy cần tránh
- Không sửa test; không nhánh riêng cho test; không mock DB trong code sản phẩm.
- Test tạo loại vụ việc riêng (mã 3–4 chữ in hoa ngẫu nhiên), không đụng dữ liệu seed; ngày nghỉ test dùng năm xa (vd 2099) để không lẫn dữ liệu thật.
- **Người viết test:** máy thợ không có DB/Redis → chỉ cần `python3 -m py_compile` qua; trưởng phòng chạy kiểm đỏ ở máy chính. `verify.sh` theo mẫu TASK-008: `export ACCESS_TOKEN_EXPIRE_MINUTES=30`, `export REDIS_URL=redis://127.0.0.1:6379/10`, `export PYTHONPATH=.`, `.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider`. Không `|| true`.
- Chạy test chỉ qua `python3 scripts/handoff.py verify <ID>`. Ghi file bằng công cụ ghi file; `mkdir`, `|`, `xargs`, `npx`, `.venv/bin/python` bị từ chối.
