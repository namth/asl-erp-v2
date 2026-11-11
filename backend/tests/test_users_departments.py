"""Nghiệm thu TSK-18 (TASK-014) — Người dùng, phòng ban & phân quyền.

Hợp đồng: docs/07-api-contracts.md §1.2–1.3, §2, §3.2; docs/06-database-schema.md
bảng users, departments, department_leaders, outbox_events; DEC-01.

Chạy thật với PostgreSQL dev và Redis cục bộ (DB 15).
Neo4j dev: chỉ tạo/xoá nút gắn email tsk18-…@asllaw.vn và phòng ban mã T18…,
không xoá dữ liệu seed.
"""
import os
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
    """Dọn dữ liệu test trước và sau mỗi test — chỉ xoá tsk18- và T18, không đụng dữ liệu seed."""
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
    full_name="Người Dùng Kiểm Thử",
    title="Luật sư",
    is_executive=False,
    department_id=None,
    is_active=True,
    must_reset=False,
    totp_enabled=False
) -> dict:
    if email is None:
        email = f"tsk18-{uuid.uuid4().hex[:10]}@asllaw.vn"
    with db() as conn:
        row = conn.execute(
            """INSERT INTO users (email, password_hash, full_name, title, system_role,
                                  is_executive, department_id, totp_enabled, must_reset_password, is_active)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (email, TEST_HASHER.hash(PASSWORD), full_name, title, role,
             is_executive, department_id, totp_enabled, must_reset, is_active),
        ).fetchone()
    return {"id": str(row[0]), "email": email, "role": role, "is_executive": is_executive}


def make_department(code=None, name=None) -> dict:
    if code is None:
        code = f"T18_{uuid.uuid4().hex[:6].upper()}"
    if name is None:
        name = f"Ban Kiểm Thử {code}"
    with db() as conn:
        row = conn.execute(
            """INSERT INTO departments (code, name) VALUES (%s, %s)
               ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
               RETURNING id""",
            (code, name)
        ).fetchone()
    return {"id": str(row[0]), "code": code, "name": name}


def make_token(user_id: str, role: str = "ADMIN") -> str:
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "jti": str(uuid.uuid4()),
        "iat": now - 30,  # lùi 30 giây: đồng hồ DB (tokens_valid_after = now() của DB) có thể nhanh hơn máy chạy test
        "exp": now + 1800,
        "system_role": role,
        "role": role,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def auth_client(user: dict, csrf_val: str = "csrf-test-token-fixed") -> tuple[httpx.AsyncClient, dict]:
    c = client()
    token = make_token(user["id"], user.get("role", "ADMIN"))
    c.cookies.set("access_token", token, domain="testserver")
    c.cookies.set("csrf_token", csrf_val, domain="testserver")
    headers = {
        "X-CSRF-Token": csrf_val,
        "Authorization": f"Bearer {token}",
    }
    return c, headers


async def login(c: httpx.AsyncClient, email: str, password: str = PASSWORD) -> httpx.Response:
    return await c.post("/api/v1/auth/login", json={"email": email, "password": password})


def csrf(c: httpx.AsyncClient) -> dict:
    return {"X-CSRF-Token": c.cookies.get("csrf_token") or ""}


def error_code(resp: httpx.Response) -> str:
    body = resp.json()
    assert body.get("success") is False, body
    return body["error"]["code"]


# =====================================================================
# 1. TIÊU CHÍ: ADMIN TẠO USER & RÀNG BUỘC (brief mục 5, dòng 1)
# =====================================================================

async def test_admin_creates_user_success_and_login_requires_reset():
    """ADMIN tạo user → 201 có temporary_password; đăng nhập bằng mật khẩu đó → 403 PASSWORD_RESET_REQUIRED;
    audit USER_CREATED không chứa temporary_password hay password_hash."""
    admin = make_user("ADMIN")
    c, headers = auth_client(admin)
    async with c:
        email = f"tsk18-user-{uuid.uuid4().hex[:8]}@asllaw.vn"
        payload = {
            "email": email,
            "full_name": "Nguyễn Văn Test",
            "title": "Luật sư tư vấn",
            "phone_number": "0987654321",
            "system_role": "ATTORNEY",
            "is_executive": False,
            "department_id": None
        }
        r = await c.post("/api/v1/users", json=payload, headers=headers)

    assert r.status_code == 201, r.text
    body = r.json()
    assert body.get("success") is True, body
    data = body.get("data", {})
    temp_pass = data.get("temporary_password") or (data.get("user") or {}).get("temporary_password")
    assert temp_pass, f"Response 201 phải chứa temporary_password: {body}"
    assert len(temp_pass) >= 16, f"Mật khẩu tạm phải >= 16 ký tự, nhận: {temp_pass}"

    user_id = data.get("id") or (data.get("user") or {}).get("id")
    assert user_id, f"Response 201 phải chứa user id: {body}"

    # Kiểm tra DB: must_reset_password = TRUE, Argon2id hash
    with db() as conn:
        row = conn.execute(
            "SELECT password_hash, must_reset_password, is_active FROM users WHERE id = %s",
            (user_id,)
        ).fetchone()
    assert row is not None, "Không tìm thấy user trong DB"
    pwd_hash, must_reset, is_active = row
    assert must_reset is True, "must_reset_password phải là True khi tạo mới"
    assert is_active is True, "is_active phải là True"
    assert pwd_hash.startswith("$argon2id$"), f"Mật khẩu phải băm Argon2id: {pwd_hash}"

    # Đăng nhập bằng mật khẩu tạm → 403 PASSWORD_RESET_REQUIRED
    async with client() as guest:
        login_resp = await login(guest, email, temp_pass)
    assert login_resp.status_code == 403, login_resp.text
    assert error_code(login_resp) == "PASSWORD_RESET_REQUIRED"
    assert "reset_token" in login_resp.json()["error"].get("details", {})

    # Kiểm tra outbox_events: đúng 1 dòng
    with db() as conn:
        outbox_rows = conn.execute(
            "SELECT event_type, payload FROM outbox_events WHERE payload->>'id' = %s",
            (user_id,)
        ).fetchall()
    assert len(outbox_rows) == 1, f"Tạo user phải sinh đúng 1 dòng outbox_events: {outbox_rows}"
    assert outbox_rows[0][0] in ("USER_UPSERTED", "USER_CREATED")

    # Kiểm tra audit_logs: đúng 1 dòng USER_CREATED, không lộ mật khẩu
    with db() as conn:
        audit_rows = conn.execute(
            """SELECT action, before_state, after_state FROM audit_logs
               WHERE action = 'USER_CREATED' AND entity_id = %s""",
            (user_id,)
        ).fetchall()
    assert len(audit_rows) == 1, f"Audit log phải có đúng 1 dòng USER_CREATED: {audit_rows}"
    _, before_st, after_st = audit_rows[0]
    raw_audit = f"{before_st} {after_st}"
    assert temp_pass not in raw_audit, "Audit log không được chứa temporary_password"
    assert pwd_hash not in raw_audit, "Audit log không được chứa password_hash"
    assert "argon2" not in raw_audit.lower(), "Audit log không được chứa hash argon2"


async def test_create_user_email_domain_and_duplicate_validation():
    """Email sai đuôi → 422; email trùng → 409 DUPLICATE_EMAIL."""
    admin = make_user("ADMIN")
    c, headers = auth_client(admin)
    async with c:
        # Email ngoài đuôi @asllaw.vn
        r_bad_domain = await c.post("/api/v1/users", json={
            "email": "luatsutest@gmail.com",
            "full_name": "Tên Hợp Lệ",
            "system_role": "ATTORNEY",
            "is_executive": False
        }, headers=headers)
        assert r_bad_domain.status_code == 422, r_bad_domain.text
        assert error_code(r_bad_domain) == "VALIDATION_ERROR"

        # Email sai cú pháp
        r_invalid = await c.post("/api/v1/users", json={
            "email": "khong-phai-email",
            "full_name": "Tên Hợp Lệ",
            "system_role": "ATTORNEY",
            "is_executive": False
        }, headers=headers)
        assert r_invalid.status_code == 422, r_invalid.text

        # Email trùng
        dup_email = f"tsk18-dup-{uuid.uuid4().hex[:8]}@asllaw.vn"
        r_ok = await c.post("/api/v1/users", json={
            "email": dup_email,
            "full_name": "Người Đầu Tiên",
            "system_role": "ATTORNEY",
            "is_executive": False
        }, headers=headers)
        assert r_ok.status_code == 201, r_ok.text

        r_conflict = await c.post("/api/v1/users", json={
            "email": dup_email,
            "full_name": "Người Trùng Email",
            "system_role": "ATTORNEY",
            "is_executive": False
        }, headers=headers)
        assert r_conflict.status_code == 409, r_conflict.text
        assert error_code(r_conflict) == "DUPLICATE_EMAIL"


async def test_create_user_is_executive_validation():
    """is_executive chỉ hợp lệ với MANAGER (422 với vai trò khác)."""
    admin = make_user("ADMIN")
    c, headers = auth_client(admin)
    async with c:
        for invalid_role in ("ATTORNEY", "ACCOUNTANT", "ADMIN"):
            r = await c.post("/api/v1/users", json={
                "email": f"tsk18-exec-{uuid.uuid4().hex[:6]}@asllaw.vn",
                "full_name": f"Test {invalid_role}",
                "system_role": invalid_role,
                "is_executive": True
            }, headers=headers)
            assert r.status_code == 422, f"is_executive=True với {invalid_role} phải bị 422: {r.text}"
            assert error_code(r) == "VALIDATION_ERROR"

        # Với MANAGER → hợp lệ 201
        r_mgr = await c.post("/api/v1/users", json={
            "email": f"tsk18-exec-mgr-{uuid.uuid4().hex[:6]}@asllaw.vn",
            "full_name": "Giám Đốc Test",
            "system_role": "MANAGER",
            "is_executive": True
        }, headers=headers)
        assert r_mgr.status_code == 201, r_mgr.text


# =====================================================================
# 2. TIÊU CHÍ: RBAC & CSRF TRÊN CÁC ROUTE (brief mục 5, dòng 2)
# =====================================================================

async def test_rbac_manager_and_attorney_denied_write_routes():
    """MANAGER/ATTORNEY gọi route ghi → 403."""
    mgr = make_user("MANAGER")
    attorney = make_user("ATTORNEY")
    target_user = make_user("ATTORNEY")
    dept = make_department()

    write_endpoints = [
        ("POST", "/api/v1/users", {"email": f"tsk18-x-{uuid.uuid4().hex[:6]}@asllaw.vn", "full_name": "A", "system_role": "ATTORNEY"}),
        ("PATCH", f"/api/v1/users/{target_user['id']}", {"full_name": "Tên Đổi"}),
        ("POST", f"/api/v1/users/{target_user['id']}/deactivate", {"reason": "Test"}),
        ("POST", f"/api/v1/users/{target_user['id']}/activate", {}),
        ("POST", "/api/v1/departments", {"code": f"T18_{uuid.uuid4().hex[:4].upper()}", "name": "Ban Mới"}),
        ("PUT", f"/api/v1/departments/{dept['id']}/leaders", {"leader_user_ids": [mgr["id"]]}),
    ]

    for role_user in (mgr, attorney):
        c, headers = auth_client(role_user)
        async with c:
            for method, path, payload in write_endpoints:
                if method == "POST":
                    resp = await c.post(path, json=payload, headers=headers)
                elif method == "PATCH":
                    resp = await c.patch(path, json=payload, headers=headers)
                elif method == "PUT":
                    resp = await c.put(path, json=payload, headers=headers)
                assert resp.status_code == 403, f"{role_user['role']} gọi {method} {path} phải nhận 403, nhận {resp.status_code}: {resp.text}"
                assert error_code(resp) in ("FORBIDDEN_ROLE", "FORBIDDEN_ROLE")


async def test_rbac_read_routes_permissions():
    """ATTORNEY gọi GET /users → 403; MANAGER gọi GET /users, /departments → 200."""
    attorney = make_user("ATTORNEY")
    mgr = make_user("MANAGER")
    accountant = make_user("ACCOUNTANT")
    target_user = make_user("ATTORNEY")

    # ATTORNEY bị từ chối
    c_att, h_att = auth_client(attorney)
    async with c_att:
        r1 = await c_att.get("/api/v1/users", headers=h_att)
        assert r1.status_code == 403, f"ATTORNEY xem danh sách user phải 403: {r1.text}"
        r2 = await c_att.get(f"/api/v1/users/{target_user['id']}", headers=h_att)
        assert r2.status_code == 403, f"ATTORNEY xem chi tiết user phải 403: {r2.text}"
        r3 = await c_att.get("/api/v1/departments", headers=h_att)
        assert r3.status_code == 403, f"ATTORNEY xem phòng ban phải 403: {r3.text}"

    # ACCOUNTANT bị từ chối GET /users
    c_acc, h_acc = auth_client(accountant)
    async with c_acc:
        r_acc = await c_acc.get("/api/v1/users", headers=h_acc)
        assert r_acc.status_code == 403

    # MANAGER được phép đọc
    c_mgr, h_mgr = auth_client(mgr)
    async with c_mgr:
        r_mgr_users = await c_mgr.get("/api/v1/users", headers=h_mgr)
        assert r_mgr_users.status_code == 200, r_mgr_users.text
        r_mgr_user = await c_mgr.get(f"/api/v1/users/{target_user['id']}", headers=h_mgr)
        assert r_mgr_user.status_code == 200, r_mgr_user.text
        r_mgr_depts = await c_mgr.get("/api/v1/departments", headers=h_mgr)
        assert r_mgr_depts.status_code == 200, r_mgr_depts.text


async def test_csrf_protection_on_write_routes():
    """Route ghi thiếu CSRF hoặc CSRF sai → 403 CSRF_INVALID."""
    admin = make_user("ADMIN")
    c = client()
    token = make_token(admin["id"], "ADMIN")
    c.cookies.set("access_token", token, domain="testserver")
    c.cookies.set("csrf_token", "real-csrf-token-1234", domain="testserver")

    async with c:
        # Không có header X-CSRF-Token
        r_missing = await c.post("/api/v1/users", json={
            "email": f"tsk18-nocsrf-{uuid.uuid4().hex[:6]}@asllaw.vn",
            "full_name": "Test CSRF",
            "system_role": "ATTORNEY"
        })
        assert r_missing.status_code == 403, r_missing.text
        assert error_code(r_missing) == "CSRF_INVALID"

        # Header X-CSRF-Token sai
        r_wrong = await c.post("/api/v1/users", json={
            "email": f"tsk18-wrongcsrf-{uuid.uuid4().hex[:6]}@asllaw.vn",
            "full_name": "Test CSRF",
            "system_role": "ATTORNEY"
        }, headers={"X-CSRF-Token": "sai-csrf-token"})
        assert r_wrong.status_code == 403, r_wrong.text
        assert error_code(r_wrong) == "CSRF_INVALID"

        # POST /departments thiếu CSRF
        r_dept = await c.post("/api/v1/departments", json={
            "code": "T18_CSRF", "name": "Ban CSRF"
        })
        assert r_dept.status_code == 403
        assert error_code(r_dept) == "CSRF_INVALID"


# =====================================================================
# 3. TIÊU CHÍ: KHOÁ TÀI KHOẢN & ĐỒNG BỘ NEO4J NGAY LẬP TỨC (brief mục 5, dòng 3)
# =====================================================================

async def test_deactivate_user_revokes_session_locks_login_and_updates_neo4j_immediately():
    """Khoá tài khoản: phiên đang mở → 401 TOKEN_REVOKED ngay request kế tiếp;
    đăng nhập lại → 423 ACCOUNT_LOCKED;
    Neo4j: u.is_active=false và không còn cạnh :LEADS/:ASSIGNED_TO — kiểm ngay sau request, không gọi process_outbox."""
    dept = make_department()
    victim = make_user("MANAGER", department_id=dept["id"])
    case_id = str(uuid.uuid4())
    case_code = f"ASL-2026-T18-{uuid.uuid4().hex[:4].upper()}"

    # Dựng quan hệ trong PostgreSQL
    with db() as conn:
        conn.execute(
            "INSERT INTO department_leaders (user_id, department_id) VALUES (%s, %s)",
            (victim["id"], dept["id"])
        )
        # Vụ việc cần đủ cột NOT NULL: loại vụ việc + khách hàng tạo riêng cho test
        mt_code = "".join(__import__("random").choice("ABCDEFGHJKLMNPQRSTUVWXYZ") for _ in range(4))
        mt_id = conn.execute(
            "INSERT INTO matter_types (department_id, name, code) VALUES (%s, %s, %s) RETURNING id",
            (dept["id"], "Loại vụ việc test T18", mt_code)).fetchone()[0]
        client_id = conn.execute(
            """INSERT INTO clients (client_type, name, normalized_name, phone, address)
               VALUES ('FOREIGN', %s, %s, '0900000000', 'Hà Nội') RETURNING id""",
            (f"Khach test T18 {case_code}", f"khach test t18 {case_code.lower()}")).fetchone()[0]
        conn.execute(
            """INSERT INTO cases (id, case_code, department_id, title, client_id, matter_type_id,
                                  workflow_mode, contract_value, status)
               VALUES (%s, %s, %s, %s, %s, %s, 'STRICT', 1000000, 'ACTIVE')""",
            (case_id, case_code, dept["id"], "Vụ việc test phân công", client_id, mt_id)
        )
        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case)
               VALUES (%s, %s, 'CASE_MANAGER')""",
            (case_id, victim["id"])
        )

    # Dựng nút & cạnh trong Neo4j dev
    driver = neo4j_driver()
    with driver.session() as s:
        s.run("""
            MERGE (u:User {id: $uid})
            SET u.email = $email, u.is_active = true, u.system_role = 'MANAGER', u.is_executive = false
            MERGE (d:Department {id: $did})
            SET d.code = $dcode, d.name = $dname
            MERGE (c:Case {id: $cid})
            SET c.case_code = $ccode, c.status = 'ACTIVE'
            MERGE (u)-[:LEADS]->(d)
            MERGE (u)-[:ASSIGNED_TO {role: 'CASE_MANAGER'}]->(c)
        """, uid=victim["id"], email=victim["email"], did=dept["id"], dcode=dept["code"],
             dname=dept["name"], cid=case_id, ccode=case_code)
    driver.close()

    # Phiên đang mở của victim
    c_victim, h_victim = auth_client(victim)
    async with c_victim:
        r_pre = await c_victim.get("/api/v1/auth/me", headers=h_victim)
        assert r_pre.status_code == 200, "Phiên victim trước khi khoá phải hoạt động bình thường"

    # ADMIN gọi khoá tài khoản
    admin = make_user("ADMIN")
    c_admin, h_admin = auth_client(admin)
    async with c_admin:
        r_deact = await c_admin.post(
            f"/api/v1/users/{victim['id']}/deactivate",
            json={"reason": "Nghỉ việc chuyển công tác"},
            headers=h_admin
        )
    assert r_deact.status_code in (200, 204), f"Khoá tài khoản thất bại: {r_deact.text}"

    # 1. Phiên đang mở của victim → 401 TOKEN_REVOKED ngay request kế tiếp
    async with c_victim:
        r_post = await c_victim.get("/api/v1/auth/me", headers=h_victim)
    assert r_post.status_code == 401, f"Sau khoá phải bị 401, nhận: {r_post.status_code}"
    assert error_code(r_post) == "TOKEN_REVOKED"

    # 2. Đăng nhập lại → 423 ACCOUNT_LOCKED
    async with client() as guest:
        r_relogin = await login(guest, victim["email"])
    assert r_relogin.status_code == 423, f"Đăng nhập tài khoản bị khoá phải nhận 423, nhận: {r_relogin.status_code}"
    assert error_code(r_relogin) == "ACCOUNT_LOCKED"

    # 3. Neo4j KIỂM NGAY SAU REQUEST (không gọi process_outbox): u.is_active=false, gỡ cạnh :LEADS & :ASSIGNED_TO
    driver = neo4j_driver()
    with driver.session() as s:
        res = s.run("""
            MATCH (u:User {id: $uid})
            OPTIONAL MATCH (u)-[r_lead:LEADS]->()
            OPTIONAL MATCH (u)-[r_ass:ASSIGNED_TO]->()
            RETURN u.is_active AS active, count(r_lead) AS cnt_lead, count(r_ass) AS cnt_ass
        """, uid=victim["id"]).single()
    driver.close()

    assert res is not None, "Nút User không tồn tại trên Neo4j"
    assert res["active"] is False, "u.is_active trên Neo4j phải là false ngay lập tức"
    assert res["cnt_lead"] == 0, "Cạnh :LEADS của user bị khoá phải bị gỡ ngay lập tức"
    assert res["cnt_ass"] == 0, "Cạnh :ASSIGNED_TO của user bị khoá phải bị gỡ ngay lập tức"

    # Kiểm tra audit log: USER_DEACTIVATED
    with db() as conn:
        n_audit = conn.execute(
            "SELECT count(*) FROM audit_logs WHERE action = 'USER_DEACTIVATED' AND entity_id = %s",
            (victim["id"],)
        ).fetchone()[0]
    assert n_audit == 1, "Phải ghi đúng 1 dòng audit USER_DEACTIVATED"


