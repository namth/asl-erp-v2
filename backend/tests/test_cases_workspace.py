"""Nghiệm thu TSK-07 / TSK-08 / TSK-19 — Không gian vụ việc, Need-to-know, phân công, vòng đời & bình luận.

Hợp đồng: docs/07-api-contracts.md §3.4, §1.2-1.3
Quy tắc: docs/12-business-rules.md §1.2-1.4, §2.1-2.6
Schema: docs/06-database-schema.md (cases, case_assignments, case_task_comments)
Test cases: TC-SEC-01, TC-SEC-02, TC-SEC-10, TC-SEC-11, TC-SEC-12, TC-SEC-13, TC-CASE-03, TC-CASE-06
"""
import time
import uuid
import httpx
import jwt
import psycopg
import pytest

from backend.app.core.config import settings
from backend.app.main import app
from backend.app.db.neo4j import get_neo4j_driver


def db_conn():
    return psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True)


def make_auth_client(user_id: str) -> httpx.AsyncClient:
    now = int(time.time())
    # tokens_valid_after của user test lùi 10 phút: đồng hồ DB có thể nhanh hơn máy chạy test, token iat=now sẽ bị coi là bị thu hồi
    with db_conn() as _c:
        _c.execute("UPDATE users SET tokens_valid_after = now() - interval '10 minutes' WHERE id = %s", (str(user_id),))
    token = jwt.encode(
        {
            "sub": str(user_id),
            "jti": str(uuid.uuid4()),
            "iat": now,
            "exp": now + 1800,
            "typ": "access",
        },
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    csrf_token = uuid.uuid4().hex
    c = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://testserver",
        headers={"X-CSRF-Token": csrf_token, "Authorization": f"Bearer {token}"},
    )
    c.cookies.set("access_token", token)
    c.cookies.set("csrf_token", csrf_token)
    return c


def create_test_department(conn, code: str | None = None, name: str = "Ban SHTT Test") -> dict:
    dept_id = str(uuid.uuid4())
    dept_code = code or f"D{uuid.uuid4().hex[:5].upper()}"
    conn.execute(
        "INSERT INTO departments (id, name, code) VALUES (%s, %s, %s)",
        (dept_id, name, dept_code),
    )
    return {"id": dept_id, "name": name, "code": dept_code}


def create_test_user(
    conn,
    role: str = "ATTORNEY",
    *,
    is_executive: bool = False,
    full_name: str = "Luật sư Kiểm Thử",
    email: str | None = None,
) -> dict:
    user_id = str(uuid.uuid4())
    email = email or f"tsk07-{uuid.uuid4().hex[:8]}@asllaw.vn"
    conn.execute(
        """INSERT INTO users (id, email, password_hash, full_name, title, system_role,
                              is_executive, totp_enabled, must_reset_password, is_active)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (user_id, email, "testhash", full_name, "Luật sư", role, is_executive, False, False, True),
    )
    return {"id": user_id, "email": email, "role": role, "is_executive": is_executive}


def create_test_client(conn, name: str = "Khách Hàng Quốc Tế") -> dict:
    client_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO clients (id, client_type, name, normalized_name, phone, address, category_group)
           VALUES (%s, 'FOREIGN', %s, %s, '0987654321', '123 Foreign Ave', 'NEW')""",
        (client_id, name, name.lower()),
    )
    return {"id": client_id, "name": name}


def _free_matter_type_code(conn) -> str:
    """Mã loại vụ việc ngẫu nhiên 4 chữ A–Z chưa có trong DB (DB test dùng chung tích luỹ dữ liệu)."""
    import secrets, string
    while True:
        code = "".join(secrets.choice(string.ascii_uppercase) for _ in range(4))
        if conn.execute("SELECT 1 FROM matter_types WHERE code = %s", (code,)).fetchone() is None:
            return code


def create_test_matter_type(conn, department_id: str, code: str | None = None, name: str = "Đăng ký nhãn hiệu") -> dict:
    mt_id = str(uuid.uuid4())
    mt_code = code or _free_matter_type_code(conn)
    conn.execute(
        """INSERT INTO matter_types (id, department_id, name, code, custom_fields_schema)
           VALUES (%s, %s, %s, %s, '[]')""",
        (mt_id, department_id, name, mt_code),
    )
    return {"id": mt_id, "department_id": department_id, "name": name, "code": mt_code}


