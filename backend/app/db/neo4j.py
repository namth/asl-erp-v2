import asyncio
from typing import AsyncGenerator, Any
from neo4j import AsyncGraphDatabase, AsyncDriver
from backend.app.core.config import settings

_driver: AsyncDriver | None = None
_driver_loop: Any = None

def get_neo4j_driver() -> AsyncDriver:
    global _driver, _driver_loop
    current_loop = None
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        pass

    if _driver is None or (_driver_loop is not None and _driver_loop != current_loop):
        _driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD)
        )
        _driver_loop = current_loop
    return _driver

async def close_neo4j_driver():
    global _driver, _driver_loop
    if _driver is not None:
        try:
            await _driver.close()
        except Exception:
            pass
        _driver = None
        _driver_loop = None

async def get_neo4j_session():
    driver = get_neo4j_driver()
    db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
    kwargs = {"database": db_name} if db_name else {}
    async with driver.session(**kwargs) as session:
        yield session
