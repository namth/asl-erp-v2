import time
import uuid
from typing import Optional, Dict, Any
import jwt
from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.db.redis import get_redis

def create_access_token(user_id: str | uuid.UUID, jti: Optional[str] = None) -> str:
    """Creates a 30-minute JWT access token with unique JTI."""
    now = int(time.time())
    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "jti": jti or str(uuid.uuid4()),
        "iat": now,
        "exp": now + (settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60),
        "typ": "access"
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def create_refresh_token(user_id: str | uuid.UUID, jti: Optional[str | uuid.UUID] = None) -> str:
    """Creates a JWT refresh token (typ='refresh') with jti matching refresh_tokens.id."""
    now = int(time.time())
    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "jti": str(jti or uuid.uuid4()),
        "iat": now,
        "exp": now + (settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400),
        "typ": "refresh"
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def create_setup_token(user_id: str | uuid.UUID) -> str:
    """Creates a short-lived TOTP setup token (typ='totp_setup')."""
    now = int(time.time())
    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + 900,
        "typ": "totp_setup"
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def create_reset_token(user_id: str | uuid.UUID) -> str:
    """Creates a short-lived one-time password reset token (typ='password_reset')."""
    now = int(time.time())
    payload: Dict[str, Any] = {
        "sub": str(user_id),
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + 900,
        "typ": "password_reset"
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

async def create_challenge_id(user_id: str | uuid.UUID) -> str:
    """Generates a challenge_id stored in Redis with 300s TTL."""
    challenge_id = uuid.uuid4().hex
    r = get_redis()
    await r.set(f"totp_challenge:{challenge_id}", str(user_id), ex=300)
    return challenge_id

async def get_challenge_user_id(challenge_id: str) -> Optional[uuid.UUID]:
    """Retrieves the user_id associated with a challenge_id from Redis if not expired."""
    r = get_redis()
    val = await r.get(f"totp_challenge:{challenge_id}")
    if not val:
        return None
    try:
        return uuid.UUID(val)
    except ValueError:
        return None

async def delete_challenge_id(challenge_id: str) -> None:
    """Deletes a challenge_id from Redis once successfully consumed."""
    r = get_redis()
    await r.delete(f"totp_challenge:{challenge_id}")

def decode_token(token: str, expected_type: Optional[str] = None) -> Dict[str, Any]:
    """Decodes and validates a JWT token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise AppException(401, "UNAUTHENTICATED", "Token đã hết hạn")
    except jwt.InvalidTokenError:
        raise AppException(401, "UNAUTHENTICATED", "Token không hợp lệ")

    if expected_type is not None and payload.get("typ") != expected_type:
        raise AppException(401, "UNAUTHENTICATED", f"Loại token không hợp lệ (yêu cầu {expected_type})")

    return payload
