# TASK-011 — Xác thực 2 lớp TOTP & mã khôi phục (TSK-17)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (bảo mật)
> **Phụ thuộc:** TASK-008 (lớp đăng nhập: `login`, `get_current_user`, token phụ `setup_token`/`challenge_id`, bộ đếm khoá). Code task này chỉ bắt đầu sau khi TASK-008 được merge; test viết được ngay theo hợp đồng.

## 1. Mục tiêu
Hoàn thiện 2FA theo DEC-02: thiết lập/kích hoạt TOTP, bước 2 khi đăng nhập, mã khôi phục dùng một lần, Quản trị viên reset 2FA cho người khác có audit.

## 2. Tài liệu bắt buộc đọc
- `docs/14-decisions.md` DEC-02; `docs/10-env-and-security.md` §2.2a, mục chống brute-force, "Không ghi bí mật vào log"
- `docs/07-api-contracts.md` §1.3 (mã `TOTP_*`, `FORBIDDEN`), §3.1 (`/auth/login`, `/auth/2fa/verify`)
- `docs/13-test-cases-and-qa.md` TC-SEC-08, TC-SEC-09
- `handoff/tasks/TASK-008-xac-thuc-noi-bo-tsk03/brief.md` mục 4 (token phụ, cookie, CSRF, bộ đếm) và `backend/tests/test_auth.py` (cách dựng user/test)

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `backend/app/api/` (router 2FA), `backend/app/services/totp.py`, `backend/app/core/crypto.py`
- `backend/app/services/login_guard.py`, `backend/app/services/tokens.py` (chỉ phần nối với 2FA)
- `backend/app/schemas/auth.py`, `backend/app/core/config.py` (thêm `DATA_ENCRYPTION_MASTER_KEY`, `TOTP_ISSUER`, `TOTP_REQUIRED_ROLES`)
- `backend/alembic/versions/002_user_recovery_codes.sql`

**Người viết test:** `backend/tests/test_two_factor.py` và `verify.sh` của task này.

