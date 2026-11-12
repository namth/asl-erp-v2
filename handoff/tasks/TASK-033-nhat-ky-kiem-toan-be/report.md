# Báo cáo TASK-033

## Đã làm
- **Phân quyền & Kiểm soát truy cập:** Yêu cầu đăng nhập (401 UNAUTHENTICATED khi chưa có token hợp lệ), giới hạn quyền cho ADMIN (403 FORBIDDEN_ROLE với MANAGER, ACCOUNTANT, ATTORNEY); không khai báo route ghi nào trên router `/audit-logs` (POST, PUT, PATCH, DELETE trả về 404/405 và dữ liệu bất biến).
- **Danh sách nhật ký kiểm toán (GET /api/v1/audit-logs):**
  - Hỗ trợ đầy đủ các tham số lọc: `actor_id` (UUID), `actor_type` (`USER`|`SYSTEM`), `action`, `entity_name`, `entity_id`, `from`, `to` (lọc `created_at` ISO 8601).
  - Phân trang chuẩn theo `meta = {page, limit, total_records, total_pages}`, sắp xếp mới nhất trước (`id DESC`).
  - Trả về đủ trường theo đặc tả §3.2a: `id`, `created_at` (ISO UTC kết thúc bằng Z), `actor_type`, `actor` (`{id, full_name, email}` hoặc `null` khi SYSTEM/không có liên kết user), `action`, `entity_name`, `entity_id`, `before_state`, `after_state`, `ip_address` (string), `user_agent`, `row_hash` (64 ký tự).
  - Bảo mật dữ liệu: không để lộ `prev_hash`, không để lộ `password_hash` hay các thông tin nhạy cảm khác từ bảng `users`.
  - Tham số hóa 100% qua `%s`, cùng điều kiện WHERE cho truy vấn đếm và truy vấn phân trang.
  - Xử lý xác thực kiểu/khoảng giá trị tự động qua FastAPI `Query(..., ge=, le=)` trả 422 `VALIDATION_ERROR`.
- **Dịch vụ & Thuật toán kiểm tra toàn vẹn chuỗi băm:**
  - `scan_chain_rows(rows)`: hàm thuần kiểm tra chuỗi băm nối tiếp từ `GENESIS_HASH` và giữa các bản ghi liên tiếp; tính toán và so khớp `row_hash` bằng `canonical_json` và `compute_row_hash`. Phát hiện chính xác các trường hợp giả mạo dữ liệu (`tampered`), sai liên kết (`wrong_link`), hoặc chuỗi không bắt đầu từ genesis (`not_from_genesis`).
  - `scan_chain(conn)`: duyệt toàn bộ bảng `audit_logs` theo lô 2.000 dòng (`WHERE id > last_id ORDER BY id ASC`), không nạp toàn bộ dữ liệu vào RAM, duy trì `prev_hash` giữa các lô.
  - `run_integrity_check(conn)`: hàm dịch vụ dùng chung cho API và Celery beat job hằng đêm.
- **Trạng thái toàn vẹn chuỗi băm (GET /api/v1/audit-logs/integrity):**
  - Khi `recheck=False`: đọc kết quả từ Redis `audit:integrity:last`; trả về `NEVER_CHECKED` với `checked_rows=0` nếu chưa kiểm tra lần nào.
  - Khi `recheck=True`: sử dụng Redis lock phân tán `audit:integrity:recheck_lock` với `NX` và `EX=300`. Chặn tần suất trả 429 `RATE_LIMITED` nếu bị gọi liên tiếp trong vòng 5 phút. Quét chuỗi bằng `scan_chain(conn)` trong threadpool, cập nhật kết quả `OK` hoặc `BROKEN` kèm `first_broken_id` vào Redis `audit:integrity:last`.

## File đã tạo/sửa
- `backend/app/services/audit_logs.py`: Hàm thuần `scan_chain_rows`, hàm quét chuỗi theo lô `scan_chain`, hàm thực thi kiểm tra `run_integrity_check`, helper `get_db_conn`.
- `backend/app/api/audit_logs.py`: Router `/audit-logs` với 2 endpoint `GET /` và `GET /integrity`, kiểm soát phân quyền ADMIN, bộ lọc, phân trang và rate limit qua Redis.
- `backend/app/main.py`: Import `audit_logs_router` và gắn `app.include_router(audit_logs_router, prefix="/api/v1")`.

## Kết quả tự kiểm
```text
$ bash handoff/tasks/TASK-033-nhat-ky-kiem-toan-be/verify.sh
...............                                                          [100%]
15 passed in 205.72s (0:03:25)

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