async def test_activate_user_restores_active_status():
    """POST /users/{id}/activate mở lại tài khoản, ghi audit USER_ACTIVATED."""
    target = make_user("ATTORNEY", is_active=False)
    admin = make_user("ADMIN")
    c, headers = auth_client(admin)
    async with c:
        r = await c.post(f"/api/v1/users/{target['id']}/activate", headers=headers)
    assert r.status_code in (200, 204), r.text

    with db() as conn:
        active = conn.execute("SELECT is_active FROM users WHERE id = %s", (target["id"],)).fetchone()[0]
        n_audit = conn.execute(
            "SELECT count(*) FROM audit_logs WHERE action = 'USER_ACTIVATED' AND entity_id = %s",
            (target["id"],)
        ).fetchone()[0]
    assert active is True, "is_active phải trở lại True sau activate"
    assert n_audit == 1, "Phải ghi đúng 1 dòng audit USER_ACTIVATED"


# =====================================================================
# 4. TIÊU CHÍ: ADMIN TỰ KHOÁ/HẠ VAI TRÒ & THU HỒI PHIÊN KHI ĐỔI ROLE (brief mục 5, dòng 4)
# =====================================================================

async def test_admin_cannot_self_deactivate_or_self_demote():
    """ADMIN tự khoá/tự hạ vai trò → 403."""
    admin = make_user("ADMIN")
    c, headers = auth_client(admin)
    async with c:
        # Tự khoá chính mình
        r_deact = await c.post(
            f"/api/v1/users/{admin['id']}/deactivate",
            json={"reason": "Tự khoá test"},
            headers=headers
        )
        assert r_deact.status_code == 403, f"ADMIN tự khoá phải 403: {r_deact.text}"
        assert error_code(r_deact) in ("FORBIDDEN_ROLE", "FORBIDDEN_ROLE")

        # Tự hạ vai trò xuống ATTORNEY
        r_demote_attorney = await c.patch(
            f"/api/v1/users/{admin['id']}",
            json={"system_role": "ATTORNEY"},
            headers=headers
        )
        assert r_demote_attorney.status_code == 403, f"ADMIN tự hạ vai trò phải 403: {r_demote_attorney.text}"

        # Tự hạ vai trò xuống MANAGER
        r_demote_mgr = await c.patch(
            f"/api/v1/users/{admin['id']}",
            json={"system_role": "MANAGER"},
            headers=headers
        )
        assert r_demote_mgr.status_code == 403, f"ADMIN tự hạ vai trò phải 403: {r_demote_mgr.text}"

    # Xác nhận DB không bị đổi
    with db() as conn:
        role, is_act = conn.execute(
            "SELECT system_role, is_active FROM users WHERE id = %s",
            (admin["id"],)
        ).fetchone()
    assert role == "ADMIN" and is_act is True


