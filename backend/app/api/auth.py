import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Request, Response, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
import jwt
import psycopg

from backend.app.core.config import settings
from backend.app.core.crypto import encrypt_aes_gcm, decrypt_aes_gcm
from backend.app.core.errors import AppException
import backend.app.core.security as core_security
from backend.app.core.security import get_current_user
from backend.app.db.postgres import engine
from backend.app.db.redis import get_redis
from backend.app.schemas.auth import (
    LoginRequest,
    PasswordChangeRequest,
    UserProfile,
    LoginData,
    LoginResponse,
    MeData,
    MeResponse,
    TwoFactorSetupResponse,
    TwoFactorSetupData,
    TwoFactorEnableRequest,
    TwoFactorEnableResponse,
    TwoFactorEnableData,
    TwoFactorVerifyRequest,
    Reset2FARequest
)
from backend.app.services.audit import log_audit_event
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
    get_challenge_user_id,
    delete_challenge_id,
    decode_token
)
from backend.app.services.sessions import (
    blocklist_jti,
    revoke_user_sessions,
    get_tokens_valid_after
)
from backend.app.services.totp import (
    generate_totp_secret,
    get_otpauth_uri,
    verify_totp_code,
    generate_recovery_codes,
    hash_recovery_code,
    verify_and_consume_recovery_code
)

# Patch verify_csrf to support 2FA endpoints & Bearer totp_setup
_original_verify_csrf = core_security.verify_csrf

def verify_csrf(request: Request) -> None:
    """Validates CSRF token on write operations, exempting login, 2fa/verify, and bearer tokens."""
    if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
        return

    path = request.url.path
    if path.endswith("/auth/login") or path.endswith("/auth/2fa/verify"):
        return

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
            if payload.get("typ") == "password_reset":
                return
            if payload.get("typ") == "totp_setup":
                if path.endswith("/auth/2fa/setup") or path.endswith("/auth/2fa/enable"):
                    return
                raise AppException(401, "UNAUTHENTICATED", "setup_token không thể dùng cho endpoint này")
        except AppException:
            raise
        except Exception:
            pass

    return _original_verify_csrf(request)

core_security.verify_csrf = verify_csrf

router = APIRouter(tags=["Authentication"])

def _get_client_ip(request: Request) -> str:
    """Extracts client IP address safely."""
    client = request.client
    return client.host if client else "127.0.0.1"

async def _issue_session(user_id: uuid.UUID, request: Request, response: Response) -> tuple[UserProfile, int]:
    """Issues access token, refresh token, CSRF token cookies, and returns (user_profile, expires_in)."""
    ip = _get_client_ip(request)
    user_agent = request.headers.get("user-agent", "ASL-Client/2.0")

    access_token = create_access_token(user_id)
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
                "user_id": user_id,
                "family_id": family_id,
                "expires_at": expires_at,
                "ip_address": ip,
                "user_agent": user_agent
            }
        )

        res = await conn.execute(
            text("""
                SELECT id, email, full_name, title, system_role, is_executive, totp_enabled
                FROM users WHERE id = :user_id
            """),
            {"user_id": user_id}
        )
        user = res.fetchone()

        leader_res = await conn.execute(
            text("SELECT department_id FROM department_leaders WHERE user_id = :user_id"),
            {"user_id": user_id}
        )
        led_depts = [str(r[0]) for r in leader_res.fetchall()]

    csrf_token = secrets.token_urlsafe(32)
    refresh_token_jwt = create_refresh_token(user_id, jti=refresh_token_id)

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

    profile = UserProfile(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        title=user.title or "",
        system_role=user.system_role,
        is_executive=bool(user.is_executive),
        led_department_ids=led_depts,
        totp_enabled=bool(user.totp_enabled)
    )
    return profile, settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60

