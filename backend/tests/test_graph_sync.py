"""Nghiệm thu TSK-18 (TASK-014) — Đồng bộ đồ thị Neo4j, Outbox & Rebuild Graph.

Hợp đồng: docs/06-database-schema.md §3, §4; docs/07-api-contracts.md §3.2; DEC-01.
Tiêu chí nghiệm thu (brief mục 5 dòng 6, 7, 8):
- Mỗi thao tác ghi tạo đúng 1 dòng outbox_events; process_outbox chạy 2 lần không nhân đôi nút/cạnh, đặt processed_at.
- rebuild_graph trên DB seed: số nút/cạnh khớp dữ liệu PostgreSQL; chạy 2 lần cho cùng kết quả.
- Audit đủ 4 hành động, không dòng nào chứa temporary_password hay password_hash.
"""
import inspect
import json
import os
import subprocess
import sys
import time
import uuid

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/15")

import httpx
import jwt
import psycopg
import pytest
import redis as redis_sync
from argon2 import PasswordHasher
from argon2.low_level import Type
from neo4j import GraphDatabase

from backend.app.core.config import settings
from backend.app.main import app
from backend.app.services.audit import verify_audit_chain

PASSWORD = "Asl@Secure2026"
TEST_HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4, type=Type.ID)


# ---------- hạ tầng test & fixtures ----------

@pytest.fixture(autouse=True)
def clean_redis():
    r = redis_sync.Redis.from_url(os.environ["REDIS_URL"])
    r.flushdb()
    yield
    r.flushdb()


def db():
    return psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True)


def neo4j_driver():
    return GraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD)
    )


@pytest.fixture(autouse=True)
def clean_test_data():
    """Dọn dữ liệu test — chỉ xoá tsk18- và T18, bảo toàn dữ liệu seed."""
    def cleanup():
        try:
            with db() as conn:
                conn.execute("DELETE FROM department_leaders WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'tsk18-%')")
                conn.execute("DELETE FROM case_assignments WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'tsk18-%')")
                conn.execute("DELETE FROM cases WHERE case_code LIKE 'ASL-2026-T18-%'")
                conn.execute("DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'tsk18-%')")
                conn.execute("DELETE FROM outbox_events WHERE payload->>'email' LIKE 'tsk18-%' OR payload->>'code' LIKE 'T18%'")
                conn.execute("DELETE FROM users WHERE email LIKE 'tsk18-%'")
                conn.execute("DELETE FROM departments WHERE code LIKE 'T18%'")
        except Exception:
            pass

        try:
            driver = neo4j_driver()
            with driver.session() as s:
                s.run("MATCH (u:User) WHERE u.email STARTS WITH 'tsk18-' DETACH DELETE u")
                s.run("MATCH (d:Department) WHERE d.code STARTS WITH 'T18' DETACH DELETE d")
                s.run("MATCH (c:Case) WHERE c.case_code STARTS WITH 'ASL-2026-T18-' DETACH DELETE c")
            driver.close()
        except Exception:
            pass

    cleanup()
    yield
    cleanup()


def client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://testserver")