async def test_patch_user_role_or_dept_revokes_sessions():
    """Đổi system_role hoặc department_id → phiên cũ 401 TOKEN_REVOKED; audit USER_UPDATED có before/after."""
    dept1 = make_department(name="Phòng Ban Cũ")
    dept2 = make_department(name="Phòng Ban Mới")
    user_target = make_user("ATTORNEY", department_id=dept1["id"])

    # Phiên đang hoạt động của user_target
    c_target, h_target = auth_client(user_target)
    async with c_target:
        r_init = await c_target.get("/api/v1/auth/me", headers=h_target)
        assert r_init.status_code == 200

    # ADMIN đổi system_role của user_target
    admin = make_user("ADMIN")
    c_admin, h_admin = auth_client(admin)
    async with c_admin:
        r_patch = await c_admin.patch(
            f"/api/v1/users/{user_target['id']}",
            json={"system_role": "MANAGER", "department_id": dept2["id"]},
            headers=h_admin
        )
    assert r_patch.status_code == 200, r_patch.text

    # Phiên cũ của user_target phải nhận 401 TOKEN_REVOKED
    async with c_target:
        r_after = await c_target.get("/api/v1/auth/me", headers=h_target)
    assert r_after.status_code == 401, f"Phiên cũ phải bị thu hồi, nhận: {r_after.status_code}"
    assert error_code(r_after) == "TOKEN_REVOKED"

    # Audit USER_UPDATED có before_state / after_state, không chứa password_hash
    with db() as conn:
        row = conn.execute(
            """SELECT before_state, after_state FROM audit_logs
               WHERE action = 'USER_UPDATED' AND entity_id = %s
               ORDER BY created_at DESC LIMIT 1""",
            (user_target["id"],)
        ).fetchone()
    assert row is not None, "Phải ghi audit USER_UPDATED"
    b_st, a_st = str(row[0]), str(row[1])
    assert "password_hash" not in b_st and "password_hash" not in a_st
    assert "argon2" not in b_st.lower() and "argon2" not in a_st.lower()
    assert "ATTORNEY" in b_st and "MANAGER" in a_st


