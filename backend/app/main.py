import time
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from backend.app.core.config import settings
from backend.app.db.postgres import engine
from backend.app.db.neo4j import get_neo4j_driver, close_neo4j_driver

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure connections
    yield
    # Shutdown: close pools
    await engine.dispose()
    await close_neo4j_driver()

app = FastAPI(
    title="ASL LAW ERP v2.0 Core API",
    description="Dual-Database Enterprise Legal Operations Backend (PostgreSQL + Neo4j Graph RBAC)",
    version="2.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
