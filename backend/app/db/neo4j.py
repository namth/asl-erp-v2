from neo4j import AsyncGraphDatabase, AsyncDriver
from typing import AsyncGenerator
from backend.app.core.config import settings

_driver: AsyncDriver | None = None

def get_neo4j_driver() -> AsyncDriver:
    global _driver
    if _driver is None:
        _driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD)
        )
    return _driver

async def close_neo4j_driver():
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None

async def get_neo4j_session():
    driver = get_neo4j_driver()
    db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
    kwargs = {"database": db_name} if db_name else {}
    async with driver.session(**kwargs) as session:
        yield session