# =====================================================================
# 5. TIÊU CHÍ: PUT LEADERS & ĐỒNG BỘ CẠNH :LEADS (brief mục 5, dòng 5)
# =====================================================================

async def test_put_department_leaders_validation():
    """PUT leaders với user không phải MANAGER hoặc không hoạt động → 422."""
    dept = make_department()
    attorney = make_user("ATTORNEY")
    inactive_mgr = make_user("MANAGER", is_active=False)

    admin = make_user("ADMIN")
    c, headers = auth_client(admin)
    async with c:
        # Gán ATTORNEY làm leader → 422
        r_att = await c.put(
            f"/api/v1/departments/{dept['id']}/leaders",
            json={"leader_user_ids": [attorney["id"]]},
            headers=headers
        )
        assert r_att.status_code == 422, r_att.text
        assert error_code(r_att) == "VALIDATION_ERROR"

        # Gán MANAGER đã bị khoá → 422
        r_inact = await c.put(
            f"/api/v1/departments/{dept['id']}/leaders",
            json={"leader_user_ids": [inactive_mgr["id"]]},
            headers=headers
        )
        assert r_inact.status_code == 422, r_inact.text
        assert error_code(r_inact) == "VALIDATION_ERROR"

        # Phòng ban không tồn tại → 404
        r_404 = await c.put(
            f"/api/v1/departments/{uuid.uuid4()}/leaders",
            json={"leader_user_ids": []},
            headers=headers
        )
        assert r_404.status_code == 404


