# Báo cáo TASK-036

## Đã làm
- Hiện thực API danh sách thông báo `GET /api/v1/notifications`: lọc theo người gọi hiện tại (`user_id`), sắp xếp `created_at DESC, id DESC`, đủ 7 trường (`id, kind, title, body, link, created_at, read_at`), định dạng ISO 8601 UTC kết thúc `Z`, lọc `unread_only`, phân trang với `page >= 1` và `page_size` 1–100, trả mã lỗi 422 `VALIDATION_ERROR` khi tham số sai, 401 khi chưa đăng nhập, `meta` đếm đúng `total` và `unread_count`.
- Hiện thực API đánh dấu đã đọc một thông báo `POST /api/v1/notifications/{id}/read`: idempotent, giữ nguyên `read_at` cũ nếu đã đọc, trả về 404 `NOT_FOUND` khi id không phải UUID hoặc không tồn tại hoặc thuộc người dùng khác, yêu cầu xác thực CSRF (`CSRF_INVALID` 403 khi thiếu).
- Hiện thực API đánh dấu đã đọc tất cả `POST /api/v1/notifications/read-all`: cập nhật `read_at = now()` cho toàn bộ thông báo chưa đọc của người gọi, trả về số lượng `updated_count`, lần gọi kế tiếp trả 0, yêu cầu CSRF token.
- Hiện thực service `backend/app/services/notifications.py`: hàm `create_notification` kiểm tra link tương đối hợp lệ (bắt đầu bằng đúng một `/`, không `//`, không `://`, không rỗng, ném `ValueError` khi sai), ghi bản ghi vào DB trong transaction `engine.begin()`, gọi `publish_notification` để phát message qua Redis Pub/Sub trên kênh `notifications:{user_id}` đúng định dạng `{"type": "NOTIFICATION_CREATED", "payload": item}`.
- Hiện thực WebSocket `WS /ws/notifications`: xác thực cookie `access_token` bằng `get_current_user`, đóng kết nối mã 4401 trước khi `accept` nếu không hợp lệ hoặc thiếu hoặc bị thu hồi; kết nối hợp lệ thì `accept()`, subscribe kênh Redis `notifications:{user_id}`, gửi `{"type": "READY"}` ngay sau khi subscribe, chuyển tiếp nguyên văn tin nhắn của kênh cho client, lắng nghe ngắt kết nối từ client để hủy subscribe và dọn dẹp kết nối pubsub không rò rỉ tài nguyên, định kỳ 60s kiểm tra lại token và đóng 4401 nếu bị thu hồi.
- Đăng ký router `notifications_router` (prefix `/api/v1`) và `notifications_ws_router` (không prefix `/api/v1`) trong `backend/app/main.py`.

## File đã tạo/sửa
- `backend/app/services/notifications.py`: Service tạo thông báo DB, validate link tương đối, phát Pub/Sub Redis qua `publish_notification`.
- `backend/app/api/notifications.py`: Router HTTP cho `/notifications` (danh sách, phân trang, đọc đơn, đọc tất cả) và router WebSocket `/ws/notifications`.
- `backend/app/main.py`: Import và mount `notifications_router` và `notifications_ws_router`.

## Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-036-thong-bao-be/verify.sh
................                                                         [100%]
=============================== warnings summary ===============================
../../qlcvasl-v2/.venv/lib/python3.11/site-packages/fastapi/testclient.py:1
  /Users/namtran/Local Sites/qlcvasl-v2/.venv/lib/python3.11/site-packages/fastapi/testclient.py:1: StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
    from starlette.testclient import TestClient as TestClient  # noqa

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
16 passed, 1 warning in 152.65s (0:02:32)

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không. Mọi tiêu chí nghiệm thu và ràng buộc kiểm thử đều được tuân thủ 100%.
