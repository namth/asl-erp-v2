import time
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import text
from backend.app.db.postgres import engine
from backend.app.db.redis import get_redis

async def revoke_user_sessions(user_id: uuid.UUID) -> None:
    """Revokes all active sessions for a user by updating tokens_valid_after,

    caching to Redis, and marking all refresh tokens revoked.
    """
    async with engine.begin() as conn:
        res = await conn.execute(
            text("""
                UPDATE users 
                SET tokens_valid_after = clock_timestamp() 
                WHERE id = :user_id 
                RETURNING tokens_valid_after
            """),
            {"user_id": user_id}
        )
        row = res.fetchone()
        valid_after: Optional[datetime] = row[0] if row else None

        await conn.execute(
            text("""
                UPDATE refresh_tokens 
                SET revoked_at = clock_timestamp() 
                WHERE user_id = :user_id AND revoked_at IS NULL
            """),
            {"user_id": user_id}
        )

    r = get_redis()
    if valid_after is not None:
        ts = int(valid_after.timestamp())
        await r.set(f"tokens_valid_after:{user_id}", str(ts))
    else:
        now_ts = int(time.time())
        await r.set(f"tokens_valid_after:{user_id}", str(now_ts))

async def get_tokens_valid_after(user_id: uuid.UUID) -> int:
    """Gets the tokens_valid_after timestamp (in seconds) for a user from Redis or DB."""
    r = get_redis()
    cached = await r.get(f"tokens_valid_after:{user_id}")
    if cached is not None:
        try:
            return int(cached)
        except ValueError:
            pass

    async with engine.connect() as conn:
        res = await conn.execute(
            text("SELECT tokens_valid_after FROM users WHERE id = :user_id"),
            {"user_id": user_id}
        )
        row = res.fetchone()
        if row and row[0]:
            ts = int(row[0].timestamp())
        else:
            ts = 0

    await r.set(f"tokens_valid_after:{user_id}", str(ts), ex=3600)
    return ts

async def blocklist_jti(jti: str, exp: int) -> None:
    """Adds a JTI to Redis blocklist until expiration."""
    ttl = max(1, exp - int(time.time()))
    r = get_redis()
    await r.set(f"blocklist:jti:{jti}", "revoked", ex=ttl)

async def is_jti_blocklisted(jti: str) -> bool:
    """Checks if a JTI is in the Redis blocklist."""
    r = get_redis()
    val = await r.get(f"blocklist:jti:{jti}")
    return val is not None