async def test_put_department_leaders_neo4j_sync_replaces_old_leaders():
    """Với MANAGER → Neo4j có đúng cạnh :LEADS mới, cạnh cũ bị gỡ."""
    dept = make_department()
    m1 = make_user("MANAGER", full_name="Trưởng Phòng 1")
    m2 = make_user("MANAGER", full_name="Trưởng Phòng 2")

    # Dựng các nút trên Neo4j
    driver = neo4j_driver()
    with driver.session() as s:
        s.run("""
            MERGE (d:Department {id: $did}) SET d.code = $dcode, d.name = $dname
            MERGE (u1:User {id: $uid1}) SET u1.email = $e1, u1.system_role = 'MANAGER', u1.is_active = true
            MERGE (u2:User {id: $uid2}) SET u2.email = $e2, u2.system_role = 'MANAGER', u2.is_active = true
        """, did=dept["id"], dcode=dept["code"], dname=dept["name"],
             uid1=m1["id"], e1=m1["email"], uid2=m2["id"], e2=m2["email"])
    driver.close()

    admin = make_user("ADMIN")
    c, headers = auth_client(admin)
    async with c:
        # Bước 1: Gán M1 làm Trưởng phòng
        r1 = await c.put(
            f"/api/v1/departments/{dept['id']}/leaders",
            json={"leader_user_ids": [m1["id"]]},
            headers=headers
        )
        assert r1.status_code == 200, r1.text

        # Kiểm tra Neo4j: m1 leads dept
        driver = neo4j_driver()
        with driver.session() as s:
            cnt1 = s.run("""
                MATCH (u:User {id: $uid})-[:LEADS]->(d:Department {id: $did})
                RETURN count(*) AS cnt
            """, uid=m1["id"], did=dept["id"]).single()["cnt"]
        driver.close()
        assert cnt1 == 1, "M1 phải có cạnh :LEADS tới Department"

        # Bước 2: Thay bằng M2 (gỡ M1)
        r2 = await c.put(
            f"/api/v1/departments/{dept['id']}/leaders",
            json={"leader_user_ids": [m2["id"]]},
            headers=headers
        )
        assert r2.status_code == 200, r2.text

        # Kiểm tra Neo4j: m2 leads dept, m1 KHÔNG CÒN leads dept
        driver = neo4j_driver()
        with driver.session() as s:
            rec = s.run("""
                OPTIONAL MATCH (u1:User {id: $uid1})-[:LEADS]->(d:Department {id: $did})
                OPTIONAL MATCH (u2:User {id: $uid2})-[:LEADS]->(d:Department {id: $did})
                RETURN count(u1) AS cnt_m1, count(u2) AS cnt_m2
            """, uid1=m1["id"], uid2=m2["id"], did=dept["id"]).single()
        driver.close()

        assert rec["cnt_m2"] == 1, "M2 phải có cạnh :LEADS mới"
        assert rec["cnt_m1"] == 0, "Cạnh :LEADS cũ của M1 phải bị gỡ"


