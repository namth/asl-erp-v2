import hmac
import uuid
from typing import Optional, Dict, Any, List
from fastapi import Request, Depends
from sqlalchemy import text
import jwt

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.db.postgres import engine
from backend.app.services.sessions import is_jti_blocklisted, get_tokens_valid_after

def verify_csrf(request: Request) -> None:
    """Validates CSRF token on write operations using double-submit cookie pattern."""
    if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
        return

    path = request.url.path
    if path.endswith("/auth/login"):
        return

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
            if payload.get("typ") == "password_reset":
                return
        except Exception:
            pass

    cookie_csrf = request.cookies.get("csrf_token")
    header_csrf = request.headers.get("X-CSRF-Token")

    if not cookie_csrf or not header_csrf:
        raise AppException(403, "CSRF_INVALID", "Thiếu CSRF token hợp lệ")

    if not hmac.compare_digest(cookie_csrf, header_csrf):
        raise AppException(403, "CSRF_INVALID", "CSRF token không hợp lệ")

async def get_current_user(request: Request) -> Dict[str, Any]:
    """Dependency that extracts, verifies access token, and returns active user.

    Only tokens with typ='access' are accepted.
    """
    token: Optional[str] = None
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        token = cookie_token
    else:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()

    if not token:
        raise AppException(401, "UNAUTHENTICATED", "Chưa xác thực hoặc thiếu token truy cập")

    try:
        claims = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise AppException(401, "UNAUTHENTICATED", "Access token đã hết hạn")
    except jwt.InvalidTokenError:
        raise AppException(401, "UNAUTHENTICATED", "Access token không hợp lệ")

    if claims.get("typ") != "access":
        raise AppException(401, "UNAUTHENTICATED", "Chỉ chấp nhận token truy cập (typ='access')")

    jti = claims.get("jti")
    if jti and await is_jti_blocklisted(jti):
        raise AppException(401, "TOKEN_REVOKED", "Token đã bị thu hồi (blocklist)")

    user_id_str = claims.get("sub")
    if not user_id_str:
        raise AppException(401, "UNAUTHENTICATED", "Token thiếu thông tin người dùng")

    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise AppException(401, "UNAUTHENTICATED", "Định danh người dùng không hợp lệ")

    # Check tokens_valid_after threshold
    valid_after_ts = await get_tokens_valid_after(user_id)
    token_iat = claims.get("iat", 0)
    if token_iat < valid_after_ts:
        raise AppException(401, "TOKEN_REVOKED", "Phiên làm việc đã bị thu hồi do đổi trạng thái bảo mật")

    async with engine.connect() as conn:
        res = await conn.execute(
            text("""
                SELECT id, email, full_name, title, system_role,
                       is_executive, totp_enabled, must_reset_password, is_active
                FROM users
                WHERE id = :user_id
            """),
            {"user_id": user_id}
        )
        row = res.fetchone()
        if not row:
            raise AppException(401, "UNAUTHENTICATED", "Người dùng không tồn tại")

        if not row.is_active:
            raise AppException(401, "TOKEN_REVOKED", "Tài khoản người dùng đã bị vô hiệu hóa")

        # Fetch led department IDs
        leader_res = await conn.execute(
            text("SELECT department_id FROM department_leaders WHERE user_id = :user_id"),
            {"user_id": user_id}
        )
        led_depts = [str(r[0]) for r in leader_res.fetchall()]

    return {
        "id": str(row.id),
        "email": row.email,
        "full_name": row.full_name,
        "title": row.title or "",
        "system_role": row.system_role,
        "is_executive": bool(row.is_executive),
        "totp_enabled": bool(row.totp_enabled),
        "must_reset_password": bool(row.must_reset_password),
        "is_active": bool(row.is_active),
        "led_department_ids": led_depts
    }
