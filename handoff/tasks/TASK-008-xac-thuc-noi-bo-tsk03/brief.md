# TASK-008 — Xác thực nội bộ, phiên & thu hồi token (TSK-03)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (bảo mật)

## 1. Mục tiêu
Xây lớp xác thực nội bộ cho backend FastAPI: đăng nhập bằng mật khẩu Argon2id, phiên bằng cookie HttpOnly + CSRF, refresh token xoay vòng có phát hiện dùng lại, đăng xuất và thu hồi mọi phiên tức thì, khoá tạm khi dò mật khẩu. Mọi endpoint nghiệp vụ sau này dựa vào dependency `get_current_user` của task này.

## 2. Tài liệu bắt buộc đọc
- `CONTEXT.md` mục 3 (bất biến #5, #6)
- `docs/07-api-contracts.md` §1.2 (phong bì), §1.3 (mã lỗi), §3.1 (xác thực)
- `docs/10-env-and-security.md` mục mật khẩu, JWT/cookie, CSRF, thu hồi phiên
- `docs/13-test-cases-and-qa.md` TC-SEC-04 → TC-SEC-07
- Test: `backend/tests/test_auth.py` (hợp đồng nghiệm thu — đọc kỹ trước khi code)

## 3. Phạm vi file
**Được tạo/sửa:**
- `backend/app/api/` (router `auth.py`, `__init__.py`)
- `backend/app/core/` (`config.py` thêm `REDIS_URL` và sửa `ACCESS_TOKEN_EXPIRE_MINUTES` = 30; `security.py`; `errors.py`)
- `backend/app/services/` (`passwords.py`, `tokens.py`, `sessions.py`, `login_guard.py`) — **không sửa** `audit.py`
- `backend/app/db/redis.py`, `backend/app/db/postgres.py` (sửa cách tạo engine — xem §6)
- `backend/app/schemas/auth.py`
- `backend/app/main.py` (gắn router + handler lỗi)

**Không được sửa:**
- Mọi file trong `tests.lock`, mọi file trong `backend/tests/`
- `backend/alembic/` (schema đã có đủ `users`, `refresh_tokens`), `backend/requirements.txt`
- `qlcvaslgate-old/`, `docs/`

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- Thư viện đã cài trong `.venv`: `argon2-cffi`, `PyJWT`, `redis` (dùng `redis.asyncio`). Không thêm thư viện khác.
- **Phong bì lỗi** cho MỌI lỗi (kể cả 422 của Pydantic): `{"success": false, "error": {"code", "message", "details"}}`; 422 → `VALIDATION_ERROR`, `details.fields`. Thông điệp tiếng Việt.
- **Mật khẩu:** Argon2id `m=65536, t=3, p=4`; chính sách ở `docs/10` (≥ 10 ký tự, hoa, thường, số, ký tự đặc biệt) → vi phạm là 422.
- **Access token** JWT HS256, `sub`=user id, `jti`, `iat`, `exp` = iat + 1800, `typ="access"`. Cookie `access_token`. Cũng chấp nhận header `Authorization: Bearer` nhưng **chỉ** với `typ="access"`.
- **Token phụ** `setup_token` (`typ="totp_setup"`), `reset_token` (`typ="password_reset"`, dùng một lần — đánh dấu `jti` đã dùng trong Redis), `challenge_id` (khoá Redis, TTL 300 s). Không token phụ nào qua được `get_current_user`.
- **Refresh token:** giá trị ngẫu nhiên hoặc JWT chứa `jti` = `refresh_tokens.id`; lưu `family_id`. Xoay vòng: thu hồi cũ (`revoked_at`, `replaced_by`), tạo mới cùng family. Token đã thu hồi bị dùng lại → thu hồi **cả family** → `401 TOKEN_REVOKED`.
- **Cookie:** cả 3 cookie `Secure; SameSite=Strict`; `access_token`, `refresh_token` thêm `HttpOnly`; `csrf_token` thì không. Path `refresh_token` có thể là `/api/v1/auth`.
- **CSRF:** mọi `POST/PUT/PATCH/DELETE` dùng phiên cookie phải có `X-CSRF-Token` == cookie `csrf_token`, trừ `/auth/login` và request xác thực bằng `Authorization: Bearer <reset_token>`.
- **Thu hồi:** `logout` → `jti` vào blocklist Redis (TTL = thời gian sống còn lại) + thu hồi refresh family. `services/sessions.py` cung cấp `async def revoke_user_sessions(user_id: UUID) -> None`: đặt `users.tokens_valid_after = NOW()`, cập nhật cache Redis, thu hồi mọi refresh token của user. Token có `iat` < `tokens_valid_after` (so ở mức giây, làm tròn xuống) → `TOKEN_REVOKED`. Đổi mật khẩu cũng gọi hàm này.
- **`POST /auth/password`:** (a) đang đăng nhập: cookie + CSRF, body `{current_password, new_password}`, sai mật khẩu cũ → 401; (b) đặt lại bắt buộc: `Authorization: Bearer <reset_token>`, body `{new_password}`, xong thì `must_reset_password = FALSE`. Trả 204.
- **Login — thứ tự:** sai/không có email → 401 `UNAUTHENTICATED` cùng thông điệp; `is_active = FALSE` hoặc đang bị khoá → 423 (`details.retry_after_seconds`); `must_reset_password` → 403 `PASSWORD_RESET_REQUIRED`; `totp_enabled` → 401 `TOTP_REQUIRED`; vai trò ADMIN/MANAGER/ACCOUNTANT chưa bật TOTP → 403 `TOTP_SETUP_REQUIRED`; còn lại 200 + cookie. Endpoint 2FA (`/auth/2fa/*`) thuộc TSK-17 — **không làm**.
- **Brute-force:** đếm lần sai theo tài khoản trong Redis (cửa sổ 15 phút); lần sai thứ 5 → khoá 30 phút và ghi **một** dòng audit `action='ACCOUNT_LOCKED'`, `entity_name='users'`, `entity_id=<user id>` qua `services/audit.log_audit_event` (actor `SYSTEM`). Đăng nhập đúng xoá bộ đếm. Giới hạn theo IP: ≥ 20 lần sai / 15 phút mới chặn (`429 RATE_LIMITED`).
- `user` trong phản hồi: đúng các trường ở `docs/07` §3.1 (`led_department_ids` lấy từ `department_leaders`). Không bao giờ trả `password_hash`, `totp_secret_enc`.

## 5. Tiêu chí nghiệm thu
- [ ] `python3 scripts/handoff.py verify TASK-008` exit 0 (toàn bộ `backend/tests`, gồm 18 test cũ + `test_auth.py`)
- [ ] TC-SEC-04, 05, 06, 07 đạt (các test `test_tc_sec_0*` trong `test_auth.py`)
- [ ] Không còn hằng số bí mật mới nào được hard-code thêm trong code (đọc từ `settings`)

## 6. Ràng buộc & bẫy cần tránh
- **Không sửa test.** Test đỏ = code sai. Thấy test sai → ghi `report.md` mục câu hỏi.
- Không nhánh riêng cho môi trường test (không dò `pytest`, email `tsk03-`…). Không mock Redis/DB trong code sản phẩm.
- `audit_logs` chỉ INSERT (bất biến #6) — dùng `log_audit_event`, không tự viết SQL vào bảng này.
- So sánh CSRF và token bằng `hmac.compare_digest`. Đo thời gian: email không tồn tại vẫn chạy một lần verify băm giả để không lộ tài khoản qua thời gian phản hồi.
- `main.py` đang có CORS `allow_origins=["*"]` + `allow_credentials=True` — **giữ nguyên** trong task này (sẽ xử lý ở TSK-16).
- Chạy test chỉ bằng `python3 scripts/handoff.py verify TASK-008` (không gọi `.venv/bin/python` hay `bash` trực tiếp).
- **Event loop:** pytest-asyncio tạo event loop mới cho mỗi test; engine async và client Redis toàn cục giữ kết nối của loop cũ → `RuntimeError … attached to a different loop`. Sửa trong code sản phẩm một cách tổng quát (vd engine/client tạo lười và gắn với loop đang chạy, hoặc `NullPool` cho engine), không dò môi trường test.
