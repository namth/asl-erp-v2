import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Request, Response, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.core.security import get_current_user, verify_csrf
from backend.app.db.postgres import engine
from backend.app.db.redis import get_redis
from backend.app.schemas.auth import (
    LoginRequest,
    PasswordChangeRequest,
    UserProfile,
    LoginData,
    LoginResponse,
    MeData,
    MeResponse
)
from backend.app.services.login_guard import (
    check_ip_rate_limit,
    check_user_lockout,
    record_login_failure,
    reset_login_failures
)
from backend.app.services.passwords import (
    hash_password,
    verify_password,
    verify_dummy_password,
    validate_password_strength
)
from backend.app.services.tokens import (
    create_access_token,
    create_refresh_token,
    create_setup_token,
    create_reset_token,
    create_challenge_id,
    decode_token
)
from backend.app.services.sessions import (
    blocklist_jti,
    revoke_user_sessions,
    get_tokens_valid_after
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

def _get_client_ip(request: Request) -> str:
    """Extracts client IP address safely."""
    client = request.client
    return client.host if client else "127.0.0.1"

@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request, response: Response):
    """Internal user authentication using Argon2id, cookie sessions & brute-force defense."""
    ip = _get_client_ip(request)
    user_agent = request.headers.get("user-agent", "ASL-Client/2.0")

    # Check IP brute-force lockout
    await check_ip_rate_limit(ip)

    # 1. Lookup user by email
    async with engine.connect() as conn:
        res = await conn.execute(
            text("""
                SELECT id, email, password_hash, full_name, title, system_role,
                       is_executive, totp_enabled, must_reset_password, is_active
                FROM users
                WHERE email = :email
            """),
            {"email": payload.email}
        )
        user = res.fetchone()

    # If unknown email -> verify dummy hash & return 401 (identical to wrong password)
    if not user:
        verify_dummy_password(payload.password)
        await record_login_failure(None, ip)
        raise AppException(401, "UNAUTHENTICATED", "Email hoặc mật khẩu không chính xác")

    # 2. Check if user is inactive
    if not user.is_active:
        raise AppException(423, "ACCOUNT_LOCKED", "Tài khoản đã bị vô hiệu hóa")

    # 3. Check if user is temporarily locked out
    await check_user_lockout(user.id)

    # 4. Verify password
    if not verify_password(payload.password, user.password_hash):
        await record_login_failure(user.id, ip)
        raise AppException(401, "UNAUTHENTICATED", "Email hoặc mật khẩu không chính xác")

    # Login succeeded -> reset failure counter
    await reset_login_failures(user.id)

    # 5. Check mandatory password reset
    if user.must_reset_password:
        reset_token = create_reset_token(user.id)
        raise AppException(
            403,
            "PASSWORD_RESET_REQUIRED",
            "Tài khoản bắt buộc phải đặt lại mật khẩu trong lần đầu đăng nhập",
            {"reset_token": reset_token}
        )

    # 6. Check 2FA enabled
    if user.totp_enabled:
        challenge_id = await create_challenge_id(user.id)
        raise AppException(
            401,
            "TOTP_REQUIRED",
            "Tài khoản đã kích hoạt xác thực 2 lớp, vui lòng nhập mã xác thực",
            {"challenge_id": challenge_id}
        )

    # 7. Check roles requiring 2FA setup (ADMIN, MANAGER, ACCOUNTANT)
    if user.system_role in ("ADMIN", "MANAGER", "ACCOUNTANT") and not user.totp_enabled:
        setup_token = create_setup_token(user.id)
        raise AppException(
            403,
            "TOTP_SETUP_REQUIRED",
            "Vai trò quản trị/kế toán bắt buộc phải thiết lập xác thực 2 lớp (TOTP)",
            {"setup_token": setup_token}
        )

    # 8. Issue session: Access Token + Refresh Token + CSRF Token
    access_token = create_access_token(user.id)
    refresh_token_id = uuid.uuid4()
    family_id = uuid.uuid4()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    async with engine.begin() as conn:
        await conn.execute(
            text("""
                INSERT INTO refresh_tokens (id, user_id, family_id, expires_at, ip_address, user_agent)
                VALUES (:id, :user_id, :family_id, :expires_at, :ip_address, :user_agent)
            """),
            {
                "id": refresh_token_id,
                "user_id": user.id,
                "family_id": family_id,
                "expires_at": expires_at,
                "ip_address": ip,
                "user_agent": user_agent
            }
        )

        leader_res = await conn.execute(
            text("SELECT department_id FROM department_leaders WHERE user_id = :user_id"),
            {"user_id": user.id}
        )
        led_depts = [str(r[0]) for r in leader_res.fetchall()]

    csrf_token = secrets.token_urlsafe(32)
    refresh_token_jwt = create_refresh_token(user.id, jti=refresh_token_id)

    # Set secure cookies
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/"
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token_jwt,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/api/v1/auth"
    )
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=False,
        secure=True,
        samesite="strict",
        path="/"
    )

    user_profile = UserProfile(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        title=user.title or "",
        system_role=user.system_role,
        is_executive=bool(user.is_executive),
        led_department_ids=led_depts,
        totp_enabled=bool(user.totp_enabled)
    )

    return LoginResponse(
        success=True,
        data=LoginData(
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=user_profile
        )
    )

