import json
import psycopg
from typing import Dict, Any, List, Optional
from neo4j import AsyncDriver

from backend.app.core.config import settings
from backend.app.db.neo4j import get_neo4j_driver

async def process_outbox(limit: int = 100) -> int:
    """Processes pending outbox_events and syncs changes idempotently to Neo4j Aura."""
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, event_type, payload
                FROM outbox_events
                WHERE processed_at IS NULL
                ORDER BY id ASC
                LIMIT %s
            """, (limit,))
            rows = cur.fetchall()

    if not rows:
        return 0

    driver = get_neo4j_driver()
    db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
    kwargs = {"database": db_name} if db_name else {}

    processed_ids = []

    async with driver.session(**kwargs) as session:
        for event_id, event_type, payload_raw in rows:
            payload = json.loads(payload_raw) if isinstance(payload_raw, str) else payload_raw

            if event_type in ("USER_UPSERTED", "USER_CREATED"):
                uid = str(payload.get("id"))
                email = payload.get("email")
                full_name = payload.get("full_name", "")
                system_role = payload.get("system_role", "ATTORNEY")
                is_executive = bool(payload.get("is_executive", False))
                department_id = payload.get("department_id")
                is_active = bool(payload.get("is_active", True))

                did_str = str(department_id) if department_id else None

                await session.run("""
                    MERGE (u:User {id: $uid})
                    SET u.email = $email,
                        u.full_name = $full_name,
                        u.system_role = $system_role,
                        u.is_executive = $is_executive,
                        u.is_active = $is_active
                    WITH u
                    OPTIONAL MATCH (u)-[r:MEMBER_OF]->(old_d)
                    WHERE $did IS NULL OR old_d.id <> $did
                    DELETE r
                    WITH u
                    WHERE $did IS NOT NULL
                    MERGE (d:Department {id: $did})
                    MERGE (u)-[:MEMBER_OF]->(d)
                """, uid=uid, email=email, full_name=full_name, system_role=system_role,
                     is_executive=is_executive, is_active=is_active, did=did_str)

            elif event_type == "USER_DEACTIVATED":
                uid = str(payload.get("id"))
                await session.run("""
                    MERGE (u:User {id: $uid})
                    SET u.is_active = false
                    WITH u
                    OPTIONAL MATCH (u)-[r_lead:LEADS]->()
                    DELETE r_lead
                    WITH u
                    OPTIONAL MATCH (u)-[r_ass:ASSIGNED_TO]->()
                    DELETE r_ass
                """, uid=uid)

            elif event_type in ("DEPARTMENT_UPSERTED", "DEPARTMENT_CREATED"):
                did = str(payload.get("id"))
                code = payload.get("code", "")
                name = payload.get("name", "")
                await session.run("""
                    MERGE (d:Department {id: $did})
                    SET d.code = $code, d.name = $name
                """, did=did, code=code, name=name)

            elif event_type == "DEPARTMENT_LEADERS_SET":
                did = str(payload.get("department_id"))
                leader_ids = [str(x) for x in payload.get("leader_user_ids", [])]

                await session.run("""
                    MERGE (d:Department {id: $did})
                    WITH d
                    OPTIONAL MATCH ()-[r:LEADS]->(d)
                    DELETE r
                """, did=did)

                if leader_ids:
                    await session.run("""
                        MATCH (d:Department {id: $did})
                        UNWIND $leader_ids AS lid
                        MATCH (u:User {id: lid})
                        MERGE (u)-[:LEADS]->(d)
                    """, did=did, leader_ids=leader_ids)

            processed_ids.append(event_id)

    # Mark events processed in PostgreSQL
    if processed_ids:
        with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE outbox_events
                    SET processed_at = clock_timestamp()
                    WHERE id = ANY(%s)
                """, (processed_ids,))

    return len(processed_ids)
