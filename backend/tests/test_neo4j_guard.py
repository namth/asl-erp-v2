import pytest
import uuid
from backend.app.db.neo4j import get_neo4j_driver
from backend.app.db.neo4j_schema import apply_neo4j_constraints
from backend.app.guards.need_to_know import query_need_to_know_facts, verify_need_to_know
from backend.app.guards.conflict_check import check_conflict_of_interest
from fastapi import HTTPException

@pytest.mark.asyncio
async def test_apply_neo4j_constraints():
    driver = get_neo4j_driver()
    results = await apply_neo4j_constraints(driver)
    assert len(results) > 0
    for stmt, res in results:
        assert "ERROR" not in res, f"Failed stmt: {stmt} -> {res}"

@pytest.mark.asyncio
async def test_live_need_to_know_facts():
    driver = get_neo4j_driver()
    test_user_id = str(uuid.uuid4())
    test_case_id = str(uuid.uuid4())
    test_dept_id = str(uuid.uuid4())
    dept_code = f"TD_{uuid.uuid4().hex[:6].upper()}"
    case_code = f"ASL-2026-T-{uuid.uuid4().hex[:4].upper()}"
    random_user = str(uuid.uuid4())

    async with driver.session() as s:
        # Create test nodes
        await s.run("""
            CREATE (u:User {id: $uid, is_active: true, system_role: 'ATTORNEY', is_executive: false})
            CREATE (d:Department {id: $did, code: $dcode})
            CREATE (c:Case {id: $cid, case_code: $ccode, status: 'ACTIVE'})
            CREATE (c)-[:IN_DEPARTMENT]->(d)
            CREATE (u)-[:ASSIGNED_TO {role: 'CASE_MANAGER'}]->(c)
        """, uid=test_user_id, did=test_dept_id, cid=test_case_id, dcode=dept_code, ccode=case_code)

    try:
        facts = await query_need_to_know_facts(test_user_id, test_case_id, driver=driver)
        assert facts["case_exists"] is True
        assert facts["active"] is True
        assert facts["is_assigned"] is True
        assert facts["is_case_manager"] is True
        assert facts["system_role"] == "ATTORNEY"

        # Verify guard allow
        assert await verify_need_to_know(test_user_id, test_case_id, "professional", driver=driver) is True
        assert await verify_need_to_know(test_user_id, test_case_id, "finance", driver=driver) is True

        # Non-assigned random user must be denied
        async with driver.session() as s:
            await s.run("CREATE (u:User {id: $uid, is_active: true, system_role: 'ATTORNEY'})", uid=random_user)

        with pytest.raises(HTTPException) as exc_info:
            await verify_need_to_know(random_user, test_case_id, "professional", driver=driver)
        assert exc_info.value.status_code == 403

    finally:
        # Cleanup test nodes
        async with driver.session() as s:
            await s.run("""
                MATCH (u:User) WHERE u.id IN [$uid, $ruid] DETACH DELETE u
                MATCH (d:Department {id: $did}) DETACH DELETE d
                MATCH (c:Case {id: $cid}) DETACH DELETE c
            """, uid=test_user_id, did=test_dept_id, cid=test_case_id, ruid=random_user)

@pytest.mark.asyncio
async def test_conflict_of_interest_check():
    driver = get_neo4j_driver()
    test_case_id = str(uuid.uuid4())
    norm_name = "cong ty tnhh xung dot test"

    async with driver.session() as s:
        await s.run("""
            CREATE (c:Case {id: $cid, case_code: 'ASL-2026-CONF-0001', status: 'ACTIVE'})
            CREATE (p:Party {normalized_name: $name, id_hash: 'HASH123'})
            CREATE (p)-[:PARTY_IN {party_role: 'OPPOSING'}]->(c)
        """, cid=test_case_id, name=norm_name)

    try:
        conflicts = await check_conflict_of_interest(norm_name, driver=driver)
        assert len(conflicts) >= 1
        assert any(c["case_id"] == test_case_id for c in conflicts)

        # Non-conflicting name
        no_conflicts = await check_conflict_of_interest("khach hang an toan", driver=driver)
        assert len(no_conflicts) == 0

    finally:
        async with driver.session() as s:
            await s.run("""
                MATCH (c:Case {id: $cid}) DETACH DELETE c
                MATCH (p:Party {normalized_name: $name}) DETACH DELETE p
            """, cid=test_case_id, name=norm_name)
