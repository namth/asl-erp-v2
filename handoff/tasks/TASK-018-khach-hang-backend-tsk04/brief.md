# TASK-018 — Backend khách hàng & hồ sơ chi tiết (TSK-04)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (dữ liệu cá nhân CCCD, phân quyền)
> **Phụ thuộc:** TASK-008 (đã merge), TASK-011 (`backend/app/core/crypto.py` — code bắt đầu sau khi TASK-011 merge). Test viết được ngay theo hợp đồng.

## 1. Mục tiêu
API khách hàng cho màn hình CRM đã có (SCR-03, SCR-04): tạo/sửa/tra cứu khách hàng doanh nghiệp, cá nhân, nước ngoài; chặn trùng MST/CCCD; CCCD mã hoá và che; dòng thời gian tương tác; cảnh báo xung đột lợi ích.

## 2. Tài liệu bắt buộc đọc
- `CONTEXT.md` mục 3 (#2 Need-to-know, #6 audit); `docs/14-decisions.md` DEC-01, DEC-03, DEC-04
- `docs/07-api-contracts.md` §1.2, §1.3, §2 (dòng Khách hàng, Xung đột lợi ích), §3.3 (`POST /crm/clients`)
- `docs/06-database-schema.md` bảng `clients`, `client_interactions`, `case_parties`, `cases`, `notifications`
- `docs/13-test-cases-and-qa.md` TC-CRM-01, TC-CRM-03, TC-CRM-04
- Code có sẵn: `backend/app/guards/conflict_check.py`, `backend/app/guards/need_to_know.py`, `backend/app/core/security.py`, `backend/app/services/audit.py`; frontend gọi API này ở `frontend/src/hooks/use-crm.ts` (khớp tên tham số/trường)

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `backend/app/api/crm_clients.py`
- `backend/app/services/clients.py`, `backend/app/services/text_normalize.py`
- `backend/app/schemas/crm.py`
- `backend/app/main.py` (gắn router)

**Người viết test:** `backend/tests/test_crm_clients.py` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; `backend/tests/` (trừ file của task); `backend/app/guards/`, `backend/app/core/crypto.py`, `backend/app/services/audit.py`, `backend/alembic/`; `frontend/`, `docs/`, `qlcvaslgate-old/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- Quyền: `MANAGER`, `ATTORNEY` đọc + ghi; `ACCOUNTANT` chỉ đọc danh sách/chi tiết (không thấy `interactions`); `ADMIN` → 403 `FORBIDDEN_ROLE` (Quản trị viên không đọc hồ sơ thân chủ). Route ghi qua `verify_csrf`.
- `GET /crm/clients?q=&category_group=&page=&limit=20`: `q` tìm theo tên (không phân biệt hoa thường, không dấu) hoặc MST; `meta` phân trang.
- `POST /crm/clients`: `ENTERPRISE` bắt buộc `tax_code` khớp `^\d{10}(-\d{3})?$`; `INDIVIDUAL` bắt buộc `identity_no` (CCCD 12 số hoặc CMND 9 số, bỏ mọi khoảng trắng/dấu chấm trước khi kiểm); `FOREIGN` không bắt buộc cả hai. Sai → 422.
  - CCCD: lưu `identity_no_enc` (AES-GCM qua `core/crypto.py`) và `identity_no_hash` = HMAC-SHA256 (khoá dẫn xuất từ `DATA_ENCRYPTION_MASTER_KEY`) của chuỗi đã chuẩn hoá. Trùng hash → 409 `DUPLICATE_IDENTITY_NO`; trùng MST → 409 `DUPLICATE_TAX_CODE`. API chỉ trả `identity_no_masked` = `"********" + 4 số cuối`, không bao giờ trả bản đầy đủ.
  - `normalized_name` = bỏ dấu tiếng Việt (đ→d), chữ thường, gộp khoảng trắng, bỏ dấu câu — dùng chung cho tìm kiếm và kiểm xung đột (`services/text_normalize.py`).
  - Xung đột lợi ích: gọi `check_conflict_of_interest`; có trùng với bên đối tụng của vụ việc đang hiệu lực → 201 kèm `warnings: [{"code":"CONFLICT_OF_INTEREST","case_codes":[…]}]`, ghi 1 dòng `notifications` cho mỗi Trưởng phòng của phòng ban vụ việc đó, audit `CONFLICT_OF_INTEREST_WARNING`.
  - Audit `CLIENT_CREATED` (không chứa CCCD bản rõ).
- `GET /crm/clients/{id}`: thông tin + `cases`: chỉ vụ việc người xem vượt qua `verify_need_to_know` (phạm vi `progress`); không có quyền với vụ việc nào → `cases: []`.
- `PATCH /crm/clients/{id}`: sửa thông tin liên hệ, `category_group`; đổi `tax_code`/`identity_no` áp lại kiểm trùng; audit `CLIENT_UPDATED` với `before_state`/`after_state` đã che CCCD.
- `GET/POST /crm/clients/{id}/interactions`: `{interaction_type, summary, occurred_at}`; danh sách mới nhất trước.
- `POST /crm/conflict-check` `{name, tax_code?, identity_no?}` → `{conflicts: [{case_code, party_name, party_role}]}`, không tạo dữ liệu.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test — mỗi dòng ≥ 1 test)
- [ ] TC-CRM-01: 2 doanh nghiệp cùng MST → bản 2 `409 DUPLICATE_TAX_CODE`; MST sai định dạng → 422.
- [ ] TC-CRM-03: 2 cá nhân cùng CCCD (lần 2 có khoảng trắng/dấu chấm) → `409 DUPLICATE_IDENTITY_NO`; GET trả `********1234`; DB: `identity_no_enc` không chứa chuỗi số bản rõ, `identity_no_hash` không phải SHA-256 trần của số (phải dùng khoá); không có trường nào trong mọi phản hồi chứa số đầy đủ.
- [ ] TC-CRM-04: vụ việc `ACTIVE` có bên đối tụng "Công ty TNHH Minh Phát"; tạo khách hàng "CÔNG TY TNHH MINH PHÁT" → 201 + `warnings[CONFLICT_OF_INTEREST]` có đúng `case_code`; có `notifications` cho Trưởng phòng; có audit.
- [ ] Tìm kiếm `q` không dấu/không phân biệt hoa thường; phân trang `meta` đúng.
- [ ] Quyền: ADMIN → 403 cả đọc; ACCOUNTANT đọc được, ghi → 403; thiếu CSRF → 403.
- [ ] Chi tiết khách hàng chỉ liệt kê vụ việc người xem có quyền (một luật sư không được phân công không thấy vụ việc đó).
- [ ] Tương tác: thêm và liệt kê mới nhất trước; ACCOUNTANT không đọc được tương tác.
- [ ] Toàn bộ `backend/tests` vẫn xanh.

## 6. Ràng buộc & bẫy cần tránh
- Không sửa test; không nhánh riêng cho test; không mock DB/Neo4j trong code sản phẩm.
- Không log/không đưa CCCD bản rõ vào audit, thông báo hay thông điệp lỗi.
- Test tạo dữ liệu gắn tiền tố riêng (`tsk04-…`, tên công ty có hậu tố ngẫu nhiên), không xoá dữ liệu seed.
- **Người viết test:** máy thợ không có DB/Redis → chỉ cần `python3 -m py_compile` qua; trưởng phòng chạy kiểm đỏ ở máy chính. `verify.sh` theo mẫu TASK-008 nhưng dùng Redis DB riêng `export REDIS_URL=redis://127.0.0.1:6379/12` và đặt `DATA_ENCRYPTION_MASTER_KEY` bằng một khoá test cố định. Dữ liệu vụ việc/bên đối tụng cho test xung đột: tự INSERT thẳng vào `cases`, `case_parties` (và Neo4j nếu cần) trong fixture.
- Chạy test chỉ qua `python3 scripts/handoff.py verify <ID>`. Ghi file bằng công cụ ghi file; `mkdir`, `|`, `xargs`, `npx`, `.venv/bin/python` bị từ chối.
