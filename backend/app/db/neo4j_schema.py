from neo4j import AsyncDriver
from backend.app.core.config import settings
from backend.app.db.neo4j import get_neo4j_driver

CONSTRAINTS_AND_INDEXES = [
    # Unique Constraints
    "CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE",
    "CREATE CONSTRAINT dept_id_unique IF NOT EXISTS FOR (d:Department) REQUIRE d.id IS UNIQUE",
    "CREATE CONSTRAINT dept_code_unique IF NOT EXISTS FOR (d:Department) REQUIRE d.code IS UNIQUE",
    "CREATE CONSTRAINT case_id_unique IF NOT EXISTS FOR (c:Case) REQUIRE c.id IS UNIQUE",
    "CREATE CONSTRAINT case_code_unique IF NOT EXISTS FOR (c:Case) REQUIRE c.case_code IS UNIQUE",
    "CREATE CONSTRAINT client_id_unique IF NOT EXISTS FOR (cl:Client) REQUIRE cl.id IS UNIQUE",
    # Indexes
    "CREATE INDEX party_norm_name_idx IF NOT EXISTS FOR (p:Party) ON (p.normalized_name)",
    "CREATE INDEX party_id_hash_idx IF NOT EXISTS FOR (p:Party) ON (p.id_hash)",
]

async def apply_neo4j_constraints(driver: AsyncDriver | None = None):
    """Applies all required constraints and indexes to Neo4j Aura."""
    if driver is None:
        driver = get_neo4j_driver()
    db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
    kwargs = {"database": db_name} if db_name else {}

    results = []
    async with driver.session(**kwargs) as session:
        for stmt in CONSTRAINTS_AND_INDEXES:
            try:
                await session.run(stmt)
                results.append((stmt, "APPLIED"))
            except Exception as e:
                results.append((stmt, f"ERROR: {e}"))
    return results
