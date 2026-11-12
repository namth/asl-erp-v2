# TASK-039 — Backend danh sách & tạo cơ hội, đồng bộ Case sang Neo4j khi chuyển đổi

> Người giao: Claude (Trưởng phòng) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (phân quyền theo vai trò, đồ thị Need-to-know)

## 1. Mục tiêu
1. Thêm `GET /api/v1/crm/opportunities` và `POST /api/v1/crm/opportunities` đúng `docs/07-api-contracts.md` §3.3 (hai mục mới ngay trước `convert`). Trang Cơ hội ở FE (`frontend/src/hooks/use-crm.ts`) đang kẹt vì chưa có endpoint này.
2. Sửa lỗi: chuyển đổi cơ hội → vụ việc **không tạo nút `Case`** trong Neo4j, nên phân công/mở vụ việc mới bị `NEED_TO_KNOW_DENIED` cho tới khi chạy `rebuild_graph`. Theo đoạn Neo4j trong mục `convert` của `docs/07` §3.3.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` §1.2 (phong bì, `meta`), §3.3 (GET/POST/convert)
- `docs/12-business-rules.md` §1.1, `docs/14-decisions.md` DEC-01
- Code mẫu: `backend/app/api/crm_opportunities.py` (PATCH/convert, `require_opportunity_role`), `backend/app/services/opportunities.py`, `backend/app/services/clients.py` (danh sách khách hàng có `q` không dấu + `meta` — làm theo cùng cách; `backend/app/services/text_normalize.py`), `backend/app/services/audit.py` (`log_audit_event`)
- Đồ thị: `backend/app/services/case_factory.py` (bước 13 ghi outbox `CASE_CREATED`), `backend/app/services/graph_sync.py` (`process_outbox`), `backend/app/services/cases.py` ~dòng 476 (mẫu ghi Neo4j ngay trong request), `backend/app/scripts/rebuild_graph.py` mục D (dạng nút `Case`)

## 3. Phạm vi file
**Được tạo/sửa:**
- `backend/app/api/crm_opportunities.py`
- `backend/app/services/opportunities.py`
- `backend/app/schemas/crm.py`
- `backend/app/services/case_factory.py` (chỉ để thêm `department_id` vào payload outbox / trả về nếu cần)
- `backend/app/services/graph_sync.py`

**Test (đã viết, đã khoá):** `backend/tests/test_opportunities_list_create.py`, `verify.sh`.
**Không được sửa:** mọi file trong `tests.lock`; `docs/`; `frontend/`; migration.

## 4. Blueprint
- **GET:** tham số `stage`, `client_id`, `q`, `page` (≥1, mặc định 1), `limit` (1–100, mặc định 20) — sai → 422 `VALIDATION_ERROR` có `details.fields`. `ATTORNEY` lọc `originator_id = me`; `MANAGER` toàn hãng; vai trò khác 403 `FORBIDDEN_ROLE` (dùng lại `require_opportunity_role`). JOIN `clients` lấy `client_name`, LEFT JOIN `users` lấy `originator_name`. `ORDER BY updated_at DESC, id`. Đếm `total_records` bằng cùng điều kiện; `total_pages = ceil(total/limit)` (0 bản ghi → 0).
  Phản hồi `{"success": true, "data": [...], "meta": {...}}`. `expected_value` là chuỗi; thời gian ISO 8601.
- **`q`:** so khớp không dấu, không phân biệt hoa thường với `title` và tên khách hàng (khách hàng có `normalized_name`; title thì chuẩn hoá phía SQL bằng `unaccent` nếu DB có, nếu không thì chuẩn hoá Python bằng `text_normalize` — kiểm tra extension trước khi dùng, đừng giả định).
- **POST:** body `client_id`, `title`, `lead_source`, `expected_value` (Decimal ≥ 0, mặc định 0), `probability_pct` (0–100, tuỳ chọn), `originator_id` (tuỳ chọn). Trường `stage` gửi lên bị **bỏ qua** (không lỗi), luôn tạo `NEW_LEAD`. Quy tắc `originator_id` theo docs/07. `client_id` không tồn tại → 404 `NOT_FOUND`. `verify_csrf`. Ghi bản ghi + `log_audit_event(action="OPPORTUNITY_CREATED", entity_name="opportunities", …)` trong **cùng transaction**. Trả 201 cùng dạng phần tử của GET.
  Lưu ý route: `GET ""`/`POST ""` trên router `prefix="/crm/opportunities"`; đảm bảo không xung đột `/{opportunity_id}`.
- **Neo4j khi convert:** sau khi `convert_opportunity_to_case` trả về (đã commit), trong endpoint chạy Cypher idempotent:
  `MERGE (c:Case {id:$cid}) SET c.case_code=$code, c.status=$status WITH c MATCH (d:Department {id:$did}) MERGE (c)-[:IN_DEPARTMENT]->(d)` (`did` = `cases.department_id`; nếu NULL thì chỉ tạo nút). Phản hồi idempotent lấy từ cache Redis không cần ghi lại đồ thị.
  Lỗi Neo4j **không** được làm hỏng phản hồi convert (vụ việc đã commit): bắt ngoại lệ, ghi log, để outbox xử lý sau.
- **Outbox:** `process_outbox` thêm nhánh `CASE_CREATED` chạy cùng Cypher `MERGE` trên (lấy `department_id` từ payload; payload cũ không có thì tra `cases.department_id` theo `case_id`), sau đó đánh dấu đã xử lý như các nhánh khác.

## 5. Tiêu chí nghiệm thu (đo được)
- `bash handoff/tasks/TASK-039-opportunities-list-create/verify.sh` xanh toàn bộ (test mới + test chuyển đổi cũ + test graph sync + test không cài hook test vào app).
- Không đổi hành vi PATCH/convert hiện có (test cũ vẫn xanh).

## 6. Bẫy cần tránh
- Không sửa test hay nới điều kiện để test qua; không hard-code kết quả.
- Không lấy dữ liệu từ bảng khác để "chắc ăn" phân quyền — ATTORNEY chỉ thấy cơ hội của chính mình, kể cả khi lọc `client_id` của khách hàng do mình tạo.
- Tiền dùng `Decimal`, không float. Không UPDATE/DELETE `audit_logs`.
- DB test là Supabase dùng chung, chậm: giữ truy vấn gọn (một query đếm + một query trang), không quét toàn bảng trong Python.
- Không dùng `python3 -c` nhiều dòng; viết script tạm vào `/tmp` nếu cần.
