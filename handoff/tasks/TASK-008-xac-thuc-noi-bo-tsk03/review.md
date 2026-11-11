# Nghiệm thu TASK-008 — vòng 1: CHƯA ĐẠT (3 mục)

Phần đạt, giữ nguyên: login/logout/me/password, cookie Secure+HttpOnly+SameSite=Strict, CSRF so `hmac.compare_digest`, blocklist `jti`, `tokens_valid_after`, khoá 5 lần/30 phút có audit, giới hạn IP, `NullPool` sửa lỗi event loop.
Ghi chú: mục 1–2 là chỗ đặc tả/test vòng trước còn hở (lỗi của trưởng phòng) — đã thêm test và khoá lại. Đặc tả cho phép "giá trị ngẫu nhiên **hoặc** JWT chứa `jti`"; vòng này chốt: dùng JWT.

1. **`backend/app/api/auth.py` (login, refresh) + `services/tokens.py` — refresh token chính là `refresh_tokens.id` lưu nguyên văn.** Lộ bảng (bản sao lưu, quyền đọc DB) là chiếm được phiên.
   **Kỳ vọng:** cookie `refresh_token` = JWT HS256 ký bằng `SECRET_KEY`, `typ="refresh"`, `jti` = `refresh_tokens.id`, `sub` = user id, `exp` theo `REFRESH_TOKEN_EXPIRE_DAYS`. `/auth/refresh` giải mã + kiểm chữ ký/`typ` trước khi tra DB; UUID trần → 401. Không token phụ nào (`access`, `totp_setup`, `password_reset`) dùng được làm refresh. Test: `test_refresh_token_cannot_be_forged_from_db_ids`.
2. **`/auth/refresh` — không khoá dòng khi xoay vòng:** 4 request đồng thời cùng token → nhiều lần 200.
   **Kỳ vọng:** đọc dòng bằng `SELECT … FOR UPDATE` trong cùng transaction với UPDATE/INSERT (hoặc `UPDATE … WHERE id = :id AND revoked_at IS NULL RETURNING …` và chỉ xoay khi có dòng trả về). Request thua cuộc coi là dùng lại → `401 TOKEN_REVOKED`. Test: `test_concurrent_refresh_with_same_token_rotates_once`.
3. **`services/login_guard.py` — `except Exception: pass` khi ghi audit `ACCOUNT_LOCKED`.** Mất audit khoá tài khoản mà không ai biết.
   **Kỳ vọng:** không nuốt lỗi im lặng — `logging.getLogger(__name__).exception(...)` (không ghi bí mật). Việc khoá vẫn giữ nguyên dù audit lỗi.

Test mới `test_every_write_route_requires_csrf` đã xanh — giữ nguyên cách gắn `verify_csrf`.
Tự kiểm: `python3 scripts/handoff.py verify TASK-008` (toàn bộ `backend/tests`).
