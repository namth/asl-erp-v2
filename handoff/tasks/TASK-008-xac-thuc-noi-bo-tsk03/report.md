# Báo cáo TASK-008: Xác thực nội bộ, phiên & thu hồi token (TSK-03)

## Đã làm
- [x] Xây dựng lớp xác thực nội bộ cho FastAPI bằng mật khẩu Argon2id (`m=65536, t=3, p=4, type=Type.ID`), chính sách mật khẩu chuẩn docs/10 (≥10 ký tự, hoa, thường, số, ký tự đặc biệt) trả 422 `VALIDATION_ERROR` khi vi phạm. Có xác thực băm giả để chống timing attack dò email.
- [x] Quản lý phiên làm việc bằng cookie HttpOnly, Secure, SameSite=Strict (`access_token`, `refresh_token`) và `csrf_token` (đọc được từ JS). Cơ chế CSRF header `X-CSRF-Token` khớp cookie `csrf_token` trên toàn bộ method ghi POST/PUT/PATCH/DELETE (ngoại trừ `/auth/login` và Bearer `reset_token`).
- [x] Xoay vòng Refresh Token (`POST /auth/refresh`) lưu `family_id`. Phát hiện dùng lại token đã thu hồi thì thu hồi toàn bộ chuỗi phiên của family và trả 401 `TOKEN_REVOKED`.
- [x] Cơ chế đăng xuất (`POST /auth/logout`) đưa `jti` vào Redis blocklist với TTL theo thời gian sống còn lại, thu hồi refresh token và xóa sạch cookie.
- [x] Thu hồi toàn bộ phiên (`revoke_user_sessions`) thông qua `users.tokens_valid_after`, cập nhật cache Redis và thu hồi mọi refresh token của người dùng. Dependency `get_current_user` từ chối mọi token có `iat < tokens_valid_after` với mã 401 `TOKEN_REVOKED`.
- [x] Đổi mật khẩu (`POST /auth/password`): hỗ trợ cả 2 luồng (a) người dùng đang đăng nhập đổi mật khẩu (xác thực mật khẩu cũ) và (b) đặt lại bắt buộc bằng `Authorization: Bearer <reset_token>` (dùng 1 lần đánh dấu Redis, bỏ cờ `must_reset_password`). Cả 2 luồng đều gọi `revoke_user_sessions`.
- [x] Phòng vệ brute-force đăng nhập (`login_guard.py`): đếm số lần sai theo tài khoản qua Redis (cửa sổ 15 phút), lần thứ 5 tạm khóa 30 phút (trả 423 `ACCOUNT_LOCKED` kèm `details.retry_after_seconds`) và ghi đúng 1 bản ghi audit log `ACCOUNT_LOCKED` (actor `SYSTEM`) qua `services/audit.log_audit_event`. Thành công reset bộ đếm; IP vượt 20 lần sai bị chặn 429 `RATE_LIMITED`.
- [x] Xử lý tương thích đa event loop trong môi trường kiểm thử `pytest-asyncio`: cấu hình `NullPool` cho async SQLAlchemy engine trong `backend/app/db/postgres.py` và quản lý client `redis.asyncio` theo loop đang chạy trong `backend/app/db/redis.py`.
- [x] Toàn bộ 41 bài kiểm thử (18 test cũ + 23 test của `test_auth.py` bao gồm TC-SEC-04, TC-SEC-05, TC-SEC-06, TC-SEC-07, test refresh token forgery, test concurrent refresh xoay vòng nguyên tử, và test bắt buộc CSRF mọi route ghi) đạt 100%.