@router.post("/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request, response: Response):
    """Internal user authentication using Argon2id, cookie sessions & brute-force defense."""
    ip = _get_client_ip(request)

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
    if user.system_role in settings.TOTP_REQUIRED_ROLES and not user.totp_enabled:
        setup_token = create_setup_token(user.id)
        raise AppException(
            403,
            "TOTP_SETUP_REQUIRED",
            "Vai trò quản trị/kế toán bắt buộc phải thiết lập xác thực 2 lớp (TOTP)",
            {"setup_token": setup_token}
        )

    # 8. Issue session (only resets failure counter when session is actually issued)
    await reset_login_failures(user.id)
    user_profile, expires_in = await _issue_session(user.id, request, response)

    return LoginResponse(
        success=True,
        data=LoginData(
            expires_in=expires_in,
            user=user_profile
        )
    )

async def _get_2fa_setup_user(request: Request) -> tuple[dict, bool]:
    """Authenticates 2FA setup/enable request via setup_token or cookie session."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
        claims = decode_token(token, expected_type="totp_setup")
        sub = claims.get("sub")
        if not sub:
            raise AppException(401, "UNAUTHENTICATED", "setup_token không hợp lệ")
        try:
            user_id = uuid.UUID(sub)
        except ValueError:
            raise AppException(401, "UNAUTHENTICATED", "setup_token không hợp lệ")

        async with engine.connect() as conn:
            res = await conn.execute(
                text("""
                    SELECT id, email, full_name, title, system_role,
                           is_executive, totp_enabled, must_reset_password, is_active
                    FROM users WHERE id = :user_id
                """),
                {"user_id": user_id}
            )
            row = res.fetchone()
        if not row or not row.is_active:
            raise AppException(401, "UNAUTHENTICATED", "Người dùng không tồn tại hoặc đã bị vô hiệu hoá")
        return {
            "id": str(row.id),
            "email": row.email,
            "full_name": row.full_name,
            "title": row.title or "",
            "system_role": row.system_role,
            "is_executive": bool(row.is_executive),
            "totp_enabled": bool(row.totp_enabled),
            "must_reset_password": bool(row.must_reset_password),
            "is_active": bool(row.is_active)
        }, True

    # Otherwise must be cookie session with CSRF
    verify_csrf(request)
    current_user = await get_current_user(request)
    return current_user, False

@router.post("/auth/2fa/setup", response_model=TwoFactorSetupResponse, dependencies=[Depends(verify_csrf)])
async def setup_two_factor(request: Request):
    """Generates a new TOTP secret & QR URI for setup_token or logged in user."""
    user, is_setup_token = await _get_2fa_setup_user(request)
    user_id = uuid.UUID(user["id"])

    secret = generate_totp_secret()
    otpauth_uri = get_otpauth_uri(secret, user["email"])
    secret_enc = encrypt_aes_gcm(secret)

    async with engine.begin() as conn:
        await conn.execute(
            text("""
                UPDATE users 
                SET totp_secret_enc = :enc, totp_enabled = FALSE 
                WHERE id = :user_id
            """),
            {"enc": secret_enc, "user_id": user_id}
        )

    return TwoFactorSetupResponse(
        success=True,
        data=TwoFactorSetupData(
            secret=secret,
            otpauth_uri=otpauth_uri
        )
    )

@router.post("/auth/2fa/enable", response_model=TwoFactorEnableResponse, dependencies=[Depends(verify_csrf)])
async def enable_two_factor(payload: TwoFactorEnableRequest, request: Request, response: Response):
    """Validates code against pending secret, enables 2FA, generates recovery codes, and issues session if setup_token."""
    user, is_setup_token = await _get_2fa_setup_user(request)
    user_id = uuid.UUID(user["id"])

    async with engine.connect() as conn:
        res = await conn.execute(
            text("SELECT totp_secret_enc FROM users WHERE id = :user_id"),
            {"user_id": user_id}
        )
        row = res.fetchone()

    if not row or not row.totp_secret_enc:
        raise AppException(401, "TOTP_INVALID", "Chưa khởi tạo thiết lập 2FA")

    secret = decrypt_aes_gcm(row.totp_secret_enc)
    is_valid = await verify_totp_code(secret, payload.code, user_id, record_replay=False)
    if not is_valid:
        raise AppException(401, "TOTP_INVALID", "Mã xác thực 2 lớp không chính xác")

    codes = generate_recovery_codes()

    async with engine.begin() as conn:
        await conn.execute(
            text("DELETE FROM user_recovery_codes WHERE user_id = :user_id"),
            {"user_id": user_id}
        )
        for c in codes:
            code_hash = hash_recovery_code(c)
            await conn.execute(
                text("""
                    INSERT INTO user_recovery_codes (id, user_id, code_hash, created_at)
                    VALUES (:id, :user_id, :code_hash, clock_timestamp())
                """),
                {"id": uuid.uuid4(), "user_id": user_id, "code_hash": code_hash}
            )
        await conn.execute(
            text("UPDATE users SET totp_enabled = TRUE WHERE id = :user_id"),
            {"user_id": user_id}
        )

    if is_setup_token:
        await _issue_session(user_id, request, response)
        await reset_login_failures(user_id)

    return TwoFactorEnableResponse(
        success=True,
        data=TwoFactorEnableData(
            recovery_codes=codes
        )
    )

@router.post("/auth/2fa/verify", response_model=LoginResponse, dependencies=[Depends(verify_csrf)])
async def verify_two_factor(payload: TwoFactorVerifyRequest, request: Request, response: Response):
    """Verifies step 2 using challenge_id with TOTP code or one-time recovery code."""
    ip = _get_client_ip(request)

    # 1. Lookup challenge in Redis
    user_id = await get_challenge_user_id(payload.challenge_id)
    if not user_id:
        raise AppException(401, "UNAUTHENTICATED", "Yêu cầu xác thực 2 lớp không tồn tại hoặc đã hết hạn")

    # 2. Check if user account is locked
    await check_user_lockout(user_id)

    # 3. Lookup user in DB
    async with engine.connect() as conn:
        res = await conn.execute(
            text("""
                SELECT id, email, full_name, title, system_role,
                       is_executive, totp_enabled, totp_secret_enc, is_active
                FROM users WHERE id = :user_id
            """),
            {"user_id": user_id}
        )
        user = res.fetchone()

    if not user or not user.is_active:
        raise AppException(423, "ACCOUNT_LOCKED", "Tài khoản đã bị vô hiệu hoá")

    # 4. Verify code (TOTP 6 digits or Recovery code 10 chars)
    code_str = payload.code.strip()
    is_valid = False

    if len(code_str) == 6 and user.totp_secret_enc:
        secret = decrypt_aes_gcm(user.totp_secret_enc)
        is_valid = await verify_totp_code(secret, code_str, user_id)
    elif len(code_str) == 10:
        is_valid = await verify_and_consume_recovery_code(user_id, code_str)

    if not is_valid:
        await record_login_failure(user_id, ip)
        raise AppException(401, "TOTP_INVALID", "Mã xác thực không chính xác hoặc đã qua sử dụng")

    # Success: invalidate challenge, reset failures, issue session
    await delete_challenge_id(payload.challenge_id)
    await reset_login_failures(user_id)
    user_profile, expires_in = await _issue_session(user_id, request, response)

    return LoginResponse(
        success=True,
        data=LoginData(
            expires_in=expires_in,
            user=user_profile
        )
    )

@router.post("/users/{id}/2fa/reset", status_code=200, dependencies=[Depends(verify_csrf)])
async def reset_user_2fa(
    id: uuid.UUID,
    payload: Reset2FARequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Admin-only reset of 2FA for a user with audit logging and session revocation."""
    ip = _get_client_ip(request)
    user_agent = request.headers.get("user-agent", "ASL-Client/2.0")

    # Permissions: Only ADMIN can reset
    if current_user["system_role"] != "ADMIN":
        raise AppException(403, "FORBIDDEN", "Chỉ Quản trị viên mới có quyền đặt lại 2FA")

    # Admin cannot reset own 2FA
    if str(current_user["id"]) == str(id):
        raise AppException(403, "FORBIDDEN", "Quản trị viên không được tự đặt lại 2FA của chính mình")

    # Check target exists
    async with engine.connect() as conn:
        res = await conn.execute(
            text("SELECT id FROM users WHERE id = :id"),
            {"id": id}
        )
        if not res.fetchone():
            raise AppException(404, "NOT_FOUND", "Người dùng không tồn tại")

    # Clear 2FA credentials
    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET totp_enabled = FALSE, totp_secret_enc = NULL WHERE id = :id"),
            {"id": id}
        )
        await conn.execute(
            text("DELETE FROM user_recovery_codes WHERE user_id = :id"),
            {"id": id}
        )

    # Revoke target user's active sessions immediately
    await revoke_user_sessions(id)

    # Record immutable audit event
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
        log_audit_event(
            conn,
            actor_type="USER",
            action="RESET_2FA",
            entity_name="users",
            entity_id=str(id),
            actor_id=str(current_user["id"]),
            after_state={"reason": payload.reason},
            ip_address=ip,
            user_agent=user_agent
        )

    return {"success": True}

@router.post("/auth/refresh", response_model=LoginResponse, dependencies=[Depends(verify_csrf)])
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

@router.post("/auth/logout", status_code=204, dependencies=[Depends(verify_csrf)])
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

@router.get("/auth/me", response_model=MeResponse)
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

@router.post("/auth/password", status_code=204, dependencies=[Depends(verify_csrf)])
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
