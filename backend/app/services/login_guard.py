import logging
import uuid
from typing import Optional
import psycopg
from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.db.redis import get_redis
from backend.app.services.audit import log_audit_event

logger = logging.getLogger(__name__)

async def check_ip_rate_limit(ip_address: str) -> None:
    """Checks whether the client IP has exceeded the 20 failures/15m threshold."""
    r = get_redis()
    key = f"failed_login:ip:{ip_address}"
    cnt_str = await r.get(key)
    if cnt_str is not None:
        try:
            cnt = int(cnt_str)
            if cnt >= 20:
                ttl = await r.ttl(key)
                raise AppException(
                    429,
                    "RATE_LIMITED",
                    "Quá nhiều lần đăng nhập không thành công từ địa chỉ IP này. Vui lòng thử lại sau.",
                    {"retry_after_seconds": max(1, ttl)}
                )
        except ValueError:
            pass

async def check_user_lockout(user_id: uuid.UUID) -> None:
    """Checks whether the user account is temporarily locked due to brute-force."""
    r = get_redis()
    lockout_key = f"lockout:user:{user_id}"
    ttl = await r.ttl(lockout_key)
    if ttl > 0:
        raise AppException(
            423,
            "ACCOUNT_LOCKED",
            "Tài khoản tạm thời bị khóa do nhập sai mật khẩu nhiều lần",
            {"retry_after_seconds": ttl}
        )

async def record_login_failure(user_id: Optional[uuid.UUID], ip_address: str) -> None:
    """Increments failure counters for IP and user account. Locks account on 5th failure."""
    r = get_redis()

    # Track IP failures (15 min window)
    ip_key = f"failed_login:ip:{ip_address}"
    ip_cnt = await r.incr(ip_key)
    if ip_cnt == 1:
        await r.expire(ip_key, 900)

    # Track user failures (15 min window)
    if user_id is not None:
        user_key = f"failed_login:user:{user_id}"
        cnt = await r.incr(user_key)
        if cnt == 1:
            await r.expire(user_key, 900)
        elif cnt >= 5:
            # 5th failure: lock for 30 minutes (1800s)
            lockout_key = f"lockout:user:{user_id}"
            await r.set(lockout_key, "1", ex=1800)
            await r.delete(user_key)

            # Record exactly 1 audit log entry (actor SYSTEM)
            try:
                with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
                    log_audit_event(
                        conn,
                        actor_type="SYSTEM",
                        action="ACCOUNT_LOCKED",
                        entity_name="users",
                        entity_id=str(user_id),
                        after_state={"reason": "BRUTE_FORCE_5_FAILURES", "lockout_seconds": 1800},
                        ip_address=ip_address
                    )
            except Exception:
                logger.exception("Failed to record ACCOUNT_LOCKED audit log for user_id=%s", user_id)

async def reset_login_failures(user_id: uuid.UUID) -> None:
    """Resets the failed login counter for a user upon successful authentication."""
    r = get_redis()
    await r.delete(f"failed_login:user:{user_id}")
