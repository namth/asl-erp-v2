from typing import Optional
from fastapi import HTTPException, status
from neo4j import AsyncDriver
from backend.app.core.config import settings
from backend.app.db.neo4j import get_neo4j_driver
from backend.app.guards.access_policy import can_access_scope, NeedToKnowFacts

FACTS_CYPHER = """
MATCH (u:User {id: $user_id})
OPTIONAL MATCH (c:Case {id: $case_id})
RETURN
  c IS NOT NULL                                                     AS case_exists,
  coalesce(u.is_active, false)                                      AS active,
  coalesce(u.system_role, '')                                       AS system_role,
  coalesce(u.is_executive, false)                                   AS is_executive,
  EXISTS { MATCH (u)-[:ASSIGNED_TO]->(c) }                          AS is_assigned,
  EXISTS { MATCH (u)-[:ASSIGNED_TO {role: 'CASE_MANAGER'}]->(c) }    AS is_case_manager,
  EXISTS { MATCH (u)-[:LEADS]->(:Department)<-[:IN_DEPARTMENT]-(c) } AS leads_case_department,
  EXISTS { MATCH (u)-[:ORIGINATED]->(c) }                           AS is_originator
"""

async def query_need_to_know_facts(
    user_id: str, 
    case_id: str, 
    driver: Optional[AsyncDriver] = None
) -> NeedToKnowFacts:
    """Queries Neo4j Aura for user-case relationship facts."""
    if driver is None:
        driver = get_neo4j_driver()

    db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
    kwargs = {"database": db_name} if db_name else {}

    async with driver.session(**kwargs) as session:
        result = await session.run(FACTS_CYPHER, user_id=user_id, case_id=case_id)
        record = await result.single()
        if not record:
            return {
                "case_exists": False,
                "active": False,
                "system_role": "",
                "is_executive": False,
                "is_assigned": False,
                "is_case_manager": False,
                "leads_case_department": False,
                "is_originator": False
            }
        return {
            "case_exists": bool(record["case_exists"]),
            "active": bool(record["active"]),
            "system_role": str(record["system_role"]),
            "is_executive": bool(record["is_executive"]),
            "is_assigned": bool(record["is_assigned"]),
            "is_case_manager": bool(record["is_case_manager"]),
            "leads_case_department": bool(record["leads_case_department"]),
            "is_originator": bool(record["is_originator"])
        }

async def verify_need_to_know(
    user_id: str, 
    case_id: str, 
    scope: str, 
    driver: Optional[AsyncDriver] = None
) -> bool:
    """Verifies whether a user has need-to-know access to a case for a given scope.
    
    Raises HTTPException(403) if denied.
    """
    facts = await query_need_to_know_facts(user_id, case_id, driver=driver)
    allowed = can_access_scope(facts, scope)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"NEED_TO_KNOW_DENIED: Access to scope '{scope}' on case '{case_id}' is restricted."
        )
    return True
