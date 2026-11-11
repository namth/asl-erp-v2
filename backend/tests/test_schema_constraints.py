import os
import psycopg
import pytest

from backend.app.core.config import settings

# Đọc qua settings (có .env) — không ghi cứng URL/mật khẩu trong test
DATABASE_URL = settings.DATABASE_SYNC_URL

def test_audit_logs_immutable():
    """Verify that audit_logs cannot be updated or deleted (trigger protection)."""
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            # Ghi qua service dùng chung để giữ chuỗi băm hợp lệ (bảng bất biến: dòng hash giả sẽ làm đứt chuỗi vĩnh viễn)
            from backend.app.services.audit import log_audit_event
            log_id, _ = log_audit_event(conn, actor_type="SYSTEM", action="TEST_SECURITY",
                                        entity_name="SYSTEM", entity_id="0")
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
