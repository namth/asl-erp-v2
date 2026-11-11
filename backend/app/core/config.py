import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "ASL LAW ERP v2.0"
    APP_ENV: str = "development"
    APP_PORT: int = 8000

    # PostgreSQL Supabase (Direct)
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql+asyncpg://postgres:hbh64G2whRg5Qvzo@db.khybbuyphemhkjphxeip.supabase.co:5432/postgres"
    )
    DATABASE_SYNC_URL: str = os.getenv(
        "DATABASE_SYNC_URL", 
        "postgresql://postgres:hbh64G2whRg5Qvzo@db.khybbuyphemhkjphxeip.supabase.co:5432/postgres?sslmode=require"
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

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