def create_test_case(
    conn,
    client_id: str,
    matter_type_id: str,
    department_id: str,
    *,
    workflow_mode: str = "STRICT",
    contract_value: str = "100000000",
    status: str = "ACTIVE",
    is_legacy: bool = False,
    matter_code: str = "TM",
    title: str = "Vụ việc đăng ký nhãn hiệu kiểm thử",
    created_by: str | None = None,
) -> dict:
    created_by = created_by or create_test_user(conn, "MANAGER")["id"]
    case_id = str(uuid.uuid4())
    case_code = f"ASL-2026-{matter_code[:3]}-{uuid.uuid4().hex[:4].upper()}"
    conn.execute(
        """INSERT INTO cases (id, case_code, title, client_id, matter_type_id, department_id,
                              workflow_mode, contract_value, status, is_legacy, custom_data, created_by)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, '{"filing_date": "2026-11-11"}', %s)""",
        (case_id, case_code, title, client_id, matter_type_id, department_id,
         workflow_mode, contract_value, status, is_legacy, created_by),
    )
    return {
        "id": case_id,
        "case_code": case_code,
        "title": title,
        "client_id": client_id,
        "matter_type_id": matter_type_id,
        "department_id": department_id,
        "workflow_mode": workflow_mode,
        "contract_value": contract_value,
        "status": status,
        "is_legacy": is_legacy,
    }


async def sync_neo4j_graph(
    users: list[dict] | None = None,
    departments: list[dict] | None = None,
    cases: list[dict] | None = None,
    *,
    leads: list[tuple[str, str]] | None = None,
    assignments: list[tuple[str, str, str]] | None = None,
    originators: list[tuple[str, str]] | None = None,
):
    driver = get_neo4j_driver()
    db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
    kwargs = {"database": db_name} if db_name else {}
    async with driver.session(**kwargs) as s:
        if users:
            for u in users:
                await s.run(
                    """MERGE (u:User {id: $uid})
                       SET u.email = $email, u.is_active = true,
                           u.system_role = $role, u.is_executive = $is_exec""",
                    uid=u["id"], email=u["email"], role=u["role"], is_exec=u.get("is_executive", False),
                )
        if departments:
            for d in departments:
                await s.run(
                    """MERGE (d:Department {id: $did})
                       SET d.code = $code""",
                    did=d["id"], code=d["code"],
                )
        if cases:
            for c in cases:
                await s.run(
                    """MERGE (c:Case {id: $cid})
                       SET c.case_code = $code, c.status = $status""",
                    cid=c["id"], code=c["case_code"], status=c["status"],
                )
                await s.run(
                    """MATCH (c:Case {id: $cid}), (d:Department {id: $did})
                       MERGE (c)-[:IN_DEPARTMENT]->(d)""",
                    cid=c["id"], did=c["department_id"],
                )
        if leads:
            for uid, did in leads:
                await s.run(
                    """MATCH (u:User {id: $uid}), (d:Department {id: $did})
                       MERGE (u)-[:LEADS]->(d)""",
                    uid=uid, did=did,
                )
        if assignments:
            for uid, cid, role in assignments:
                await s.run(
                    """MATCH (u:User {id: $uid}), (c:Case {id: $cid})
                       MERGE (u)-[r:ASSIGNED_TO {role: $role}]->(c)""",
                    uid=uid, cid=cid, role=role,
                )
        if originators:
            for uid, cid in originators:
                await s.run(
                    """MATCH (u:User {id: $uid}), (c:Case {id: $cid})
                       MERGE (u)-[:ORIGINATED]->(c)""",
                    uid=uid, cid=cid,
                )