**Không được sửa:** mọi file trong `tests.lock`; `backend/tests/` (trừ file test của task); `backend/app/services/audit.py`; `docs/`, `qlcvaslgate-old/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- Thư viện có sẵn trong `.venv`: `pyotp`, `cryptography`. TOTP RFC 6238, 6 số, bước 30 s, `valid_window=1`.
- Bí mật TOTP lưu `users.totp_secret_enc` = AES-256-GCM (`nonce‖ciphertext`), khoá từ `DATA_ENCRYPTION_MASTER_KEY` (base64 32 byte, đọc từ biến môi trường). Không bao giờ lưu/ghi log bản rõ.
- Bảng mới (file SQL, `CREATE TABLE IF NOT EXISTS`, chạy lặp được): `user_recovery_codes(id UUID PK, user_id UUID FK users NOT NULL, code_hash VARCHAR(255) NOT NULL, used_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ DEFAULT NOW())`. Mã khôi phục 10 ký tự `[A-Z0-9]`, băm Argon2id.
- `POST /auth/2fa/setup` — xác thực bằng `Authorization: Bearer <setup_token>` **hoặc** phiên đăng nhập (cookie + CSRF). Trả `{ "secret": "<base32>", "otpauth_uri": "otpauth://totp/ASL%20LAW%20ERP:<email>?secret=…&issuer=ASL%20LAW%20ERP" }`. Gọi lại thì sinh bí mật mới (chưa bật).
- `POST /auth/2fa/enable` `{ "code": "123456" }` — cùng cách xác thực; mã đúng → `totp_enabled = TRUE`, trả `{ "recovery_codes": [10 mã] }` (chỉ hiện một lần); mã sai → 401 `TOTP_INVALID`. Nếu xác thực bằng `setup_token` thì sau khi bật, cấp phiên (cookie như login 200).
- `POST /auth/2fa/verify` `{ "challenge_id", "code" }` — `code` là TOTP 6 số hoặc mã khôi phục 10 ký tự. Đúng → 200 như login (cookie + `user`), `challenge_id` hết hiệu lực. Sai → 401 `TOTP_INVALID`, **tính vào bộ đếm khoá tài khoản** (5 lần/15 phút → 423 `ACCOUNT_LOCKED`). Mã khôi phục đã dùng → 401 `TOTP_INVALID`. `challenge_id` hết hạn/không tồn tại → 401 `UNAUTHENTICATED`.
- `POST /users/{id}/2fa/reset` (ADMIN, phiên + CSRF) `{ "reason": "≥ 10 ký tự" }` — xoá bí mật + mã khôi phục, `totp_enabled = FALSE`, thu hồi mọi phiên của người đó (`revoke_user_sessions`), ghi audit `RESET_2FA` (`after_state` chỉ có `reason`, không chứa bí mật). Không phải ADMIN → 403 `FORBIDDEN_ROLE`; ADMIN tự reset chính mình → 403 `FORBIDDEN_ROLE`; thiếu lý do → 422.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test — mỗi dòng ≥ 1 test)
- [ ] TC-SEC-08: ACCOUNTANT chưa bật 2FA → login 403 `TOTP_SETUP_REQUIRED`; ATTORNEY chưa bật → login 200.
- [ ] Luồng đầy đủ: login → `setup_token` → setup → enable bằng mã do `pyotp.TOTP(secret).now()` sinh → nhận 10 mã khôi phục + có phiên; login lần sau → 401 `TOTP_REQUIRED` + `challenge_id` → verify đúng → 200 + `/auth/me` dùng được.
- [ ] Mã lệch ±1 bước được chấp nhận; lệch 3 bước bị từ chối.
- [ ] TC-SEC-09: verify sai 5 lần → lần sau 423 `ACCOUNT_LOCKED` dù mã đúng; một mã khôi phục dùng lần 2 → 401 `TOTP_INVALID`.
- [ ] `challenge_id` dùng lại sau khi verify thành công → 401; `setup_token` không gọi được `/auth/me`.
- [ ] DB: `totp_secret_enc` không chứa bí mật base32 bản rõ; `code_hash` bắt đầu `$argon2id$`; không dòng `audit_logs` nào chứa bí mật/mã khôi phục bản rõ.
- [ ] Reset bởi ADMIN khác: phiên cũ của người bị reset → 401 `TOKEN_REVOKED`, có đúng 1 audit `RESET_2FA`; ATTORNEY gọi → 403; ADMIN tự reset → 403; thiếu lý do → 422.
- [ ] Toàn bộ `backend/tests` (kể cả `test_auth.py`) vẫn xanh.

## 6. Ràng buộc & bẫy cần tránh
- Không sửa test. Không nhánh riêng cho test. Không mock TOTP/Redis/DB trong code sản phẩm.
- So sánh mã bằng `hmac.compare_digest`. Chống phát lại: lưu trong Redis **từng bước** (time-step) đã dùng thành công của user (TTL ≥ 90 s) và từ chối đúng bước đó; các bước khác trong cửa sổ ±1 vẫn hợp lệ.
- Bộ đếm khoá: bước mật khẩu đúng nhưng còn chờ 2FA (`TOTP_REQUIRED`) **không** xoá bộ đếm; chỉ đăng nhập trọn vẹn (cấp phiên) mới xoá. Verify sai cộng vào cùng bộ đếm của tài khoản.
- `audit_logs` chỉ INSERT qua `log_audit_event`.
- **Người viết test:** test chạy với DB dev + Redis cục bộ như `test_auth.py` (tạo user email ngẫu nhiên `tsk17-…@asllaw.vn`, FLUSHDB Redis DB 15). Máy thợ không có DB/Redis → không cần chạy cho đỏ; chỉ cần `python3 -m py_compile backend/tests/test_two_factor.py` qua, trưởng phòng sẽ chạy kiểm đỏ ở máy chính. `verify.sh` phải: `export ACCESS_TOKEN_EXPIRE_MINUTES=30`, đặt `DATA_ENCRYPTION_MASTER_KEY` bằng một khoá test cố định, áp `002_user_recovery_codes.sql` (bỏ qua nếu chưa có file), rồi `.venv/bin/python -m pytest backend/tests -q -p no:cacheprovider`.
