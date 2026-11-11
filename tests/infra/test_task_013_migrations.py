"""Nghiệm thu TASK-013 — Alembic migration, hai user DB asl_owner/asl_app, bảng bất biến (TSK-02).

Chạy: .venv/bin/python -m pytest tests/infra/test_task_013_migrations.py -v   (cần Docker)
Dựng một Postgres 16 tạm ở 127.0.0.1:55432 — KHÔNG đụng DB dev dùng chung.
"""
import os
import subprocess
import time
import uuid

import psycopg
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PY = os.path.join(ROOT, ".venv", "bin", "python")
PORT = 55432
SUPER = f"postgresql://postgres:pgtest@127.0.0.1:{PORT}/asl_erp"
OWNER_PW, APP_PW = "owner-test-pw", "app-test-pw"
APP = f"postgresql://asl_app:{APP_PW}@127.0.0.1:{PORT}/asl_erp"
IMMUTABLE = ("audit_logs", "misa_transactions", "commission_transactions")
CORE = {"users", "departments", "department_leaders", "refresh_tokens", "clients", "opportunities", "cases",
        "case_assignments", "case_stages", "case_tasks", "billing_milestones", "misa_transactions",
        "commission_policies", "commission_transactions", "audit_logs", "outbox_events", "workflow_templates"}


@pytest.fixture(scope="module")
def pg():
    name = f"asl-mig-test-{uuid.uuid4().hex[:6]}"
    subprocess.run(["docker", "run", "-d", "--rm", "--name", name, "-e", "POSTGRES_PASSWORD=pgtest",
                    "-e", "POSTGRES_DB=asl_erp", "-p", f"127.0.0.1:{PORT}:5432", "postgres:16-alpine"],
                   check=True, capture_output=True)
    try:
        for _ in range(60):
            try:
                psycopg.connect(SUPER, connect_timeout=2).close()
                break
            except psycopg.OperationalError:
                time.sleep(1)
        else:
            pytest.fail("Postgres tạm không lên")
        yield
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)


def alembic(*args):
    env = {**os.environ, "DATABASE_SYNC_URL": SUPER, "ASL_OWNER_PASSWORD": OWNER_PW, "ASL_APP_PASSWORD": APP_PW}
    return subprocess.run([PY, "-m", "alembic", "-c", "backend/alembic.ini", *args],
                          cwd=ROOT, env=env, capture_output=True, text=True)


def tables(url=SUPER):
    with psycopg.connect(url) as c:
        return {r[0] for r in c.execute("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")}


def test_upgrade_creates_schema(pg):
    r = alembic("upgrade", "head")
    assert r.returncode == 0, r.stderr[-3000:]
    assert CORE <= tables()
    assert "alembic_version" in tables()
    heads = alembic("heads")
    assert heads.stdout.count("(head)") == 1, "chỉ được có một head"


def test_roles_and_ownership(pg):
    with psycopg.connect(SUPER) as c:
        roles = {r[0]: r[1] for r in c.execute("SELECT rolname, rolsuper FROM pg_roles WHERE rolname LIKE 'asl_%'")}
        owners = {r[0] for r in c.execute("SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname='public' "
                                          "AND tablename <> 'alembic_version'")}
    assert roles == {"asl_owner": False, "asl_app": False}, roles
    assert owners == {"asl_owner"}, f"mọi bảng phải thuộc asl_owner, đang là {owners}"


def test_app_role_can_read_write_normal_tables(pg):
    with psycopg.connect(APP) as c:
        dep = c.execute("INSERT INTO departments (code, name) VALUES (%s, %s) RETURNING id",
                        (f"T{uuid.uuid4().hex[:6]}", "Phòng kiểm thử")).fetchone()[0]
        c.execute("UPDATE departments SET name = 'Đổi tên' WHERE id = %s", (dep,))
        c.execute("DELETE FROM departments WHERE id = %s", (dep,))


@pytest.mark.parametrize("table", IMMUTABLE)
def test_app_role_cannot_update_or_delete_immutable_tables(pg, table):
    with psycopg.connect(APP, autocommit=True) as c:
        assert c.execute(f"SELECT count(*) FROM {table}").fetchone() is not None  # SELECT được
        for stmt in (f"UPDATE {table} SET id = id", f"DELETE FROM {table}", f"TRUNCATE {table}"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute(stmt)


def test_app_role_can_insert_audit_log(pg):
    with psycopg.connect(APP) as c:
        c.execute("INSERT INTO audit_logs (actor_type, action, entity_name, entity_id, prev_hash, row_hash) "
                  "VALUES ('SYSTEM','TEST','SYSTEM','0', repeat('0',64), repeat('1',64))")


@pytest.mark.parametrize("table", IMMUTABLE)
def test_triggers_block_even_owner(pg, table):
    """Trigger chặn UPDATE/DELETE ngay cả khi lỡ cấp quyền (owner)."""
    owner = f"postgresql://asl_owner:{OWNER_PW}@127.0.0.1:{PORT}/asl_erp"
    with psycopg.connect(SUPER) as c:
        n = c.execute("SELECT count(*) FROM pg_trigger t JOIN pg_class r ON r.oid = t.tgrelid "
                      "WHERE r.relname = %s AND NOT t.tgisinternal", (table,)).fetchone()[0]
    assert n >= 1, f"{table} thiếu trigger chặn sửa/xoá"
    with psycopg.connect(owner, autocommit=True) as c:
        if table == "audit_logs":
            c.execute("INSERT INTO audit_logs (actor_type, action, entity_name, entity_id, prev_hash, row_hash) "
                      "VALUES ('SYSTEM','T2','SYSTEM','0', repeat('0',64), repeat('1',64))")
            for stmt in ("UPDATE audit_logs SET action = 'X'", "DELETE FROM audit_logs"):
                with pytest.raises(psycopg.Error):
                    c.execute(stmt)


def test_downgrade_base_then_upgrade_again(pg):
    r = alembic("downgrade", "base")
    assert r.returncode == 0, r.stderr[-3000:]
    assert not (CORE & tables()), f"downgrade còn sót bảng: {CORE & tables()}"
    r = alembic("upgrade", "head")
    assert r.returncode == 0, r.stderr[-3000:]
    assert CORE <= tables()


def test_migrations_do_not_hardcode_secrets():
    import glob
    src = "".join(open(p, encoding="utf-8").read() for p in
                  glob.glob(os.path.join(ROOT, "backend/alembic/**/*.py"), recursive=True) +
                  [os.path.join(ROOT, "backend/alembic.ini")])
    assert OWNER_PW not in src and APP_PW not in src
    assert "ASL_OWNER_PASSWORD" in src and "ASL_APP_PASSWORD" in src, "mật khẩu role đọc từ biến môi trường"
    assert "supabase.co" not in src and "@127.0.0.1:65432" not in src