@router.post("/refresh", response_model=LoginResponse, dependencies=[Depends(verify_csrf)])
async def refresh_token(request: Request, response: Response):
    """Rotates refresh token and issues a new access token, detecting reuse attempts."""
    ip = _get_client_ip(request)
    user_agent = request.headers.get("user-agent", "ASL-Client/2.0")

    old_refresh_str = request.cookies.get("refresh_token")
    if not old_refresh_str:
        raise AppException(401, "UNAUTHENTICATED", "Thiếu refresh token trong cookie")

    try:
        claims = decode_token(old_refresh_str, expected_type="refresh")
    except AppException:
        raise
    except Exception:
        raise AppException(401, "UNAUTHENTICATED", "Refresh token không hợp lệ")

    token_jti = claims.get("jti")
    token_sub = claims.get("sub")
    if not token_jti or not token_sub:
        raise AppException(401, "UNAUTHENTICATED", "Refresh token không hợp lệ")

    try:
        old_token_id = uuid.UUID(token_jti)
        jwt_user_id = uuid.UUID(token_sub)
    except ValueError:
        raise AppException(401, "UNAUTHENTICATED", "Refresh token không hợp lệ")

    async with engine.connect() as conn:
        trans = await conn.begin()
        try:
            res = await conn.execute(
                text("""
                    SELECT id, user_id, family_id, expires_at, revoked_at, replaced_by, created_at
                    FROM refresh_tokens
                    WHERE id = :token_id
                    FOR UPDATE
                """),
                {"token_id": old_token_id}
            )
            token_row = res.fetchone()

            if not token_row:
                await trans.rollback()
                raise AppException(401, "UNAUTHENTICATED", "Refresh token không tồn tại")

            if token_row.user_id != jwt_user_id:
                await trans.rollback()
                raise AppException(401, "UNAUTHENTICATED", "Refresh token không khớp người dùng")

            # REUSE DETECTION: If token was already revoked, revoke the ENTIRE family!
            if token_row.revoked_at is not None:
                await conn.execute(
                    text("""
                        UPDATE refresh_tokens 
                        SET revoked_at = clock_timestamp() 
                        WHERE family_id = :family_id AND revoked_at IS NULL
                    """),
                    {"family_id": token_row.family_id}
                )
                await trans.commit()
                raise AppException(401, "TOKEN_REVOKED", "Phát hiện dùng lại refresh token đã thu hồi. Toàn bộ phiên bị hủy.")

            # Check expiration
            now_dt = datetime.now(timezone.utc)
            if token_row.expires_at < now_dt:
                await trans.rollback()
                raise AppException(401, "TOKEN_REVOKED", "Refresh token đã hết hạn")

            # Check user status
            user_res = await conn.execute(
                text("""
                    SELECT id, email, full_name, title, system_role, is_executive,
                           totp_enabled, must_reset_password, is_active, tokens_valid_after
                    FROM users
                    WHERE id = :user_id
                """),
                {"user_id": token_row.user_id}
            )
            user = user_res.fetchone()
            if not user or not user.is_active:
                await trans.rollback()
                raise AppException(401, "TOKEN_REVOKED", "Người dùng không tồn tại hoặc tài khoản đã bị khóa")

            valid_after_ts = await get_tokens_valid_after(user.id)
            if int(token_row.created_at.timestamp()) < valid_after_ts:
                await conn.execute(
                    text("UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE id = :token_id"),
                    {"token_id": old_token_id}
                )
                await trans.commit()
                raise AppException(401, "TOKEN_REVOKED", "Phiên làm việc đã bị thu hồi do đổi trạng thái bảo mật")

            # Rotate: Revoke old token and issue replacement in same family
            new_token_id = uuid.uuid4()
            await conn.execute(
                text("""
                    UPDATE refresh_tokens 
                    SET revoked_at = clock_timestamp(), replaced_by = :new_id 
                    WHERE id = :token_id
                """),
                {"new_id": new_token_id, "token_id": old_token_id}
            )

            new_expires_at = now_dt + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
            await conn.execute(
                text("""
                    INSERT INTO refresh_tokens (id, user_id, family_id, expires_at, ip_address, user_agent)
                    VALUES (:id, :user_id, :family_id, :expires_at, :ip_address, :user_agent)
                """),
                {
                    "id": new_token_id,
                    "user_id": user.id,
                    "family_id": token_row.family_id,
                    "expires_at": new_expires_at,
                    "ip_address": ip,
                    "user_agent": user_agent
                }
            )

            leader_res = await conn.execute(
                text("SELECT department_id FROM department_leaders WHERE user_id = :user_id"),
                {"user_id": user.id}
            )
            led_depts = [str(r[0]) for r in leader_res.fetchall()]
            await trans.commit()
        except AppException:
            raise
        except Exception:
            await trans.rollback()
            raise

    access_token = create_access_token(user.id)
    new_refresh_jwt = create_refresh_token(user.id, jti=new_token_id)
    csrf_token = secrets.token_urlsafe(32)

    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/"
    )
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_jwt,
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        httponly=True,
        secure=True,
        samesite="strict",
        path="/api/v1/auth"
    )
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=False,
        secure=True,
        samesite="strict",
        path="/"
    )

    user_profile = UserProfile(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        title=user.title or "",
        system_role=user.system_role,
        is_executive=bool(user.is_executive),
        led_department_ids=led_depts,
        totp_enabled=bool(user.totp_enabled)
    )

    return LoginResponse(
        success=True,
        data=LoginData(
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=user_profile
        )
    )