## Vòng sửa (theo review.md vòng 1)
- [x] **Mục 1 (Refresh Token JWT):** Cập nhật `services/tokens.py` (`create_refresh_token`) và `api/auth.py` (`/login`, `/refresh`, `/logout`). Cookie `refresh_token` là JWT HS256 ký bằng `SECRET_KEY`, `typ="refresh"`, `jti = refresh_tokens.id`, `sub = user_id`, `exp` theo `REFRESH_TOKEN_EXPIRE_DAYS`. `/auth/refresh` giải mã và kiểm tra chữ ký cùng `typ="refresh"` trước khi truy vấn DB; UUID trần hoặc các token phụ khác đều bị trả 401. Test `test_refresh_token_cannot_be_forged_from_db_ids` đạt.
- [x] **Mục 2 (Khóa dòng khi xoay vòng Refresh Token):** Áp dụng transaction tường minh với `SELECT ... FOR UPDATE` trên bảng `refresh_tokens` trong `/auth/refresh`. Khi có 4 request gửi đồng thời cùng một refresh token, chỉ 1 request chiến thắng thực hiện xoay vòng, các request còn lại unblock thấy token đã revoked sẽ kích hoạt thu hồi toàn bộ chuỗi phiên và trả `401 TOKEN_REVOKED`. Test `test_concurrent_refresh_with_same_token_rotates_once` đạt.
- [x] **Mục 3 (Ghi log khi audit log ACCOUNT_LOCKED lỗi):** Trong `services/login_guard.py`, thay `except Exception: pass` bằng `logger.exception(...)` để ghi lại chi tiết lỗi mà không làm lộ bí mật và không nuốt lỗi im lặng. Trạng thái khóa tài khoản trên Redis vẫn được giữ nguyên.

## File đã tạo/sửa
- `backend/app/core/config.py`: Cập nhật `ACCESS_TOKEN_EXPIRE_MINUTES = 30` và cấu hình `REDIS_URL`.
- `backend/app/core/errors.py`: Bộ phong bì lỗi chuẩn ASL LAW (`AppException`, `RequestValidationError` 422 kèm `details.fields`, `HTTPException`).
- `backend/app/core/security.py`: Dependency `get_current_user` xác thực token `typ="access"`, kiểm tra Redis blocklist, `tokens_valid_after`, tài khoản active; hàm `verify_csrf` kiểm tra CSRF double-submit cookie.
- `backend/app/db/postgres.py`: Cấu hình `create_async_engine` với `poolclass=NullPool` để giải phóng kết nối tức thì, tương thích an toàn đa event loop.
- `backend/app/db/redis.py`: Quản lý client `redis.asyncio` lazy theo running event loop.
- `backend/app/schemas/auth.py`: Pydantic schema cho đăng nhập, đổi mật khẩu, thông tin người dùng (`UserProfile`) và response envelopes.
- `backend/app/services/passwords.py`: Băm và xác minh mật khẩu bằng Argon2id, kiểm tra độ mạnh mật khẩu, dummy verification chống timing attack.
- `backend/app/services/tokens.py`: Khởi tạo và giải mã JWT (`create_access_token`, `create_refresh_token`, `create_setup_token`, `create_reset_token`, `create_challenge_id`, `decode_token`).
- `backend/app/services/sessions.py`: Hàm `revoke_user_sessions`, tra cứu `tokens_valid_after` với cache Redis, quản lý blocklist `jti`.
- `backend/app/services/login_guard.py`: Phòng thủ brute-force đăng nhập theo tài khoản và IP, ghi audit log `ACCOUNT_LOCKED` có ghi log exception.
- `backend/app/api/auth.py`: Router `/api/v1/auth` với đầy đủ các endpoint `/login`, `/refresh`, `/logout`, `/me`, `/password`, khóa dòng `FOR UPDATE` và cấp/kiểm tra refresh token dạng JWT.
- `backend/app/api/__init__.py`: Export `auth_router`.
- `backend/app/main.py`: Đăng ký exception handlers và gắn router auth vào ứng dụng.

## Kết quả tự kiểm
```text
$ bash handoff/tasks/TASK-008-xac-thuc-noi-bo-tsk03/verify.sh
.........................................                                [100%]
41 passed in 398.38s (0:06:38)

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không.
