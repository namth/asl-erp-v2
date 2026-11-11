# TASK-033 — Backend nhật ký kiểm toán & kiểm toàn vẹn chuỗi băm (TSK-12, SCR-13)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW–MEDIUM · **Nhạy cảm:** có (bất biến #6 — `audit_logs` chỉ INSERT/SELECT)
> **Phụ thuộc:** không. FE màn hình SCR-13 đã có (`frontend/src/app/(dashboard)/admin/audit-logs/page.tsx`).

## 1. Mục tiêu
Hai endpoint chỉ đọc cho Quản trị viên: danh sách nhật ký kiểm toán có lọc/phân trang, và trạng thái toàn vẹn chuỗi băm (kèm kiểm lại theo yêu cầu, giới hạn tần suất).

## 2. Tài liệu bắt buộc đọc
- `CONTEXT.md` mục 3 (#6); `.agents/rules/vai-tro-ky-su-thuc-thi.md` (đặc biệt luật 12, 13)
- `docs/07-api-contracts.md` **§3.2a** (mẫu response hai endpoint), §1.2 (phân trang `meta`), §1.3 (mã lỗi)
- `docs/06-database-schema.md` bảng `audit_logs`
- Code có sẵn: `backend/app/services/audit.py` (`GENESIS_HASH`, `canonical_json`, `compute_row_hash`, `verify_audit_chain`), `backend/app/core/security.py` (`get_current_user`), `backend/app/db/redis.py` (`get_redis`), mẫu router `backend/app/api/settings_holidays.py`

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `backend/app/api/audit_logs.py`
- `backend/app/services/audit_logs.py`
- `backend/app/main.py` (chỉ thêm import + `include_router`)

**Người viết test:** `backend/tests/test_audit_log_api.py` và `verify.sh` của task (đã viết, đã khoá).

**Không được sửa:** mọi file trong `tests.lock`; `backend/tests/`; `backend/app/services/audit.py`, `backend/app/guards/`, `backend/app/core/`, `backend/alembic/`; `frontend/`, `docs/`, `qlcvaslgate-old/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- Router `prefix="/audit-logs"`, gắn `/api/v1`. Cả hai endpoint: chưa đăng nhập → 401; `system_role != ADMIN` → 403 `FORBIDDEN_ROLE`. Không có route ghi nào.
- `GET /audit-logs`: tham số `actor_id` (UUID), `actor_type` (`USER`|`SYSTEM`), `action`, `entity_name`, `entity_id`, `from`, `to` (datetime ISO 8601, lọc `created_at` — `from` ≥, `to` ≤), `page` (≥1, mặc định 1), `limit` (1–200, mặc định 50). Giá trị sai kiểu/ngoài khoảng → 422 `VALIDATION_ERROR` (khai báo bằng `Query(..., ge=, le=)`, `Literal`, `datetime` để FastAPI tự kiểm). Sắp xếp `id DESC`. `meta = {page, limit, total_records, total_pages}` (`total_pages = ceil(total/limit)`, 0 bản ghi → 0).
- Mỗi phần tử: `id, created_at (ISO, UTC), actor_type, actor, action, entity_name, entity_id, before_state, after_state, ip_address (chuỗi), user_agent, row_hash`. `actor = {id, full_name, email}` lấy bằng `LEFT JOIN users`; `null` khi `actor_id` null. Không trả `prev_hash`, không trả cột nào của `users` ngoài 3 trường trên.
- Truy vấn bằng tham số hoá (`%s`), không ghép chuỗi giá trị người dùng vào SQL. Đếm và lấy trang bằng cùng một điều kiện WHERE.
- `services/audit_logs.py` phải có:
  - `scan_chain_rows(rows) -> tuple[int, int | None]`: hàm thuần, nhận list dòng `(id, actor_type, actor_id, action, entity_name, entity_id, before_state, after_state, ip_address, prev_hash, row_hash)` theo id tăng dần; dòng đầu phải có `prev_hash == GENESIS_HASH`; mỗi dòng sau `prev_hash` = `row_hash` dòng trước; `row_hash` tính lại khớp (cùng công thức với `log_audit_event`, dùng `canonical_json`/`compute_row_hash` có sẵn — không chép lại công thức). Trả `(số dòng đã duyệt, id dòng gãy đầu tiên hoặc None)`.
  - `scan_chain(conn) -> tuple[int, int | None]`: đọc toàn bộ `audit_logs` theo `id ASC` (đọc theo lô, vd 2.000 dòng/lần bằng `WHERE id > last_id`, không nạp hết vào RAM) và gọi `scan_chain_rows` theo lô, giữ `prev` nối giữa các lô. API gọi hàm này qua tên module (`svc.scan_chain(conn)`) để test thay được.
- `GET /audit-logs/integrity` (`recheck: bool = False`):
  - Không recheck: đọc Redis `audit:integrity:last` (JSON) → trả nguyên; chưa có → `{"status":"NEVER_CHECKED","checked_rows":0,"verified_at":null,"first_broken_id":null}`.
  - `recheck=true`: `SET audit:integrity:recheck_lock 1 NX EX 300`; không đặt được → 429 `RATE_LIMITED`. Đặt được → chạy `scan_chain` (trong threadpool nếu dùng psycopg đồng bộ), dựng `{status: "OK"|"BROKEN", checked_rows, verified_at: now UTC ISO, first_broken_id}`, lưu vào `audit:integrity:last` (không TTL) rồi trả về.
  - Job hằng đêm (Celery beat) để task sau; chỉ cần hàm service `run_integrity_check()` dùng chung cho API và job.

## 5. Tiêu chí nghiệm thu (đã thành test trong `backend/tests/test_audit_log_api.py`)
- 401 khi chưa đăng nhập; 403 `FORBIDDEN_ROLE` với MANAGER/ACCOUNTANT/ATTORNEY; không có route ghi (404/405) và dữ liệu không đổi.
- Lọc `action` trả đúng 3 bản ghi mới nhất trước, đủ trường, `actor` đúng dạng, `actor = null` cho SYSTEM.
- Lọc kết hợp `entity_name+entity_id`, `actor_id`, `actor_type`, `from`, `to` đúng.
- Phân trang `limit=2` → 2 trang, `meta` đúng; `limit=201|0`, `page=0`, `actor_type` lạ, `from` sai định dạng → 422 `VALIDATION_ERROR`.
- Integrity: `NEVER_CHECKED` → `recheck` trả OK/BROKEN với `checked_rows`, `verified_at` → `recheck` lần 2 → 429 → GET thường trả đúng kết quả đã lưu; khoá Redis TTL ≤ 300.
- `scan_chain` trả gãy → API `BROKEN` + `first_broken_id`; `scan_chain_rows` phát hiện sửa nội dung, sai liên kết, không nối từ genesis.

## 6. Ràng buộc & bẫy cần tránh
- **Tuyệt đối không** `UPDATE`/`DELETE`/`TRUNCATE` `audit_logs`, không bật/tắt trigger, không DDL (luật 13 — test chặn `test_no_test_hooks_in_app.py` sẽ đỏ). Chuỗi trên DB dùng chung có thể đang `BROKEN` — đó là dữ liệu, không phải lỗi để "sửa"; test chấp nhận cả OK lẫn BROKEN.
- Không vá thư viện, không middleware mới, không sửa `main.py` ngoài import + `include_router`.
- DB test dùng chung với các task khác: không giả định bảng rỗng, luôn lọc theo dữ liệu do test tạo.
- Test đỏ mà bạn cho là lỗi test → ghi `report.md` mục câu hỏi rồi dừng, không lách.
- Không ghép nhiều lệnh shell bằng `&&`/`;` (bị chặn quyền); chạy verify bằng `python3 scripts/handoff.py verify TASK-033`.
