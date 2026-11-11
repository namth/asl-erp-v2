import re
from argon2 import PasswordHasher
from argon2.low_level import Type
from backend.app.core.errors import AppException

hasher = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    type=Type.ID
)

# Dummy hash for timing attack mitigation when email is not found
DUMMY_HASH = hasher.hash("AslDummyTimingPassword@2026")

SPECIAL_CHARS = set("!@#$%^&*()_+-=[]{}|;':\",./<>?`~\\")

def validate_password_strength(password: str, field_name: str = "new_password") -> None:
    """Validates password meets ASL LAW security policy (docs/10 §2.2)."""
    if len(password) < 10:
        raise AppException(
            422,
            "VALIDATION_ERROR",
            "Mật khẩu phải có tối thiểu 10 ký tự",
            {"fields": [{"field": field_name, "message": "Mật khẩu phải có tối thiểu 10 ký tự"}]}
        )
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    has_special = any(c in SPECIAL_CHARS for c in password)

    if not (has_upper and has_lower and has_digit and has_special):
        raise AppException(
            422,
            "VALIDATION_ERROR",
            "Mật khẩu phải chứa ít nhất một chữ hoa, chữ thường, chữ số và ký tự đặc biệt",
            {"fields": [{"field": field_name, "message": "Mật khẩu phải chứa ít nhất một chữ hoa, chữ thường, chữ số và ký tự đặc biệt"}]}
        )

def hash_password(password: str) -> str:
    """Hashes a plaintext password using Argon2id."""
    return hasher.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against an Argon2id hash."""
    try:
        return hasher.verify(hashed_password, plain_password)
    except Exception:
        return False

def verify_dummy_password(plain_password: str) -> None:
    """Performs dummy verification to equalize execution time on failed lookups."""
    try:
        hasher.verify(DUMMY_HASH, plain_password)
    except Exception:
        pass
