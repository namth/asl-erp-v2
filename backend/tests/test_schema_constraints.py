import os
import psycopg
import pytest

DATABASE_URL = os.getenv("DATABASE_SYNC_URL", "postgresql://postgres:hbh64G2whRg5Qvzo@db.khybbuyphemhkjphxeip.supabase.co:5432/postgres?sslmode=require")

def test_audit_logs_immutable():
    """Verify that audit_logs cannot be updated or deleted (trigger protection)."""
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            # Insert a temporary test audit log
            cur.execute("""
                INSERT INTO audit_logs (
                    actor_type, action, entity_name, entity_id, prev_hash, row_hash
                ) VALUES (
                    'SYSTEM', 'TEST_SECURITY', 'SYSTEM', '0', 
                    '0000000000000000000000000000000000000000000000000000000000000000',
                    '1111111111111111111111111111111111111111111111111111111111111111'
                ) RETURNING id, created_at;
            """)
            row = cur.fetchone()
            log_id, created_at = row[0], row[1]
            conn.commit()

            # Attempt DELETE - Must fail
            with pytest.raises(psycopg.Error) as exc_info:
                cur.execute("DELETE FROM audit_logs WHERE id = %s;", (log_id,))
            assert "audit_logs is append-only and strictly immutable" in str(exc_info.value)
            conn.rollback()

            # Attempt UPDATE - Must fail
            with pytest.raises(psycopg.Error) as exc_info:
                cur.execute("UPDATE audit_logs SET action = 'HACKED' WHERE id = %s;", (log_id,))
            assert "audit_logs is append-only and strictly immutable" in str(exc_info.value)
            conn.rollback()


def test_public_tables_exist():
    """Verify all 24+ core tables exist in PostgreSQL public schema."""
    expected_tables = {
        "users", "departments", "department_leaders", "refresh_tokens",
        "clients", "opportunities", "cases", "case_assignments", "case_stages",
        "case_tasks", "billing_milestones", "misa_transactions", "commission_policies",
        "commission_transactions", "audit_logs", "outbox_events", "workflow_templates"
    }
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
            existing = {r[0] for r in cur.fetchall()}
            assert expected_tables.issubset(existing), f"Missing tables: {expected_tables - existing}"
