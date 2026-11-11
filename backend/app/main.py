import time
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy import text


from backend.app.core.config import settings
from backend.app.core.errors import (
    AppException,
    app_exception_handler,
    validation_exception_handler,
    http_exception_handler,
)
from backend.app.db.postgres import engine
from backend.app.db.neo4j import get_neo4j_driver, close_neo4j_driver
from backend.app.db.redis import close_redis
from backend.app.api.auth import router as auth_router
from backend.app.api.crm_clients import router as crm_clients_router
from backend.app.api.cases import router as cases_router
from backend.app.api.approvals import router as approvals_router
from backend.app.api.me import router as me_router
from backend.app.api.workflows import router as workflows_router
from backend.app.api.settings_holidays import router as settings_holidays_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure connections
    yield
    # Shutdown: close pools
    await engine.dispose()
    await close_neo4j_driver()
    await close_redis()

app = FastAPI(
    title="ASL LAW ERP v2.0 Core API",
    description="Dual-Database Enterprise Legal Operations Backend (PostgreSQL + Neo4j Graph RBAC)",
    version="2.0.0",
    lifespan=lifespan
)

# Exception handlers
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(crm_clients_router, prefix="/api/v1")
app.include_router(cases_router, prefix="/api/v1")
app.include_router(approvals_router, prefix="/api/v1")
app.include_router(me_router, prefix="/api/v1")
app.include_router(workflows_router, prefix="/api/v1")
app.include_router(settings_holidays_router, prefix="/api/v1")

@app.get("/api/v1/health", tags=["System"])
async def health_check():
    """Health check endpoint verifying both PostgreSQL and Neo4j connectivity."""
    status = {"postgres": "unhealthy", "neo4j": "unhealthy", "overall": "degraded"}
    timings = {}

    # Check PostgreSQL
    t0 = time.perf_counter()
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT version();"))
            ver = result.scalar()
            status["postgres"] = "healthy"
            status["postgres_version"] = ver[:40] if ver else ""
    except Exception as e:
        status["postgres_error"] = str(e)
    timings["postgres_latency_ms"] = round((time.perf_counter() - t0) * 1000, 2)

    # Check Neo4j Aura
    t0 = time.perf_counter()
    try:
        driver = get_neo4j_driver()
        db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
        kwargs = {"database": db_name} if db_name else {}
        async with driver.session(**kwargs) as session:
            result = await session.run("RETURN 1 AS online")
            record = await result.single()
            if record and record["online"] == 1:
                status["neo4j"] = "healthy"
    except Exception as e:
        status["neo4j_error"] = str(e)
    timings["neo4j_latency_ms"] = round((time.perf_counter() - t0) * 1000, 2)

    if status["postgres"] == "healthy" and status["neo4j"] == "healthy":
        status["overall"] = "healthy"

    return {
        "status": status,
        "timings": timings,
        "app": settings.APP_NAME,
        "env": settings.APP_ENV
    }