async def cleanup_all(case_ids=None, user_ids=None, dept_ids=None, client_ids=None, mt_ids=None):
    case_ids = case_ids or []
    user_ids = user_ids or []
    dept_ids = dept_ids or []
    client_ids = client_ids or []
    mt_ids = mt_ids or []

    # Cleanup Neo4j
    driver = get_neo4j_driver()
    db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
    kwargs = {"database": db_name} if db_name else {}
    async with driver.session(**kwargs) as s:
        all_ids = user_ids + dept_ids + case_ids
        if all_ids:
            await s.run("MATCH (n) WHERE n.id IN $ids DETACH DELETE n", ids=all_ids)

    # Cleanup Postgres
    with db_conn() as conn:
        with conn.cursor() as cur:
            if case_ids:
                cur.execute("DELETE FROM approval_requests WHERE case_id = ANY(%s)", (case_ids,))
                cur.execute("DELETE FROM workflow_change_requests WHERE case_id = ANY(%s)", (case_ids,))
                cur.execute("DELETE FROM case_task_dependencies WHERE case_task_id IN (SELECT id FROM case_tasks WHERE case_id = ANY(%s))", (case_ids,))
                cur.execute("DELETE FROM case_task_comments WHERE task_id IN (SELECT id FROM case_tasks WHERE case_id = ANY(%s))", (case_ids,))
                cur.execute("DELETE FROM case_tasks WHERE case_id = ANY(%s)", (case_ids,))
                cur.execute("DELETE FROM case_stages WHERE case_id = ANY(%s)", (case_ids,))
                cur.execute("DELETE FROM billing_milestones WHERE case_id = ANY(%s)", (case_ids,))
                cur.execute("DELETE FROM case_assignments WHERE case_id = ANY(%s)", (case_ids,))
                cur.execute("DELETE FROM cases WHERE id = ANY(%s)", (case_ids,))
            if mt_ids:
                cur.execute("DELETE FROM matter_types WHERE id = ANY(%s)", (mt_ids,))
            if client_ids:
                cur.execute("DELETE FROM clients WHERE id = ANY(%s)", (client_ids,))
            if user_ids and dept_ids:
                cur.execute("DELETE FROM department_leaders WHERE user_id = ANY(%s) OR department_id = ANY(%s)", (user_ids, dept_ids))
            if user_ids:
                cur.execute("DELETE FROM users WHERE id = ANY(%s)", (user_ids,))
            if dept_ids:
                cur.execute("DELETE FROM departments WHERE id = ANY(%s)", (dept_ids,))


# =====================================================================
# 1. NEED-TO-KNOW: LUẬT SƯ, TRƯỞNG PHÒNG, GIÁM ĐỐC, KẾ TOÁN, ORIGINATOR
# =====================================================================

