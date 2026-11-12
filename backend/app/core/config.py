import os
import psycopg
from psycopg.adapt import Loader
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Chỉ cho development/test — không bao giờ dùng ở production.
_DEV_DATA_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="
_DEV_FILE_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="

class StrUuidLoader(Loader):
    def load(self, data: memoryview | bytes) -> str:
        return bytes(data).decode("ascii")

psycopg.adapters.register_loader("uuid", StrUuidLoader)

class Settings(BaseSettings):
    APP_NAME: str = "ASL LAW ERP v2.0"
    APP_ENV: str = "development"
    APP_PORT: int = 8000

    # PostgreSQL Supabase (Session Pooler - IPv4 compatible)
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql+asyncpg://postgres.khybbuyphemhkjphxeip:hbh64G2whRg5Qvzo@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres?ssl=require"
    )
    DATABASE_SYNC_URL: str = os.getenv(
        "DATABASE_SYNC_URL", 
        "postgresql://postgres.khybbuyphemhkjphxeip:hbh64G2whRg5Qvzo@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres?sslmode=require"
    )

    # Neo4j Aura (Graph RBAC & Need-to-Know)
    NEO4J_URI: str = "neo4j+s://fe86bb14.databases.neo4j.io"
    NEO4J_USERNAME: str = "fe86bb14"
    NEO4J_PASSWORD: str = "PCltARSy5cm-k_DLv-HjZKOPSqUy1hqr4cUTWbFbcvE"
    NEO4J_DATABASE: str = "fe86bb14"

    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")

    # Security
    SECRET_KEY: str = "asl-erp-secret-key-production-dev-2026-secure-random"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # 2FA & Data Encryption (DEC-02)
    # Khoá mặc định chỉ dùng cho development/test; môi trường khác bắt buộc đặt biến này.
    DATA_ENCRYPTION_MASTER_KEY: str = os.getenv("DATA_ENCRYPTION_MASTER_KEY", "")
    TOTP_ISSUER: str = os.getenv("TOTP_ISSUER", "ASL LAW ERP")
    TOTP_REQUIRED_ROLES: list[str] = ["ADMIN", "MANAGER", "ACCOUNTANT"]

    # AI Assistant (DEC-03)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    AI_MODEL_NAME: str = os.getenv("AI_MODEL_NAME", "gemini-2.5-flash")

    # Document Storage & Security (TASK-045)
    NAS_STORAGE_MOUNT_PATH: str = os.getenv("NAS_STORAGE_MOUNT_PATH", "./.storage/documents")
    FILE_ENCRYPTION_MASTER_KEY: str = os.getenv("FILE_ENCRYPTION_MASTER_KEY", "")
    CLAMAV_HOST: str = os.getenv("CLAMAV_HOST", "127.0.0.1")
    CLAMAV_PORT: int = int(os.getenv("CLAMAV_PORT", "3310"))
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50"))

    # Outbound Channels (DEC-03)
    ERP_PUBLIC_URL: str = os.getenv("ERP_PUBLIC_URL", "https://erp.asllaw.vn")
    OUTBOUND_ALLOWED_HOSTS: str = os.getenv("OUTBOUND_ALLOWED_HOSTS", "api.telegram.org,openapi.zalo.me")
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    ZALO_OA_ACCESS_TOKEN: str = os.getenv("ZALO_OA_ACCESS_TOKEN", "")

    @model_validator(mode="after")
    def _require_data_key_outside_dev(self):
        if not self.DATA_ENCRYPTION_MASTER_KEY:
            if self.APP_ENV not in ("development", "test"):
                raise ValueError("DATA_ENCRYPTION_MASTER_KEY bắt buộc ngoài môi trường development/test")
            self.DATA_ENCRYPTION_MASTER_KEY = _DEV_DATA_KEY
        if not self.FILE_ENCRYPTION_MASTER_KEY:
            if self.APP_ENV not in ("development", "test"):
                raise ValueError("FILE_ENCRYPTION_MASTER_KEY bắt buộc ngoài môi trường development/test")
            self.FILE_ENCRYPTION_MASTER_KEY = _DEV_FILE_KEY
        return self

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
