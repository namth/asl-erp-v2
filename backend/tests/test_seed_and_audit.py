import pytest
import psycopg
from backend.app.core.config import settings
from backend.app.scripts.seed import seed_database
from backend.app.services.audit import log_audit_event, verify_audit_chain
from neo4j import GraphDatabase

def test_seed_database_idempotency():
    """Verify seed runs cleanly and can be re-run without errors or duplicates."""
    r1 = seed_database()
    assert r1["departments"] == 3
    assert r1["users"] == 4

    # Run second time - must succeed identically
    r2 = seed_database()
    assert r2["departments"] == 3
    assert r2["users"] == 4

    # Verify Neo4j nodes created
    driver = GraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD)
    )
    with driver.session() as s:
        # Check LS. Nam Tran is executive
        res = s.run("MATCH (u:User {email: 'nam.tran@asllaw.vn'}) RETURN u.is_executive AS is_exec").single()
        assert res is not None
        assert res["is_exec"] is True

        # Check LS. Nguyen Anh leads DEPT_IP
        res2 = s.run("""
            MATCH (u:User {email: 'anh.nguyen@asllaw.vn'})-[:LEADS]->(d:Department {code: 'DEPT_IP'})
            RETURN count(*) AS cnt
        """).single()
        assert res2["cnt"] == 1
    driver.close()

def test_audit_log_hash_chain():
    """Verify cryptographic hash chaining on audit_logs."""
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
        # Log first event
        id1, hash1 = log_audit_event(
            conn,
            actor_type="USER",
            action="LOGIN_SUCCESS",
            entity_name="User",
            entity_id="test-user-1",
            before_state=None,
            after_state={"session_id": "sess-001"}
        )
        assert len(hash1) == 64

        # Log second event
        id2, hash2 = log_audit_event(
            conn,
            actor_type="USER",
            action="VIEW_CASE",
            entity_name="Case",
            entity_id="case-100",
            before_state=None,
            after_state={"viewed": True}
        )
        assert len(hash2) == 64
        assert hash1 != hash2

        # Verify unbroken chain from id1
        is_valid, count, err = verify_audit_chain(conn, from_id=id1)
        assert is_valid is True, f"Audit chain verification failed: {err}"
        assert count >= 2