async def test_case_detail_need_to_know_unassigned_attorney_denied():
    """TC-SEC-01: Luật sư không được phân công -> 403 NEED_TO_KNOW_DENIED ở GET /cases/{id} và sub-routes, có audit ACCESS_DENIED."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])
        attorney = create_test_user(conn, role="ATTORNEY")

    await sync_neo4j_graph(
        users=[attorney],
        departments=[dept],
        cases=[case],
    )

    try:
        async with make_auth_client(attorney["id"]) as c:
            # 1. GET /cases/{id} denied
            r = await c.get(f"/api/v1/cases/{case['id']}")
            assert r.status_code == 403, r.text
            body = r.json()
            assert body["success"] is False
            assert body["error"]["code"] == "NEED_TO_KNOW_DENIED"

            # 2. Sub-routes denied
            r_stages = await c.get(f"/api/v1/cases/{case['id']}/stages")
            assert r_stages.status_code == 403
            assert r_stages.json()["error"]["code"] == "NEED_TO_KNOW_DENIED"

            r_tasks = await c.get(f"/api/v1/cases/{case['id']}/tasks")
            assert r_tasks.status_code == 403
            assert r_tasks.json()["error"]["code"] == "NEED_TO_KNOW_DENIED"

            r_assign = await c.get(f"/api/v1/cases/{case['id']}/assignments")
            assert r_assign.status_code == 403
            assert r_assign.json()["error"]["code"] == "NEED_TO_KNOW_DENIED"

        # 3. Check audit log has ACCESS_DENIED
        with db_conn() as conn:
            row = conn.execute(
                """SELECT id, action, entity_name, entity_id, actor_id
                   FROM audit_logs
                   WHERE action = 'ACCESS_DENIED' AND entity_id = %s AND actor_id = %s
                   ORDER BY id DESC LIMIT 1""",
                (case["id"], attorney["id"]),
            ).fetchone()
            assert row is not None, "Missing audit log entry for ACCESS_DENIED"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[attorney["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_case_detail_dept_leader_other_dept_denied():
    """Trưởng phòng phòng khác (không leads phòng của vụ việc) -> 403 NEED_TO_KNOW_DENIED."""
    with db_conn() as conn:
        dept_case = create_test_department(conn, name="Ban Doanh Nghiệp")
        dept_other = create_test_department(conn, name="Ban Tranh Tụng")
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept_case["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept_case["id"])
        mgr_other = create_test_user(conn, role="MANAGER", full_name="Trưởng Phòng Khác")

    await sync_neo4j_graph(
        users=[mgr_other],
        departments=[dept_case, dept_other],
        cases=[case],
        leads=[(mgr_other["id"], dept_other["id"])],
    )

    try:
        async with make_auth_client(mgr_other["id"]) as c:
            r = await c.get(f"/api/v1/cases/{case['id']}")
            assert r.status_code == 403, r.text
            assert r.json()["error"]["code"] == "NEED_TO_KNOW_DENIED"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[mgr_other["id"]], dept_ids=[dept_case["id"], dept_other["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_case_detail_dept_leader_same_dept_allowed():
    """TC-SEC-02: Trưởng ban phòng của vụ việc (:LEADS -> dept) xem được toàn bộ thông tin vụ việc."""
    with db_conn() as conn:
        dept = create_test_department(conn, name="Ban SHTT")
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])
        dept_leader = create_test_user(conn, role="MANAGER", full_name="Trưởng Ban SHTT")

    await sync_neo4j_graph(
        users=[dept_leader],
        departments=[dept],
        cases=[case],
        leads=[(dept_leader["id"], dept["id"])],
    )

    try:
        async with make_auth_client(dept_leader["id"]) as c:
            r = await c.get(f"/api/v1/cases/{case['id']}")
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["success"] is True
            assert body["data"]["id"] == case["id"]
            assert body["data"]["case_code"] == case["case_code"]
            assert "custom_data" in body["data"]
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[dept_leader["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_case_detail_executive_allowed():
    """Giám đốc (is_executive = True) xem được mọi vụ việc."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])
        director = create_test_user(conn, role="MANAGER", is_executive=True, full_name="Giám Đốc ASL")

    await sync_neo4j_graph(
        users=[director],
        departments=[dept],
        cases=[case],
    )

    try:
        async with make_auth_client(director["id"]) as c:
            r = await c.get(f"/api/v1/cases/{case['id']}")
            assert r.status_code == 200, r.text
            assert r.json()["success"] is True
            assert r.json()["data"]["id"] == case["id"]
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[director["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_case_detail_accountant_only_progress_view():
    """TC-SEC-10: Kế toán gọi GET /cases/{id} -> 403; gọi ?view=progress -> 200 OK (không lộ custom_data)."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])
        accountant = create_test_user(conn, role="ACCOUNTANT", full_name="Kế Toán Viên")

    await sync_neo4j_graph(
        users=[accountant],
        departments=[dept],
        cases=[case],
    )

    try:
        async with make_auth_client(accountant["id"]) as c:
            # 1. Gọi thường không view=progress -> 403
            r_denied = await c.get(f"/api/v1/cases/{case['id']}")
            assert r_denied.status_code == 403, r_denied.text
            assert r_denied.json()["error"]["code"] == "NEED_TO_KNOW_DENIED"

            # 2. Gọi view=progress -> 200 OK
            r_allowed = await c.get(f"/api/v1/cases/{case['id']}?view=progress")
            assert r_allowed.status_code == 200, r_allowed.text
            data = r_allowed.json()["data"]
            assert data["id"] == case["id"]
            assert "progress_pct" in data
            assert "custom_data" not in data, "Accountant must not see custom_data"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[accountant["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_case_detail_originator_progress_view():
    """TC-SEC-12: Người mang khách về (:ORIGINATED) chỉ xem được tiến độ qua ?view=progress; gọi thường -> 403."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])
        originator = create_test_user(conn, role="ATTORNEY", full_name="Người Mang Khách Về")

    await sync_neo4j_graph(
        users=[originator],
        departments=[dept],
        cases=[case],
        originators=[(originator["id"], case["id"])],
    )

    try:
        async with make_auth_client(originator["id"]) as c:
            r_denied = await c.get(f"/api/v1/cases/{case['id']}")
            assert r_denied.status_code == 403, r_denied.text

            r_allowed = await c.get(f"/api/v1/cases/{case['id']}?view=progress")
            assert r_allowed.status_code == 200, r_allowed.text
            assert r_allowed.json()["data"]["id"] == case["id"]
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[originator["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_cases_list_filters_by_need_to_know():
    """GET /cases: danh sách chỉ trả vụ việc người xem vượt guard progress; kể cả khi tìm đúng mã vụ việc ngoài phạm vi."""
    with db_conn() as conn:
        dept_a = create_test_department(conn, name="Ban A")
        dept_b = create_test_department(conn, name="Ban B")
        client = create_test_client(conn)
        mt_a = create_test_matter_type(conn, dept_a["id"])
        mt_b = create_test_matter_type(conn, dept_b["id"])
        case_a = create_test_case(conn, client["id"], mt_a["id"], dept_a["id"], title="Vụ A Có Quyền")
        case_b = create_test_case(conn, client["id"], mt_b["id"], dept_b["id"], title="Vụ B Không Có Quyền")
        attorney = create_test_user(conn, role="ATTORNEY")

        # Assign attorney to Case A only
        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'EXECUTOR', NOW())""",
            (case_a["id"], attorney["id"]),
        )

    await sync_neo4j_graph(
        users=[attorney],
        departments=[dept_a, dept_b],
        cases=[case_a, case_b],
        assignments=[(attorney["id"], case_a["id"], "EXECUTOR")],
    )

    try:
        async with make_auth_client(attorney["id"]) as c:
            # 1. Danh sách bình thường: chỉ có Case A
            r = await c.get("/api/v1/cases")
            assert r.status_code == 200, r.text
            data = r.json()["data"]
            returned_ids = [item["id"] for item in data]
            assert case_a["id"] in returned_ids
            assert case_b["id"] not in returned_ids

            # 2. Tìm kiếm chính xác mã của Case B -> không trả về Case B
            r_search = await c.get(f"/api/v1/cases?q={case_b['case_code']}")
            assert r_search.status_code == 200
            data_search = r_search.json()["data"]
            assert not any(item["id"] == case_b["id"] for item in data_search)

            # 3. Lọc theo department_id và status
            r_dept = await c.get(f"/api/v1/cases?department_id={dept_a['id']}")
            assert r_dept.status_code == 200
            assert any(item["id"] == case_a["id"] for item in r_dept.json()["data"])
    finally:
        await cleanup_all(case_ids=[case_a["id"], case_b["id"]], user_ids=[attorney["id"]],
                          dept_ids=[dept_a["id"], dept_b["id"]], client_ids=[client["id"]], mt_ids=[mt_a["id"], mt_b["id"]])


# =====================================================================
# 2. PHÂN CÔNG (ASSIGNMENTS) & THU HỒI QUYỀN TỨC THÌ
# =====================================================================

async def test_case_assignments_manager_count_validation():
    """PUT /cases/{id}/assignments: 0 hoặc 2 CASE_MANAGER -> 422; >1 SUPERVISOR -> 422."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])
        mgr = create_test_user(conn, role="MANAGER")
        u1 = create_test_user(conn, role="ATTORNEY", full_name="User 1")
        u2 = create_test_user(conn, role="ATTORNEY", full_name="User 2")
        u3 = create_test_user(conn, role="ATTORNEY", full_name="User 3")

    await sync_neo4j_graph(
        users=[mgr, u1, u2, u3],
        departments=[dept],
        cases=[case],
        leads=[(mgr["id"], dept["id"])],
    )

    try:
        async with make_auth_client(mgr["id"]) as c:
            # 0 CASE_MANAGER
            r_zero = await c.put(
                f"/api/v1/cases/{case['id']}/assignments",
                json={"assignments": [{"user_id": u1["id"], "role_in_case": "EXECUTOR"}]},
            )
            assert r_zero.status_code == 422, r_zero.text

            # 2 CASE_MANAGER
            r_two_cm = await c.put(
                f"/api/v1/cases/{case['id']}/assignments",
                json={"assignments": [
                    {"user_id": u1["id"], "role_in_case": "CASE_MANAGER"},
                    {"user_id": u2["id"], "role_in_case": "CASE_MANAGER"},
                ]},
            )
            assert r_two_cm.status_code == 422, r_two_cm.text

            # 2 SUPERVISOR
            r_two_sup = await c.put(
                f"/api/v1/cases/{case['id']}/assignments",
                json={"assignments": [
                    {"user_id": u1["id"], "role_in_case": "CASE_MANAGER"},
                    {"user_id": u2["id"], "role_in_case": "SUPERVISOR"},
                    {"user_id": u3["id"], "role_in_case": "SUPERVISOR"},
                ]},
            )
            assert r_two_sup.status_code == 422, r_two_sup.text
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[mgr["id"], u1["id"], u2["id"], u3["id"]],
                          dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_case_assignments_remove_user_with_open_tasks_rejected():
    """Gỡ người còn task dở (IN_PROGRESS hoặc WAITING_APPROVAL) -> 409 ASSIGNEE_HAS_OPEN_TASKS."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])
        mgr = create_test_user(conn, role="MANAGER")
        cm = create_test_user(conn, role="ATTORNEY", full_name="Case Manager")
        executor = create_test_user(conn, role="ATTORNEY", full_name="Executor Dở Việc")

        # Initial assignments
        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'CASE_MANAGER', NOW()), (%s, %s, 'EXECUTOR', NOW())""",
            (case["id"], cm["id"], case["id"], executor["id"]),
        )

        # Create a stage and an IN_PROGRESS task assigned to executor
        stage_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Giai đoạn 1', 1, 'ACTIVE')""",
            (stage_id, case["id"]),
        )
        task_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to)
               VALUES (%s, %s, %s, 'Soạn đơn', 'IN_PROGRESS', %s)""",
            (task_id, case["id"], stage_id, executor["id"]),
        )

    await sync_neo4j_graph(
        users=[mgr, cm, executor],
        departments=[dept],
        cases=[case],
        leads=[(mgr["id"], dept["id"])],
        assignments=[(cm["id"], case["id"], "CASE_MANAGER"), (executor["id"], case["id"], "EXECUTOR")],
    )

    try:
        async with make_auth_client(mgr["id"]) as c:
            # Try removing executor
            r = await c.put(
                f"/api/v1/cases/{case['id']}/assignments",
                json={"assignments": [{"user_id": cm["id"], "role_in_case": "CASE_MANAGER"}]},
            )
            assert r.status_code == 409, r.text
            body = r.json()
            assert body["success"] is False
            assert body["error"]["code"] == "ASSIGNEE_HAS_OPEN_TASKS"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[mgr["id"], cm["id"], executor["id"]],
                          dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_case_assignments_revocation_effective_immediately():
    """Gỡ phân công -> luật sư bị 403 NEED_TO_KNOW_DENIED ngay request kế tiếp (Neo4j đồng bộ ngay trong request)."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])
        mgr = create_test_user(conn, role="MANAGER")
        cm = create_test_user(conn, role="ATTORNEY", full_name="Case Manager")
        attorney = create_test_user(conn, role="ATTORNEY", full_name="Luật sư Bị Gỡ")

        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'CASE_MANAGER', NOW()), (%s, %s, 'EXECUTOR', NOW())""",
            (case["id"], cm["id"], case["id"], attorney["id"]),
        )

    await sync_neo4j_graph(
        users=[mgr, cm, attorney],
        departments=[dept],
        cases=[case],
        leads=[(mgr["id"], dept["id"])],
        assignments=[(cm["id"], case["id"], "CASE_MANAGER"), (attorney["id"], case["id"], "EXECUTOR")],
    )

    try:
        # 1. Attorney views case successfully
        async with make_auth_client(attorney["id"]) as c_attorney:
            r1 = await c_attorney.get(f"/api/v1/cases/{case['id']}")
            assert r1.status_code == 200, r1.text

        # 2. Manager removes attorney
        async with make_auth_client(mgr["id"]) as c_mgr:
            r_update = await c_mgr.put(
                f"/api/v1/cases/{case['id']}/assignments",
                json={"assignments": [{"user_id": cm["id"], "role_in_case": "CASE_MANAGER"}]},
            )
            assert r_update.status_code == 200, r_update.text

        # 3. Attorney immediately gets 403 on very next request
        async with make_auth_client(attorney["id"]) as c_attorney_again:
            r2 = await c_attorney_again.get(f"/api/v1/cases/{case['id']}")
            assert r2.status_code == 403, r2.text
            assert r2.json()["error"]["code"] == "NEED_TO_KNOW_DENIED"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[mgr["id"], cm["id"], attorney["id"]],
                          dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


# =====================================================================
# 3. VÒNG ĐỜI VỤ VIỆC (LIFECYCLE) & BÌNH LUẬN (COMMENTS)
# =====================================================================

async def test_case_status_lifecycle_initializing_to_active():
    """INITIALIZING -> ACTIVE: thiếu nhân sự -> 409/422; có 1 CASE_MANAGER + >=1 EXECUTOR -> 200 OK."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"], status="INITIALIZING")
        mgr = create_test_user(conn, role="MANAGER")
        cm = create_test_user(conn, role="ATTORNEY", full_name="Case Manager")
        executor = create_test_user(conn, role="ATTORNEY", full_name="Executor")

    await sync_neo4j_graph(
        users=[mgr, cm, executor],
        departments=[dept],
        cases=[case],
        leads=[(mgr["id"], dept["id"])],
    )

    try:
        async with make_auth_client(mgr["id"]) as c:
            # 1. Activate without personnel -> rejected
            r_fail = await c.post(f"/api/v1/cases/{case['id']}/status", json={"status": "ACTIVE"})
            assert r_fail.status_code in (409, 422), r_fail.text

            # 2. Add personnel via assignments
            r_assign = await c.put(
                f"/api/v1/cases/{case['id']}/assignments",
                json={"assignments": [
                    {"user_id": cm["id"], "role_in_case": "CASE_MANAGER"},
                    {"user_id": executor["id"], "role_in_case": "EXECUTOR"},
                ]},
            )
            assert r_assign.status_code == 200, r_assign.text

            # 3. Activate with sufficient personnel -> 200 OK
            r_ok = await c.post(f"/api/v1/cases/{case['id']}/status", json={"status": "ACTIVE"})
            assert r_ok.status_code == 200, r_ok.text
            assert r_ok.json()["data"]["status"] == "ACTIVE"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[mgr["id"], cm["id"], executor["id"]],
                          dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_case_status_lifecycle_pause_and_resume():
    """PAUSED: thiếu reason -> 422; có reason -> 200 OK; ACTIVE -> 200 OK."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"], status="ACTIVE")
        mgr = create_test_user(conn, role="MANAGER")

    await sync_neo4j_graph(
        users=[mgr],
        departments=[dept],
        cases=[case],
        leads=[(mgr["id"], dept["id"])],
    )

    try:
        async with make_auth_client(mgr["id"]) as c:
            # Pause without reason -> 422
            r_no_reason = await c.post(f"/api/v1/cases/{case['id']}/status", json={"status": "PAUSED"})
            assert r_no_reason.status_code == 422, r_no_reason.text

            # Pause with reason -> 200 OK
            r_paused = await c.post(
                f"/api/v1/cases/{case['id']}/status",
                json={"status": "PAUSED", "reason": "Tạm dừng theo yêu cầu của thân chủ"},
            )
            assert r_paused.status_code == 200, r_paused.text
            assert r_paused.json()["data"]["status"] == "PAUSED"

            # Resume -> 200 OK
            r_resume = await c.post(f"/api/v1/cases/{case['id']}/status", json={"status": "ACTIVE"})
            assert r_resume.status_code == 200, r_resume.text
            assert r_resume.json()["data"]["status"] == "ACTIVE"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[mgr["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_case_status_lifecycle_terminated():
    """TERMINATED: thiếu lý do -> 422; có lý do -> đợt thu chưa thu thành CANCELLED, đợt đã thu giữ nguyên."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"], status="ACTIVE")
        mgr = create_test_user(conn, role="MANAGER")

        # Create billing milestones: m1 PAID_CONFIRMED, m2 PENDING, m3 AWAITING_PAYMENT
        m1_id = str(uuid.uuid4())
        m2_id = str(uuid.uuid4())
        m3_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO billing_milestones (id, case_id, order_index, name, amount, received_total, status)
               VALUES (%s, %s, 1, 'Đợt 1', 30000000, 30000000, 'PAID_CONFIRMED'),
                      (%s, %s, 2, 'Đợt 2', 40000000, 0, 'PENDING'),
                      (%s, %s, 3, 'Đợt 3', 30000000, 0, 'AWAITING_PAYMENT')""",
            (m1_id, case["id"], m2_id, case["id"], m3_id, case["id"]),
        )

    await sync_neo4j_graph(
        users=[mgr],
        departments=[dept],
        cases=[case],
        leads=[(mgr["id"], dept["id"])],
    )

    try:
        async with make_auth_client(mgr["id"]) as c:
            # Terminate without reason -> 422
            r_fail = await c.post(f"/api/v1/cases/{case['id']}/status", json={"status": "TERMINATED"})
            assert r_fail.status_code == 422, r_fail.text

            # Terminate with reason -> 200 OK
            r_ok = await c.post(
                f"/api/v1/cases/{case['id']}/status",
                json={"status": "TERMINATED", "reason": "Thân chủ đơn phương chấm dứt hợp đồng"},
            )
            assert r_ok.status_code == 200, r_ok.text
            assert r_ok.json()["data"]["status"] == "TERMINATED"

        # Verify billing milestones status
        with db_conn() as conn:
            rows = {str(k): v for k, v in conn.execute(
                "SELECT id, status FROM billing_milestones WHERE case_id = %s",
                (case["id"],),
            ).fetchall()}
            assert rows[str(m1_id)] == "PAID_CONFIRMED", "Paid milestone must not be cancelled"
            assert rows[str(m2_id)] == "CANCELLED", "Pending milestone must be cancelled"
            assert rows[str(m3_id)] == "CANCELLED", "Awaiting payment milestone must be cancelled"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[mgr["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_case_status_invalid_transition():
    """Chuyển trạng thái sai máy trạng thái (INITIALIZING -> CLOSED) -> 409 INVALID_STATE_TRANSITION."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"], status="INITIALIZING")
        mgr = create_test_user(conn, role="MANAGER")

    await sync_neo4j_graph(users=[mgr], departments=[dept], cases=[case], leads=[(mgr["id"], dept["id"])])

    try:
        async with make_auth_client(mgr["id"]) as c:
            r = await c.post(f"/api/v1/cases/{case['id']}/status", json={"status": "CLOSED"})
            assert r.status_code == 409, r.text
            assert r.json()["error"]["code"] == "INVALID_STATE_TRANSITION"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[mgr["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_legacy_case_is_read_only():
    """Vụ việc is_legacy = True chỉ đọc: POST /status hoặc PUT /assignments -> 409 LEGACY_CASE_READ_ONLY."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"], status="ACTIVE", is_legacy=True)
        mgr = create_test_user(conn, role="MANAGER")

    await sync_neo4j_graph(users=[mgr], departments=[dept], cases=[case], leads=[(mgr["id"], dept["id"])])

    try:
        async with make_auth_client(mgr["id"]) as c:
            r_stat = await c.post(f"/api/v1/cases/{case['id']}/status", json={"status": "PAUSED", "reason": "Test"})
            assert r_stat.status_code == 409, r_stat.text
            assert r_stat.json()["error"]["code"] == "LEGACY_CASE_READ_ONLY"

            r_assign = await c.put(f"/api/v1/cases/{case['id']}/assignments", json={"assignments": []})
            assert r_assign.status_code == 409, r_assign.text
            assert r_assign.json()["error"]["code"] == "LEGACY_CASE_READ_ONLY"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[mgr["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_case_task_comments():
    """Bình luận: 1-5000 ký tự; rỗng hoặc > 5000 ký tự -> 422; GET trả danh sách mới nhất trước."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])
        attorney = create_test_user(conn, role="ATTORNEY")

        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'EXECUTOR', NOW())""",
            (case["id"], attorney["id"]),
        )
        stage_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Giai đoạn 1', 1, 'ACTIVE')""",
            (stage_id, case["id"]),
        )
        task_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to)
               VALUES (%s, %s, %s, 'Soạn đơn đăng ký', 'IN_PROGRESS', %s)""",
            (task_id, case["id"], stage_id, attorney["id"]),
        )

    await sync_neo4j_graph(
        users=[attorney],
        departments=[dept],
        cases=[case],
        assignments=[(attorney["id"], case["id"], "EXECUTOR")],
    )

    try:
        async with make_auth_client(attorney["id"]) as c:
            # 1. Rỗng -> 422
            r_empty = await c.post(f"/api/v1/cases/{case['id']}/tasks/{task_id}/comments", json={"body": ""})
            assert r_empty.status_code == 422, r_empty.text

            # 2. Quá 5000 ký tự -> 422
            r_too_long = await c.post(f"/api/v1/cases/{case['id']}/tasks/{task_id}/comments", json={"body": "x" * 5001})
            assert r_too_long.status_code == 422, r_too_long.text

            # 3. Tạo bình luận 1
            r_c1 = await c.post(f"/api/v1/cases/{case['id']}/tasks/{task_id}/comments", json={"body": "Bình luận thứ nhất"})
            assert r_c1.status_code == 201, r_c1.text

            # 4. Tạo bình luận 2
            r_c2 = await c.post(f"/api/v1/cases/{case['id']}/tasks/{task_id}/comments", json={"body": "Bình luận thứ hai mới hơn"})
            assert r_c2.status_code == 201, r_c2.text

            # 5. GET danh sách -> mới nhất trước
            r_list = await c.get(f"/api/v1/cases/{case['id']}/tasks/{task_id}/comments")
            assert r_list.status_code == 200, r_list.text
            comments = r_list.json()["data"]
            assert len(comments) >= 2
            assert comments[0]["body"] == "Bình luận thứ hai mới hơn"
            assert comments[1]["body"] == "Bình luận thứ nhất"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[attorney["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])
