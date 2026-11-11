# TASK-019 — Backend pipeline cơ hội & chuyển đổi 1-chạm (TSK-05)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (tiền, sinh vụ việc, đồng thời)
> **Phụ thuộc:** TASK-018 (router/schemas CRM) — code bắt đầu sau khi TASK-018 merge. Test viết được ngay theo hợp đồng.

## 1. Mục tiêu
API pipeline cơ hội theo máy trạng thái và chuyển đổi 1-chạm cơ hội `WON` thành vụ việc `INITIALIZING` đầy đủ (mã vụ việc, phiên bản template, stage/task, lộ trình đợt thu, chính sách hoa hồng mặc định, người mang khách về) — an toàn khi gửi lặp và khi nhiều người chuyển đổi cùng lúc.

## 2. Tài liệu bắt buộc đọc
- `CONTEXT.md` mục 3 (#1, #4); `docs/14-decisions.md` DEC-01, DEC-06, DEC-07
- `docs/07-api-contracts.md` §1.1 (`Idempotency-Key`), §1.3, §2 (dòng Cơ hội), §3.3 (`POST /crm/opportunities/{id}/convert`)
- `docs/12-business-rules.md` §1.1 (máy trạng thái cơ hội) và mục vụ việc `INITIALIZING`
- `docs/06-database-schema.md` bảng `opportunities`, `matter_types` (cột `default_*_rate` mới), `workflow_template_versions`, `template_stages`, `template_tasks`, `template_task_dependencies`, `cases`, `case_code_sequences`, `case_stages`, `case_tasks`, `case_task_dependencies`, `billing_milestones`, `commission_policies`
- `docs/13-test-cases-and-qa.md` TC-CRM-02, TC-CRM-05; frontend gọi ở `frontend/src/hooks/use-crm.ts`

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `backend/app/api/crm_opportunities.py`, `backend/app/services/opportunities.py`, `backend/app/services/case_factory.py`
- `backend/app/schemas/crm.py` (thêm schema cơ hội)
- `backend/alembic/versions/003_matter_type_commission_defaults.sql` và revision Alembic `backend/alembic/versions/0003_matter_type_commission_defaults.py` chạy file đó
- `backend/app/main.py` (gắn router)

**Người viết test:** `backend/tests/test_opportunity_conversion.py` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; `backend/tests/` (trừ file của task); `backend/app/guards/`, `backend/app/services/audit.py`; `frontend/`, `docs/`, `qlcvaslgate-old/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- Quyền: `MANAGER`, `ATTORNEY`; khác → 403 `FORBIDDEN_ROLE`. Ghi qua `verify_csrf`. `originator_id` mặc định = người tạo, Quản lý được chọn người khác (DEC-01: vai trò bất kỳ).
- `PATCH /crm/opportunities/{id}` `{stage?, lost_reason?, expected_value?, probability_pct?}`: chỉ chuyển theo §1.1, sai → 409 `INVALID_STATE_TRANSITION`; `LOST` thiếu `lost_reason` → 422; `WON`/`LOST` là trạng thái cuối (không sửa `stage` nữa). Tiền là chuỗi thập phân ở API, `Decimal` trong code.
- **Chuyển đổi** — header `Idempotency-Key` bắt buộc (thiếu → 422). Trong **một transaction**:
  1. Khoá dòng cơ hội (`FOR UPDATE`); chưa `WON` → 409 `OPPORTUNITY_NOT_WON`; đã có `converted_case_id` → 409 `OPPORTUNITY_ALREADY_CONVERTED`.
  2. Tìm phiên bản template `PUBLISHED` mới nhất của `matter_type_id` → không có → 409 `NO_PUBLISHED_TEMPLATE`.
  3. Tổng `milestones.amount` > `contract_value` → 422 `MILESTONES_EXCEED_CONTRACT`.
  4. Sinh `case_code` `ASL-{YYYY}-{matter_types.code}-{NNNN}` từ `case_code_sequences` (khoá dòng theo năm + mã loại, tăng 1) — không trùng dưới tải song song.
  5. Tạo `cases` (`INITIALIZING`, `template_version_id`, `workflow_mode` của template, `client_id`, `originator_id`, `department_id` của loại vụ việc), sao chép stage/task/phụ thuộc từ template (stage đầu `ACTIVE`, còn lại `LOCKED`), tạo `billing_milestones` (`PENDING`), `commission_policies` từ `matter_types.default_*`, gắn `opportunities.converted_case_id`, outbox sự kiện tạo vụ việc, audit `OPPORTUNITY_CONVERTED`.
  6. Phản hồi đúng mẫu §3.3. Lưu phản hồi theo `(user_id, Idempotency-Key)` trong Redis 24 giờ; gửi lại cùng khoá → trả **đúng phản hồi cũ** (cùng `case_id`), không tạo thêm. Cùng khoá nhưng body khác → 409 `IDEMPOTENCY_KEY_REUSED`.
- `003_matter_type_commission_defaults.sql`: `ALTER TABLE matter_types ADD COLUMN IF NOT EXISTS …` theo `docs/06` (4 cột + CHECK tổng ≤ 100), chạy lặp được.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test — mỗi dòng ≥ 1 test)
- [ ] Máy trạng thái: các chuyển hợp lệ thành công; `NEW_LEAD → WON` → 409; `LOST` thiếu lý do → 422; sửa `stage` sau `WON` → 409.
- [ ] TC-CRM-02: chuyển đổi `WON` → vụ việc `INITIALIZING`, mã khớp `^ASL-\d{4}-[A-Z]{2,4}-\d{4}$`, đúng `template_version_id` bản `PUBLISHED` mới nhất, số stage/task khớp template, stage đầu `ACTIVE`, có `billing_milestones` đúng số tiền (so `Decimal`), `commission_policies` bằng mặc định của loại vụ việc, `originator_id` đúng.
- [ ] TC-CRM-05: chưa `WON` → 409 `OPPORTUNITY_NOT_WON`; gửi 2 lần cùng `Idempotency-Key` → cùng `case_id`, chỉ 1 vụ việc trong DB; lần 3 khoá khác → 409 `OPPORTUNITY_ALREADY_CONVERTED`; thiếu header → 422.
- [ ] Tổng đợt thu > giá trị hợp đồng → 422 `MILESTONES_EXCEED_CONTRACT`, không tạo gì; không có template `PUBLISHED` → 409 `NO_PUBLISHED_TEMPLATE`.
- [ ] 50 chuyển đổi song song (50 cơ hội `WON` khác nhau, cùng loại vụ việc) → 50 vụ việc, 50 mã khác nhau, liên tiếp.
- [ ] Quyền: ACCOUNTANT/ADMIN → 403; thiếu CSRF → 403. Toàn bộ `backend/tests` vẫn xanh.

## 6. Ràng buộc & bẫy cần tránh
- Không `float` cho tiền. Không tạo task/stage ngoài template (bất biến #1).
- Lỗi ở bất kỳ bước nào → rollback toàn bộ, không để lại vụ việc dở dang hay số thứ tự bị nhảy.
- Test tạo dữ liệu riêng (loại vụ việc mã ngẫu nhiên 3–4 chữ in hoa, template + phiên bản `PUBLISHED` tự INSERT trong fixture), không xoá dữ liệu seed; áp `003_*.sql` trong `verify.sh` qua `backend/tests/apply_sql.py` nếu file đã có.
- **Người viết test:** máy thợ không có DB/Redis → chỉ cần `python3 -m py_compile` qua; trưởng phòng chạy kiểm đỏ ở máy chính. `verify.sh` theo mẫu TASK-008, Redis DB riêng `export REDIS_URL=redis://127.0.0.1:6379/11`, đặt `DATA_ENCRYPTION_MASTER_KEY` khoá test cố định.
- Chạy test chỉ qua `python3 scripts/handoff.py verify <ID>`. Ghi file bằng công cụ ghi file; `mkdir`, `|`, `xargs`, `npx`, `.venv/bin/python` bị từ chối.