@router.post("/logout", status_code=204, dependencies=[Depends(verify_csrf)])
async def logout(request: Request, response: Response):
    """Revokes access token JTI via Redis blocklist, revokes refresh token, and clears cookies."""
    token: Optional[str] = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()

    if token:
        try:
            claims = decode_token(token)
            jti = claims.get("jti")
            exp = claims.get("exp", int(time.time()) + 1800)
            if jti:
                await blocklist_jti(jti, exp)
        except Exception:
            pass

    refresh_token_str = request.cookies.get("refresh_token")
    if refresh_token_str:
        try:
            if "." in refresh_token_str:
                claims = decode_token(refresh_token_str, expected_type="refresh")
                token_id = uuid.UUID(claims["jti"])
            else:
                token_id = uuid.UUID(refresh_token_str)
            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE refresh_tokens SET revoked_at = clock_timestamp() WHERE id = :token_id AND revoked_at IS NULL"),
                    {"token_id": token_id}
                )
        except Exception:
            pass

    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/api/v1/auth")
    response.delete_cookie(key="refresh_token", path="/")
    response.delete_cookie(key="csrf_token", path="/")

    return Response(status_code=204)

@router.get("/me", response_model=MeResponse)
async def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Returns profile for currently authenticated user."""
    profile = UserProfile(
        id=current_user["id"],
        email=current_user["email"],
        full_name=current_user["full_name"],
        title=current_user.get("title", ""),
        system_role=current_user["system_role"],
        is_executive=current_user.get("is_executive", False),
        led_department_ids=current_user.get("led_department_ids", []),
        totp_enabled=current_user.get("totp_enabled", False)
    )
    return MeResponse(success=True, data=MeData(user=profile))

@router.post("/password", status_code=204, dependencies=[Depends(verify_csrf)])
async def change_or_reset_password(
    payload: PasswordChangeRequest,
    request: Request
):
    """Changes password for logged in user or executes mandatory reset with reset_token."""
    auth_header = request.headers.get("Authorization", "")

    # Flow (b): Mandatory password reset via Bearer reset_token
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        claims = decode_token(token, expected_type="password_reset")
        jti = claims.get("jti")
        sub = claims.get("sub")
        if not jti or not sub:
            raise AppException(401, "UNAUTHENTICATED", "Token đặt lại mật khẩu không hợp lệ")

        r = get_redis()
        if await r.get(f"used_reset_token:{jti}"):
            raise AppException(401, "UNAUTHENTICATED", "reset_token chỉ dùng một lần")

        # Validate password policy
        validate_password_strength(payload.new_password, "new_password")

        user_id = uuid.UUID(sub)
        new_hash = hash_password(payload.new_password)

        # Mark JTI used in Redis
        await r.set(f"used_reset_token:{jti}", "1", ex=86400)

        # Update user in DB
        async with engine.begin() as conn:
            await conn.execute(
                text("""
                    UPDATE users 
                    SET password_hash = :hash, must_reset_password = FALSE 
                    WHERE id = :user_id
                """),
                {"hash": new_hash, "user_id": user_id}
            )

        await revoke_user_sessions(user_id)
        return Response(status_code=204)

    # Flow (a): Logged-in user changing password (requires current_password)
    current_user = await get_current_user(request)
    user_id = uuid.UUID(current_user["id"])

    if not payload.current_password:
        raise AppException(401, "UNAUTHENTICATED", "Thiếu mật khẩu hiện tại")

    async with engine.connect() as conn:
        res = await conn.execute(
            text("SELECT password_hash FROM users WHERE id = :user_id"),
            {"user_id": user_id}
        )
        row = res.fetchone()
        if not row:
            raise AppException(401, "UNAUTHENTICATED", "Người dùng không tồn tại")
        user_hash = row[0]

    if not verify_password(payload.current_password, user_hash):
        raise AppException(401, "UNAUTHENTICATED", "Mật khẩu hiện tại không chính xác")

    validate_password_strength(payload.new_password, "new_password")
    new_hash = hash_password(payload.new_password)

    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET password_hash = :hash WHERE id = :user_id"),
            {"hash": new_hash, "user_id": user_id}
        )

    await revoke_user_sessions(user_id)
    return Response(status_code=204)