# =====================================================================
# 6. TIÊU CHÍ: GET /USERS LỌC & PHÂN TRANG, KHÔNG LỘ BÍ MẬT (brief mục 4)
# =====================================================================

async def test_get_users_filtering_pagination_and_secret_redaction():
    """GET /users?q=&role=&department_id=&page=&limit= có meta phân trang, không trả password_hash/totp_secret_enc."""
    dept = make_department(name="Ban Độc Nhất T18")
    u_alice = make_user("ATTORNEY", email=f"tsk18-alice-{uuid.uuid4().hex[:6]}@asllaw.vn", full_name="Alice Nguyen T18")
    u_bob = make_user("MANAGER", email=f"tsk18-bob-{uuid.uuid4().hex[:6]}@asllaw.vn", full_name="Bob Tran T18", department_id=dept["id"])

    admin = make_user("ADMIN")
    c, headers = auth_client(admin)
    async with c:
        # Lọc theo q
        r_q = await c.get(f"/api/v1/users?q={u_alice['email']}", headers=headers)
        assert r_q.status_code == 200, r_q.text
        body_q = r_q.json()
        assert body_q["success"] is True
        items_q = body_q["data"] if isinstance(body_q["data"], list) else body_q["data"].get("users", body_q["data"].get("items", []))
        assert any(item["id"] == u_alice["id"] for item in items_q)

        # Lọc theo role=MANAGER
        r_role = await c.get("/api/v1/users?role=MANAGER", headers=headers)
        assert r_role.status_code == 200
        items_role = r_role.json()["data"] if isinstance(r_role.json()["data"], list) else r_role.json()["data"].get("users", [])
        for item in items_role:
            assert item["system_role"] == "MANAGER"

        # Lọc theo department_id
        r_dept = await c.get(f"/api/v1/users?department_id={dept['id']}", headers=headers)
        assert r_dept.status_code == 200
        items_dept = r_dept.json()["data"] if isinstance(r_dept.json()["data"], list) else r_dept.json()["data"].get("users", [])
        assert any(item["id"] == u_bob["id"] for item in items_dept)

        # Phân trang
        r_page = await c.get("/api/v1/users?page=1&limit=2", headers=headers)
        assert r_page.status_code == 200
        meta = r_page.json().get("meta", {})
        assert meta.get("page") == 1
        assert meta.get("limit") == 2
        assert "total_records" in meta
        assert "total_pages" in meta

        # Tuyệt đối không chứa password_hash, totp_secret_enc
        raw_text = r_page.text
        assert "password_hash" not in raw_text, "GET /users lộ trường password_hash"
        assert "totp_secret_enc" not in raw_text, "GET /users lộ trường totp_secret_enc"
        assert "totp_secret" not in raw_text, "GET /users lộ trường totp_secret"


async def test_post_departments_and_duplicate_code():
    """POST /departments tạo mới; trùng code → 409."""
    admin = make_user("ADMIN")
    c, headers = auth_client(admin)
    code = f"T18_{uuid.uuid4().hex[:6].upper()}"
    async with c:
        r1 = await c.post("/api/v1/departments", json={"code": code, "name": "Ban Pháp Chế"}, headers=headers)
        assert r1.status_code == 201, r1.text

        r_dup = await c.post("/api/v1/departments", json={"code": code, "name": "Ban Trùng Mã"}, headers=headers)
        assert r_dup.status_code == 409, r_dup.text
