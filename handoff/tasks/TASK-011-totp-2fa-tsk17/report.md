# Báo cáo TASK-011

## Đã làm
- [x] **TC-SEC-08:** Phân quyền bắt buộc 2FA theo vai trò hệ thống: ACCOUNTANT/ADMIN/MANAGER chưa bật 2FA khi đăng nhập nhận 403 `TOTP_SETUP_REQUIRED` kèm `setup_token`; vai trò ATTORNEY chưa bật 2FA thì đăng nhập bình thường (200 OK + cấp phiên).
- [x] **Luồng đầy đủ (Setup -> Enable -> Verify):**
  - Đăng nhập lấy `setup_token` -> gọi `POST /api/v1/auth/2fa/setup` nhận bí mật base32 và `otpauth_uri`.
  - Gọi `POST /api/v1/auth/2fa/enable` với mã sai -> 401 `TOTP_INVALID`.
  - Gọi `POST /api/v1/auth/2fa/enable` với mã đúng sinh từ `pyotp` -> `totp_enabled = TRUE`, sinh và băm 10 mã khôi phục 10 ký tự `[A-Z0-9]`, cấp phiên làm việc ngay khi dùng `setup_token`.
  - Đăng nhập tiếp theo yêu cầu 2FA -> 401 `TOTP_REQUIRED` kèm `challenge_id` (TTL 300s).
  - Gọi `POST /api/v1/auth/2fa/verify` với mã TOTP đúng -> 200 OK, cấp phiên làm việc đầy đủ (cookies HttpOnly/Secure/SameSite=Strict) và `/auth/me` sử dụng bình thường.
- [x] **Xác thực tự nguyện qua phiên cookie:** Cho phép người dùng đã có phiên gọi `/auth/2fa/setup` (yêu cầu CSRF), gọi lại setup sinh bí mật mới và huỷ bí mật chưa kích hoạt trước đó.
- [x] **Cửa sổ thời gian & Chống phát lại:**
  - Hỗ trợ cửa sổ lệch bước ±1 (±30s) theo RFC 6238; lệch ±3 bước (±90s) bị từ chối 401 `TOTP_INVALID`.
  - Sử dụng `hmac.compare_digest` chống tấn công đo thời gian (timing attacks).
  - Chống phát lại (anti-replay): lưu bước thời gian (step) đã xác thực thành công vào Redis với TTL 120s; từ chối dùng lại mã trong cùng bước 30s.
- [x] **TC-SEC-09: Chống brute-force & Khóa tài khoản:**
  - Xác thực bước 2FA sai quá 5 lần trong 15 phút tính vào bộ đếm khóa tài khoản; lần tiếp theo bị khóa 423 `ACCOUNT_LOCKED` (30 phút) và ghi đúng 1 bản ghi audit `ACCOUNT_LOCKED`.
  - Không xoá bộ đếm thất bại ở bước mật khẩu đúng nếu còn chờ 2FA; chỉ xoá bộ đếm khi cấp phiên thành công.
- [x] **TC-SEC-09: Mã khôi phục dùng 1 lần:**
  - Xác thực thành công bằng mã khôi phục 10 ký tự; đánh dấu `used_at` ngay lập tức.
  - Sử dụng lại mã khôi phục đã dùng bị từ chối 401 `TOTP_INVALID`.
  - Các mã khôi phục còn lại trong danh sách vẫn hoạt động bình thường.
- [x] **Bảo mật token & challenge:**
  - `challenge_id` hết hiệu lực ngay sau khi verify thành công; dùng lại bị 401 `UNAUTHENTICATED`.
  - `challenge_id` giả mạo hoặc hết hạn trả về 401 `UNAUTHENTICATED`.
  - `setup_token` không thể dùng để gọi `/auth/me` hoặc `/auth/logout`.
- [x] **Không lưu bí mật bản rõ:**
  - `users.totp_secret_enc` lưu mã hoá AES-256-GCM (`nonce || ciphertext + tag`) với `DATA_ENCRYPTION_MASTER_KEY`.
  - `user_recovery_codes.code_hash` băm bằng Argon2id (`$argon2id$`, `m=65536, t=3, p=4`).
  - Toàn bộ audit log không ghi bí mật TOTP hay mã khôi phục bản rõ.
- [x] **Quản trị viên Reset 2FA:**
  - Endpoint `POST /api/v1/users/{id}/2fa/reset` yêu cầu quyền ADMIN và CSRF token.
  - Người dùng không phải ADMIN gọi -> 403 `FORBIDDEN`; ADMIN tự reset chính mình -> 403 `FORBIDDEN`.
  - Thiếu lý do hoặc lý do < 10 ký tự -> 422 `VALIDATION_ERROR`.
  - Khi reset thành công: xoá bí mật TOTP và mã khôi phục, đặt `totp_enabled = FALSE`, thu hồi toàn bộ phiên hoạt động của người bị reset (`revoke_user_sessions`), ghi đúng 1 audit log `RESET_2FA` (chỉ chứa lý do).
- [x] Toàn bộ 54 test cases (`test_auth.py` và `test_two_factor.py`) đều pass 100%.

## File đã tạo/sửa
- `backend/alembic/versions/002_user_recovery_codes.sql`: Tạo bảng `user_recovery_codes` và index `idx_user_recovery_codes_user_id` có thể chạy lặp lại được.
- `backend/app/core/config.py`: Khai báo các cấu hình `DATA_ENCRYPTION_MASTER_KEY`, `TOTP_ISSUER`, `TOTP_REQUIRED_ROLES` và đăng ký loader UUID cho psycopg.
- `backend/app/core/crypto.py`: Module mã hoá/giải mã AES-256-GCM chuẩn hóa bảo vệ bí mật TOTP.
- `backend/app/services/totp.py`: Dịch vụ sinh bí mật TOTP, tạo URI, kiểm tra mã lệch bước ±1, chống phát lại qua Redis, sinh và băm mã khôi phục Argon2id, xác thực và đánh dấu đã sử dụng mã khôi phục.
- `backend/app/schemas/auth.py`: Schemas Pydantic cho thiết lập, kích hoạt, xác thực 2FA và reset 2FA của Admin.
- `backend/app/services/tokens.py`: Helper functions quản lý và huỷ `challenge_id` trên Redis.
- `backend/app/api/auth.py`: Định tuyến và hiện thực các endpoints 2FA (`/auth/2fa/setup`, `/auth/2fa/enable`, `/auth/2fa/verify`, `/users/{id}/2fa/reset`), bảo đảm kiểm tra CSRF và cấp phiên chuẩn mực.

## Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-011-totp-2fa-tsk17/verify.sh
Đã áp thành công file SQL: backend/alembic/versions/002_user_recovery_codes.sql
......................................................                   [100%]
54 passed in 1364.68s (0:22:44)

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
