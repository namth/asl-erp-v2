from typing import Optional, List, Dict
from neo4j import AsyncDriver
from backend.app.core.config import settings
from backend.app.db.neo4j import get_neo4j_driver

CONFLICT_CYPHER = """
MATCH (p:Party)-[:PARTY_IN {party_role: 'OPPOSING'}]->(c:Case)
WHERE c.status IN ['INITIALIZING', 'ACTIVE', 'PAUSED']
  AND (p.normalized_name = $normalized_name OR (p.id_hash IS NOT NULL AND p.id_hash = $id_hash))
RETURN c.id AS case_id, c.case_code AS case_code
"""

async def check_conflict_of_interest(
    normalized_name: str,
    id_hash: Optional[str] = None,
    driver: Optional[AsyncDriver] = None
) -> List[Dict[str, str]]:
    """Checks Neo4j graph for conflict of interest.
    
    Returns a list of opposing cases where the party name or tax/id hash matches.
    """
    if driver is None:
        driver = get_neo4j_driver()

    db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
    kwargs = {"database": db_name} if db_name else {}

    conflicts = []
    async with driver.session(**kwargs) as session:
        result = await session.run(
            CONFLICT_CYPHER,
            normalized_name=normalized_name.strip().lower(),
            id_hash=id_hash
        )
        records = await result.data()
        for rec in records:
            conflicts.append({
                "case_id": rec["case_id"],
                "case_code": rec["case_code"]
            })
    return conflicts