def make_user(
    role="ATTORNEY",
    *,
    email=None,
    full_name="Người Dùng Sync",
    title="Luật sư",
    is_executive=False,
    department_id=None,
    is_active=True
) -> dict:
    if email is None:
        email = f"tsk18-sync-{uuid.uuid4().hex[:10]}@asllaw.vn"
    with db() as conn:
        row = conn.execute(
            """INSERT INTO users (email, password_hash, full_name, title, system_role,
                                  is_executive, department_id, is_active)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (email, TEST_HASHER.hash(PASSWORD), full_name, title, role,
             is_executive, department_id, is_active),
        ).fetchone()
    return {"id": str(row[0]), "email": email, "role": role}


def make_department(code=None, name=None) -> dict:
    if code is None:
        code = f"T18_{uuid.uuid4().hex[:6].upper()}"
    if name is None:
        name = f"Ban Đồng Bộ {code}"
    with db() as conn:
        row = conn.execute(
            """INSERT INTO departments (code, name) VALUES (%s, %s)
               ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
               RETURNING id""",
            (code, name)
        ).fetchone()
    return {"id": str(row[0]), "code": code, "name": name}


def auth_client(user: dict, csrf_val: str = "csrf-sync-fixed") -> tuple[httpx.AsyncClient, dict]:
    c = client()
    now = int(time.time())
    # tokens_valid_after của user test lùi 10 phút: đồng hồ DB có thể nhanh hơn máy chạy test, token iat=now sẽ bị coi là bị thu hồi
    with db() as _c:
        _c.execute("UPDATE users SET tokens_valid_after = now() - interval '10 minutes' WHERE id = %s", (str(user["id"]),))
    payload = {
        "sub": str(user["id"]),
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + 1800,
        "system_role": user.get("role", "ADMIN"),
        "typ": "access",
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    c.cookies.set("access_token", token)
    c.cookies.set("csrf_token", csrf_val)
    headers = {"X-CSRF-Token": csrf_val, "Authorization": f"Bearer {token}"}
    return c, headers


# =====================================================================
# 1. TIÊU CHÍ: MỖI THAO TÁC GHI TẠO ĐÚNG 1 DÒNG OUTBOX_EVENTS (brief mục 5, dòng 6)
# =====================================================================

async def test_each_write_operation_creates_exactly_one_outbox_event():
    """Mỗi thao tác ghi tạo đúng 1 dòng outbox_events với processed_at IS NULL."""
    admin = make_user("ADMIN")
    c, headers = auth_client(admin)

    async with c:
        # 1. Tạo user
        email_new = f"tsk18-ob1-{uuid.uuid4().hex[:6]}@asllaw.vn"
        r_create_user = await c.post("/api/v1/users", json={
            "email": email_new,
            "full_name": "User Outbox 1",
            "system_role": "ATTORNEY",
            "is_executive": False
        }, headers=headers)
        assert r_create_user.status_code == 201, r_create_user.text
        u1_id = r_create_user.json()["data"].get("id") or r_create_user.json()["data"]["user"]["id"]

        with db() as conn:
            cnt_create = conn.execute(
                "SELECT count(*) FROM outbox_events WHERE payload->>'id' = %s AND processed_at IS NULL",
                (u1_id,)
            ).fetchone()[0]
        assert cnt_create == 1, f"Tạo user phải sinh đúng 1 dòng outbox chưa xử lý, nhận: {cnt_create}"

        # 2. Cập nhật user
        r_patch = await c.patch(f"/api/v1/users/{u1_id}", json={
            "full_name": "User Outbox 1 Đã Đổi"
        }, headers=headers)
        assert r_patch.status_code == 200, r_patch.text

        with db() as conn:
            cnt_total_u1 = conn.execute(
                "SELECT count(*) FROM outbox_events WHERE payload->>'id' = %s",
                (u1_id,)
            ).fetchone()[0]
        assert cnt_total_u1 == 2, f"Sau PATCH phải có đúng 2 dòng outbox cho user này, nhận: {cnt_total_u1}"

        # 3. Tạo phòng ban
        code_dept = f"T18_OB_{uuid.uuid4().hex[:4].upper()}"
        r_dept = await c.post("/api/v1/departments", json={
            "code": code_dept,
            "name": "Ban Outbox Test"
        }, headers=headers)
        assert r_dept.status_code == 201, r_dept.text
        did = r_dept.json()["data"].get("id") or r_dept.json()["data"]["department"]["id"]

        with db() as conn:
            cnt_dept = conn.execute(
                "SELECT count(*) FROM outbox_events WHERE payload->>'code' = %s",
                (code_dept,)
            ).fetchone()[0]
        assert cnt_dept == 1, f"Tạo phòng ban phải sinh đúng 1 dòng outbox, nhận: {cnt_dept}"

        # 4. Gán trưởng phòng
        mgr = make_user("MANAGER", full_name="Trưởng Phòng Outbox")
        r_leaders = await c.put(f"/api/v1/departments/{did}/leaders", json={
            "leader_user_ids": [mgr["id"]]
        }, headers=headers)
        assert r_leaders.status_code == 200, r_leaders.text

        with db() as conn:
            cnt_leaders = conn.execute(
                """SELECT count(*) FROM outbox_events
                   WHERE event_type = 'DEPARTMENT_LEADERS_SET' AND payload->>'department_id' = %s""",
                (did,)
            ).fetchone()[0]
        assert cnt_leaders == 1, f"Gán leaders phải sinh đúng 1 dòng outbox DEPARTMENT_LEADERS_SET: {cnt_leaders}"

        # 5. Khoá tài khoản
        r_deact = await c.post(f"/api/v1/users/{u1_id}/deactivate", json={
            "reason": "Test outbox khoá"
        }, headers=headers)
        assert r_deact.status_code in (200, 204), r_deact.text

        with db() as conn:
            cnt_deact = conn.execute(
                """SELECT count(*) FROM outbox_events
                   WHERE event_type IN ('USER_DEACTIVATED', 'USER_UPSERTED') AND payload->>'id' = %s""",
                (u1_id,)
            ).fetchone()[0]
        assert cnt_deact >= 1, "Khoá tài khoản phải ghi outbox event"


# =====================================================================
# 2. TIÊU CHÍ: PROCESS_OUTBOX CHẠY 2 LẦN IDEMPOTENT (brief mục 5, dòng 6)
# =====================================================================

async def test_process_outbox_applies_events_idempotently_and_marks_processed():
    """services/graph_sync.process_outbox(limit) áp sự kiện còn lại bằng MERGE (idempotent), đặt processed_at;
    chạy 2 lần không nhân đôi nút/cạnh."""
    from backend.app.services.graph_sync import process_outbox

    dept = make_department()
    user_test = make_user("MANAGER", department_id=dept["id"], full_name="User Idempotency Test")

    # Ghi sự kiện outbox mẫu vào PostgreSQL
    with db() as conn:
        conn.execute(
            """INSERT INTO outbox_events (event_type, payload) VALUES
               ('DEPARTMENT_UPSERTED', %s),
               ('USER_UPSERTED', %s)""",
            (
                json.dumps({"id": dept["id"], "code": dept["code"], "name": dept["name"]}),
                json.dumps({
                    "id": user_test["id"],
                    "email": user_test["email"],
                    "full_name": "User Idempotency Test",
                    "system_role": "MANAGER",
                    "is_executive": False,
                    "department_id": dept["id"],
                    "is_active": True
                })
            )
        )

    # Chạy lần 1: áp sự kiện lên Neo4j
    if inspect.iscoroutinefunction(process_outbox):
        await process_outbox(limit=100)
    else:
        process_outbox(limit=100)

    # Kiểm tra PostgreSQL: các sự kiện trên đã có processed_at
    with db() as conn:
        unprocessed = conn.execute(
            """SELECT count(*) FROM outbox_events
               WHERE (payload->>'id' = %s OR payload->>'id' = %s) AND processed_at IS NULL""",
            (dept["id"], user_test["id"])
        ).fetchone()[0]
    assert unprocessed == 0, "Sau khi chạy process_outbox, processed_at phải được đặt"

    # Kiểm tra Neo4j: nút và quan hệ đã được tạo
    driver = neo4j_driver()
    with driver.session() as s:
        res1 = s.run("""
            MATCH (u:User {id: $uid})
            OPTIONAL MATCH (u)-[r_mem:MEMBER_OF]->(d:Department {id: $did})
            RETURN count(u) AS cnt_u, count(r_mem) AS cnt_mem, u.system_role AS role, u.is_active AS active
        """, uid=user_test["id"], did=dept["id"]).single()
    driver.close()

    assert res1["cnt_u"] == 1, "Phải có đúng 1 nút User"
    assert res1["cnt_mem"] == 1, "Phải có đúng 1 cạnh :MEMBER_OF"
    assert res1["role"] == "MANAGER"
    assert res1["active"] is True

    # Chạy lần 2: kiểm tra tính idempotent (không nhân đôi nút hay cạnh)
    # Reset processed_at để ép process_outbox xử lý lại
    with db() as conn:
        conn.execute(
            """UPDATE outbox_events SET processed_at = NULL
               WHERE payload->>'id' = %s OR payload->>'id' = %s""",
            (dept["id"], user_test["id"])
        )

    if inspect.iscoroutinefunction(process_outbox):
        await process_outbox(limit=100)
    else:
        process_outbox(limit=100)

    driver = neo4j_driver()
    with driver.session() as s:
        res2 = s.run("""
            MATCH (u:User {id: $uid})
            OPTIONAL MATCH (u)-[r_mem:MEMBER_OF]->(d:Department {id: $did})
            RETURN count(u) AS cnt_u, count(r_mem) AS cnt_mem
        """, uid=user_test["id"], did=dept["id"]).single()
    driver.close()

    assert res2["cnt_u"] == 1, f"Chạy lần 2 bị nhân đôi nút User: {res2['cnt_u']}"
    assert res2["cnt_mem"] == 1, f"Chạy lần 2 bị nhân đôi cạnh :MEMBER_OF: {res2['cnt_mem']}"


# =====================================================================
# 3. TIÊU CHÍ: REBUILD_GRAPH KHỚP POSTGRESQL & IDEMPOTENT (brief mục 5, dòng 7)
# =====================================================================

def test_rebuild_graph_dry_run_option():
    """rebuild_graph --dry-run: in số nút/cạnh sẽ tạo, không làm lỗi cú pháp."""
    cmd = [sys.executable, "-m", "backend.app.scripts.rebuild_graph", "--dry-run"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    assert res.returncode == 0, f"rebuild_graph --dry-run thất bại:\nstdout: {res.stdout}\nstderr: {res.stderr}"
    out_lower = res.stdout.lower()
    assert any(k in out_lower for k in ("dry-run", "user", "department", "nút", "cạnh", "nodes")), (
        f"Output dry-run phải in thông tin số nút/cạnh dự kiến: {res.stdout}"
    )


_GRAPH_SET_NAMES = ("nút User", "nút Department", "cạnh :LEADS", "cạnh :MEMBER_OF", "cạnh :ASSIGNED_TO")

_PG_SET_QUERIES = (
    "SELECT id::text FROM users",
    "SELECT id::text FROM departments",
    "SELECT user_id::text || '>' || department_id::text FROM department_leaders",
    "SELECT id::text || '>' || department_id::text FROM users WHERE department_id IS NOT NULL",
    "SELECT user_id::text || '>' || case_id::text FROM case_assignments WHERE unassigned_at IS NULL",
)
_NEO_SET_QUERIES = (
    "MATCH (u:User) RETURN u.id AS k",
    "MATCH (d:Department) RETURN d.id AS k",
    "MATCH (u:User)-[:LEADS]->(d:Department) RETURN u.id + '>' + d.id AS k",
    "MATCH (u:User)-[:MEMBER_OF]->(d:Department) RETURN u.id + '>' + d.id AS k",
    "MATCH (u:User)-[:ASSIGNED_TO]->(c:Case) RETURN u.id + '>' + c.id AS k",
)


def _pg_sets() -> list[set]:
    with db() as conn:
        return [{str(r[0]) for r in conn.execute(q).fetchall()} for q in _PG_SET_QUERIES]


def _rebuild_and_compare() -> list[str]:
    """Chụp PostgreSQL trước (A) và sau (B) khi rebuild + đọc đồ thị. DB dev dùng chung: test khác có thể
    thêm/xoá bản ghi giữa chừng, nên chỉ đòi: mọi bản ghi tồn tại suốt quá trình (A ∩ B) phải có trong đồ thị,
    và đồ thị không có gì ngoài những bản ghi từng tồn tại (A ∪ B). Rebuild sai (thiếu/thừa thật) vẫn bị bắt."""
    before = _pg_sets()
    cmd = [sys.executable, "-m", "backend.app.scripts.rebuild_graph"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    assert res.returncode == 0, f"rebuild_graph thất bại:\nstdout: {res.stdout}\nstderr: {res.stderr}"
    driver = neo4j_driver()
    with driver.session() as s:
        neo = [{str(r["k"]) for r in s.run(q)} for q in _NEO_SET_QUERIES]
    driver.close()
    after = _pg_sets()
    diffs = []
    for name, a, b, n in zip(_GRAPH_SET_NAMES, before, after, neo):
        missing = (a & b) - n
        extra = n - (a | b)
        if missing or extra:
            diffs.append(f"{name}: thiếu {len(missing)} (vd {sorted(missing)[:3]}), thừa {len(extra)} (vd {sorted(extra)[:3]})")
    return diffs


def _assert_graph_matches_pg(label: str) -> None:
    # Thử lại tối đa 3 lần phòng trường hợp hiếm (bản ghi tạo rồi xoá ngay giữa hai lần chụp); rebuild sai thật thì lần nào cũng lệch.
    diffs: list[str] = []
    for _ in range(3):
        diffs = _rebuild_and_compare()
        if not diffs:
            return
    raise AssertionError(f"{label}: đồ thị không khớp PostgreSQL — " + "; ".join(diffs))


def test_rebuild_graph_matches_postgresql_seed_and_is_idempotent():
    """rebuild_graph trên DB seed: số nút/cạnh khớp dữ liệu PostgreSQL; chạy lại lần nữa vẫn khớp (lặp được)."""
    _assert_graph_matches_pg("rebuild_graph lần 1")
    _assert_graph_matches_pg("rebuild_graph lần 2")


# =====================================================================
# 4. TIÊU CHÍ: AUDIT ĐỦ 4 HÀNH ĐỘNG & BẢO MẬT (brief mục 5, dòng 8)
# =====================================================================

async def test_audit_covers_four_actions_and_no_secret_leaks():
    """Audit đủ 4 hành động (USER_CREATED, USER_UPDATED, USER_DEACTIVATED, USER_ACTIVATED),
    không dòng nào chứa temporary_password hay password_hash, chuỗi băm audit không đứt."""
    # Chỉ kiểm chuỗi băm từ mốc trước test: DB dev chung có dòng cũ với hash giả (audit bất biến, không xoá được)
    with db() as conn:
        start_id = conn.execute("SELECT COALESCE(MAX(id), 0) FROM audit_logs").fetchone()[0]
    admin = make_user("ADMIN")
    c, headers = auth_client(admin)

    async with c:
        # 1. USER_CREATED
        r_create = await c.post("/api/v1/users", json={
            "email": f"tsk18-audit-{uuid.uuid4().hex[:6]}@asllaw.vn",
            "full_name": "Audit Test User",
            "system_role": "ATTORNEY",
            "is_executive": False
        }, headers=headers)
        assert r_create.status_code == 201, r_create.text
        uid = r_create.json()["data"].get("id") or r_create.json()["data"]["user"]["id"]

        # 2. USER_UPDATED
        r_upd = await c.patch(f"/api/v1/users/{uid}", json={"full_name": "Audit Test User Sửa"}, headers=headers)
        assert r_upd.status_code == 200, r_upd.text

        # 3. USER_DEACTIVATED
        r_deact = await c.post(f"/api/v1/users/{uid}/deactivate", json={"reason": "Audit deact test"}, headers=headers)
        assert r_deact.status_code in (200, 204), r_deact.text

        # 4. USER_ACTIVATED
        r_act = await c.post(f"/api/v1/users/{uid}/activate", headers=headers)
        assert r_act.status_code in (200, 204), r_act.text

    # Kiểm tra PostgreSQL audit_logs có đủ 4 hành động
    with db() as conn:
        actions = set(
            row[0] for row in conn.execute(
                """SELECT action FROM audit_logs
                   WHERE entity_id = %s""",
                (uid,)
            ).fetchall()
        )
    expected_actions = {"USER_CREATED", "USER_UPDATED", "USER_DEACTIVATED", "USER_ACTIVATED"}
    assert expected_actions.issubset(actions), f"Thiếu hành động audit: {expected_actions - actions} (có: {actions})"

    # Kiểm tra chuỗi băm mật mã toàn vẹn
    with db() as conn:
        is_valid, count, err = verify_audit_chain(conn, from_id=start_id + 1)
    assert is_valid is True, f"Chuỗi băm audit_logs bị đứt: {err} (đã kiểm {count} bản ghi)"

    # Tuyệt đối không dòng nào chứa temporary_password, password_hash hay argon2
    with db() as conn:
        leaks = conn.execute("""
            SELECT id, action, before_state, after_state FROM audit_logs
            WHERE (before_state::text ILIKE '%password_hash%'
                   OR after_state::text ILIKE '%password_hash%'
                   OR before_state::text ILIKE '%temporary_password%'
                   OR after_state::text ILIKE '%temporary_password%'
                   OR before_state::text ILIKE '%$argon2id$%'
                   OR after_state::text ILIKE '%$argon2id$%')
        """).fetchall()
    assert len(leaks) == 0, f"Phát hiện rò rỉ mật khẩu/băm trong audit_logs: {leaks}"


# =====================================================================
# 5. CHỐNG LÁCH & BẢO TOÀN KIẾN TRÚC (brief mục 6)
# =====================================================================

def test_no_hardcoded_test_bypass_in_source_code():
    """Code sản phẩm không được chứa nhánh riêng cho test (tsk18-, pytest)."""
    from pathlib import Path
    app_dir = Path("backend/app")
    source_files = list(app_dir.rglob("*.py"))
    assert len(source_files) > 0

    all_content = []
    for f in source_files:
        all_content.append(f.read_text(encoding="utf-8"))
    combined = "\n".join(all_content)

    assert "tsk18-" not in combined, "Code sản phẩm chứa chuỗi hard-code 'tsk18-' để lách test"
    assert "import pytest" not in combined, "Code sản phẩm không được import pytest"
