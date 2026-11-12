# TASK-036 — Backend trung tâm thông báo web: danh sách, đã đọc, WebSocket (TSK-21 phần web)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** MEDIUM · **Nhạy cảm:** thấp (chỉ dữ liệu của chính người gọi)
> **Phụ thuộc:** không. FE chuông thông báo đã có (`frontend/src/components/notifications/`, `hooks/use-notifications*.ts`) — đọc để khớp hình dạng dữ liệu.

## 1. Mục tiêu
API thông báo trong ứng dụng cho mọi người dùng đã đăng nhập: xem danh sách của mình, đánh dấu đã đọc (từng cái / tất cả), nhận thông báo mới tức thời qua WebSocket; service `create_notification` để các phân hệ khác gọi khi cần báo tin. Kênh Telegram/Zalo, quét hạn, leo thang: **không** thuộc task này.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` **§3.10**, §1.2–1.3 (dạng response, mã lỗi)
- `docs/06-database-schema.md` bảng `notifications`
- Code có sẵn: `backend/app/core/security.py` (`get_current_user`, `verify_csrf`), `backend/app/db/postgres.py` (`engine`), `backend/app/db/redis.py` (`get_redis`), `backend/app/core/errors.py`, mẫu router `backend/app/api/me.py`
- `.agents/rules/vai-tro-ky-su-thuc-thi.md` (luật 12, 13)

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `backend/app/api/notifications.py`
- `backend/app/services/notifications.py`
- `backend/app/main.py` (chỉ thêm import + `include_router`)

**Người viết test:** `backend/tests/test_notifications_api.py` và `verify.sh` của task (đã viết, đã khoá).

**Không được sửa:** mọi file trong `tests.lock`; `backend/tests/`; `backend/app/core/`, `backend/app/db/`, `backend/app/guards/`, `backend/alembic/`; `frontend/`, `docs/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
**Dạng một phần tử thông báo** (dùng chung cho API, payload WebSocket, giá trị trả về của service — mọi giá trị là chuỗi hoặc `null`, JSON-serializable): `{id, kind, title, body, link, created_at, read_at}`; `created_at`/`read_at` ISO 8601 UTC (kết thúc `Z`).

**HTTP** — router `prefix="/notifications"` gắn `/api/v1`; mọi route cần đăng nhập (401); route POST có `dependencies=[Depends(verify_csrf)]`.
- `GET /notifications`: `unread_only: bool = False`, `page ≥ 1` (mặc định 1), `page_size` 1–100 (mặc định 20); sai → 422 `VALIDATION_ERROR`. Chỉ `user_id = người gọi`, sắp `created_at DESC, id DESC`. `meta = {page, page_size, total, unread_count}` — `total` đếm theo bộ lọc hiện tại, `unread_count` luôn là tổng chưa đọc của người gọi.
- `POST /notifications/{id}/read`: của người khác / không tồn tại / id không phải UUID → 404 `NOT_FOUND`. Chưa đọc → đặt `read_at = now()`; đã đọc → giữ nguyên `read_at` cũ. Trả `{"success": true, "data": {"id", "read_at"}}`.
- `POST /notifications/read-all`: đặt `read_at = now()` cho mọi thông báo chưa đọc của người gọi → `{"success": true, "data": {"updated_count": n}}`. **Khai báo route này trước** route `/{id}/read` không quan trọng vì khác số đoạn, nhưng đừng để `read-all` bị hiểu là `{id}`.

**Service** `backend/app/services/notifications.py`:
- `async def create_notification(user_id: str, *, kind: str, title: str, body: str, link: str) -> dict`: `link` phải là đường dẫn tương đối trong app — bắt đầu bằng đúng một `/` (không `//`), không chứa `://`, không rỗng; sai → `ValueError`. INSERT + commit (dùng `engine.begin()`), rồi gọi `publish_notification`. Trả phần tử như trên.
- `async def publish_notification(user_id: str, item: dict) -> None`: `PUBLISH notifications:{user_id}` chuỗi JSON `{"type": "NOTIFICATION_CREATED", "payload": item}`.

**WebSocket** `WS /ws/notifications` (router riêng, **không** prefix `/api/v1`):
- Xác thực bằng cookie `access_token` theo đúng luật của `get_current_user` (có thể gọi `await get_current_user(websocket)` — đối tượng WebSocket có `.cookies`/`.headers`). Thiếu/sai/thu hồi → `await websocket.close(code=4401)` **trước khi** `accept`.
- Hợp lệ → `accept()`, SUBSCRIBE `notifications:{user_id}`, **sau khi đã subscribe** gửi `{"type": "READY"}`, rồi chuyển tiếp nguyên văn mỗi tin nhắn của kênh (JSON) cho client. Chỉ kênh của chính người dùng.
- Chạy song song việc đọc từ client để phát hiện ngắt kết nối; khi client ngắt hoặc lỗi → hủy subscribe, đóng pubsub, thoát gọn (không treo, không rò kết nối Redis).
- Mỗi 60 giây kiểm tra lại token (blocklist / `tokens_valid_after`); bị thu hồi → `close(code=4401)`.

## 5. Tiêu chí nghiệm thu (đã thành test trong `backend/tests/test_notifications_api.py`)
- Danh sách chỉ của mình, mới nhất trước, đủ 7 trường, `meta` đúng; lọc chưa đọc + phân trang; tham số sai → 422; chưa đăng nhập → 401.
- Đánh dấu đã đọc idempotent (không ghi đè `read_at`), của người khác → 404 và không đổi; `read-all` chỉ của mình, lần 2 trả 0; POST thiếu CSRF → 403 `CSRF_INVALID`.
- `create_notification` ghi DB và phát Redis đúng kênh/định dạng; từ chối link ngoài (`https://…`, `//…`, không có `/` đầu, `javascript:`, rỗng).
- WebSocket: không có/sai phiên → đóng 4401; có phiên → `READY`, không nhận tin của người khác, nhận đúng tin của mình.

## 6. Ràng buộc & bẫy cần tránh
- Không vá thư viện, không middleware mới, không ghi biến môi trường (luật 12–13; test chặn sẽ đỏ).
- DB test dùng chung: không giả định bảng rỗng.
- Test đỏ mà bạn cho là lỗi test → ghi `report.md` mục câu hỏi rồi dừng, không lách.
- Không ghép nhiều lệnh shell bằng `&&`/`;`; chạy verify bằng `python3 scripts/handoff.py verify TASK-036`.
