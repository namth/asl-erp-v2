import hmac
import secrets
import string
import time
import uuid
from typing import List, Union
import pyotp
from argon2 import PasswordHasher
from argon2.low_level import Type
from sqlalchemy import text

from backend.app.core.config import settings
from backend.app.db.postgres import engine
from backend.app.db.redis import get_redis

RECOVERY_HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4, type=Type.ID)

def generate_totp_secret() -> str:
    """Sinh bí mật TOTP base32 ngẫu nhiên an toàn theo RFC 6238."""
    return pyotp.random_base32()

def get_otpauth_uri(secret: str, email: str) -> str:
    """Tạo URI otpauth:// theo chuẩn Google Authenticator."""
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=email, issuer_name=settings.TOTP_ISSUER)
    return uri.replace("%40", "@")

async def verify_totp_code(
    secret: str,
    code: str,
    user_id: Union[str, uuid.UUID],
    record_replay: bool = True
) -> bool:
    """Xác thực mã TOTP 6 số trong cửa sổ lệch +-1 bước (30s).
    
    Sử dụng hmac.compare_digest chống tấn công đo thời gian (timing attacks).
    Chống phát lại (anti-replay): kiểm tra và lưu vết từng bước thời gian (step)
    đã dùng vào Redis với TTL 120s (khi record_replay=True).
    """
    clean_code = code.strip()
    if len(clean_code) != 6 or not clean_code.isdigit():
        return False

    totp = pyotp.TOTP(secret)
    current_time = time.time()
    current_step = int(current_time // 30)

    matched_step = None
    for offset in (0, -1, 1):
        step = current_step + offset
        step_time = step * 30
        expected_code = totp.at(step_time)
        if hmac.compare_digest(clean_code, expected_code):
            matched_step = step
            break

    if matched_step is None:
        return False

    if record_replay:
        # Chống phát lại trong cùng bước thời gian
        r = get_redis()
        replay_key = f"totp_used_step:{user_id}:{matched_step}"
        # SET NX nguyên tử: hai request đồng thời cùng mã chỉ một cái qua (TTL 120s >= 90s)
        if not await r.set(replay_key, "1", ex=120, nx=True):
            return False

    return True

def generate_recovery_codes() -> List[str]:
    """Sinh 10 mã khôi phục ngẫu nhiên, mỗi mã 10 ký tự [A-Z0-9]."""
    alphabet = string.ascii_uppercase + string.digits
    return ["".join(secrets.choice(alphabet) for _ in range(10)) for _ in range(10)]

def hash_recovery_code(code: str) -> str:
    """Băm mã khôi phục bằng thuật toán Argon2id chuẩn OWASP."""
    return RECOVERY_HASHER.hash(code.strip().upper())

async def verify_and_consume_recovery_code(user_id: uuid.UUID, code: str) -> bool:
    """Kiểm tra mã khôi phục 10 ký tự [A-Z0-9] của người dùng.
    
    Nếu đúng và chưa dùng -> cập nhật used_at và trả về True.
    Nếu đã dùng hoặc không khớp -> trả về False.
    """
    clean_code = code.strip().upper()
    if len(clean_code) != 10 or not clean_code.isalnum():
        return False

    async with engine.connect() as conn:
        res = await conn.execute(
            text("SELECT id, code_hash, used_at FROM user_recovery_codes WHERE user_id = :user_id"),
            {"user_id": user_id}
        )
        rows = res.fetchall()

    for row_id, code_hash, used_at in rows:
        try:
            if RECOVERY_HASHER.verify(code_hash, clean_code):
                if used_at is not None:
                    # Mã đã từng sử dụng -> từ chối dùng lại
                    return False
                # Mã hợp lệ và chưa dùng -> đánh dấu used_at ngay lập tức
                async with engine.begin() as conn:
                    await conn.execute(
                        text("UPDATE user_recovery_codes SET used_at = clock_timestamp() WHERE id = :id"),
                        {"id": row_id}
                    )
                return True
        except Exception:
            pass

    return False
