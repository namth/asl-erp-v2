"""Nghiệm thu TSK-08 / TSK-19 / DEC-07 — Yêu cầu bổ sung quy trình (change-requests) & Hàng chờ / Quyết định phê duyệt.

Hợp đồng: docs/07-api-contracts.md §3.4, §1.2-1.3
Quy tắc: docs/12-business-rules.md §1.6, §2.2, §2.4; docs/14-decisions.md DEC-07
Schema: docs/06-database-schema.md (approval_requests, workflow_change_requests, case_tasks)
Test cases: TC-WF-01, TC-WF-02, TC-WF-03, TC-CASE-04
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


def create_test_department(conn, code: str | None = None, name: str = "Ban SHTT Approvals") -> dict:
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
    full_name: str = "Luật sư Approvals",
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


def create_test_client(conn, name: str = "Khách Hàng Approvals") -> dict:
    client_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO clients (id, client_type, name, normalized_name, phone, address, category_group)
           VALUES (%s, 'FOREIGN', %s, %s, '0987654321', '789 Approval Ave', 'NEW')""",
        (client_id, name, name.lower()),
    )
    return {"id": client_id, "name": name}


def create_test_matter_type(conn, department_id: str, code: str | None = None, name: str = "Đăng ký giải pháp") -> dict:
    mt_id = str(uuid.uuid4())
    mt_code = code or ("T" + uuid.uuid4().hex[:3].upper().translate(str.maketrans("0123456789", "GHIJKLMNOP")))
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
    matter_code: str = "AP",
    title: str = "Vụ việc approvals",
) -> dict:
    case_id = str(uuid.uuid4())
    case_code = f"ASL-2026-{matter_code[:3]}-{uuid.uuid4().hex[:4].upper()}"
    conn.execute(
        """INSERT INTO cases (id, case_code, title, client_id, matter_type_id, department_id,
                              workflow_mode, contract_value, status, is_legacy, custom_data)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, '{}')""",
        (case_id, case_code, title, client_id, matter_type_id, department_id,
         workflow_mode, contract_value, status, is_legacy),
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


async def cleanup_all(case_ids=None, user_ids=None, dept_ids=None, client_ids=None, mt_ids=None):
    case_ids = case_ids or []
    user_ids = user_ids or []
    dept_ids = dept_ids or []
    client_ids = client_ids or []
    mt_ids = mt_ids or []

    driver = get_neo4j_driver()
    db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
    kwargs = {"database": db_name} if db_name else {}
    async with driver.session(**kwargs) as s:
        all_ids = user_ids + dept_ids + case_ids
        if all_ids:
            await s.run("MATCH (n) WHERE n.id IN $ids DETACH DELETE n", ids=all_ids)

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
# 1. YÊU CẦU BỔ SUNG QUY TRÌNH (POST /cases/{id}/change-requests) — DEC-07
# =====================================================================

async def test_change_request_strict_case_forbidden():
    """TC-WF-01: Vụ việc STRICT -> gửi yêu cầu bổ sung bị 403 STRICT_GOVERNANCE_VIOLATION, không tạo gì."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"], workflow_mode="STRICT")
        attorney = create_test_user(conn, role="ATTORNEY")

        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'EXECUTOR', NOW())""",
            (case["id"], attorney["id"]),
        )
        stage_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Stage 1', 1, 'ACTIVE')""",
            (stage_id, case["id"]),
        )

    await sync_neo4j_graph(users=[attorney], departments=[dept], cases=[case], assignments=[(attorney["id"], case["id"], "EXECUTOR")])

    try:
        async with make_auth_client(attorney["id"]) as c:
            r = await c.post(
                f"/api/v1/cases/{case['id']}/change-requests",
                json={
                    "kind": "ADD_TASK",
                    "reason": "Tòa án yêu cầu cung cấp thêm bản dịch hợp đồng",
                    "proposal": {
                        "stage_id": stage_id,
                        "title": "Dịch hợp đồng công chứng",
                        "assigned_to": attorney["id"],
                        "complexity_weight": 2,
                    },
                },
            )
            assert r.status_code == 403, r.text
            body = r.json()
            assert body["success"] is False
            assert body["error"]["code"] == "STRICT_GOVERNANCE_VIOLATION"

        # Verify nothing was created in DB
        with db_conn() as conn:
            cnt_cr = conn.execute("SELECT count(*) FROM workflow_change_requests WHERE case_id = %s", (case["id"],)).fetchone()[0]
            assert cnt_cr == 0
            cnt_t = conn.execute("SELECT count(*) FROM case_tasks WHERE case_id = %s", (case["id"],)).fetchone()[0]
            assert cnt_t == 0
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[attorney["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_change_request_flexible_case_creates_pending_approval():
    """TC-WF-02: Vụ việc FLEXIBLE -> 201 PENDING, approval_request CHANGE_REQUEST được tạo, CHƯA có task nào sinh ra."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"], workflow_mode="FLEXIBLE")
        attorney = create_test_user(conn, role="ATTORNEY")

        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'EXECUTOR', NOW())""",
            (case["id"], attorney["id"]),
        )
        stage_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Stage 1', 1, 'ACTIVE')""",
            (stage_id, case["id"]),
        )

    await sync_neo4j_graph(users=[attorney], departments=[dept], cases=[case], assignments=[(attorney["id"], case["id"], "EXECUTOR")])

    try:
        async with make_auth_client(attorney["id"]) as c:
            r = await c.post(
                f"/api/v1/cases/{case['id']}/change-requests",
                json={
                    "kind": "ADD_TASK",
                    "reason": "Bổ sung khảo sát thị trường theo đề xuất thân chủ",
                    "proposal": {
                        "stage_id": stage_id,
                        "title": "Khảo sát nhãn hiệu tương tự tại địa bàn",
                        "assigned_to": attorney["id"],
                        "complexity_weight": 3,
                    },
                },
            )
            assert r.status_code == 201, r.text
            body = r.json()
            assert body["success"] is True
            cr_data = body["data"]
            assert cr_data["status"] == "PENDING"
            cr_id = cr_data["id"]

        # Verify: change request is PENDING, approval_requests entry created, but NO task yet!
        with db_conn() as conn:
            cr_row = conn.execute("SELECT status, approval_request_id FROM workflow_change_requests WHERE id = %s", (cr_id,)).fetchone()
            assert cr_row is not None
            assert cr_row[0] == "PENDING"
            appr_id = cr_row[1]

            appr_row = conn.execute("SELECT subject_type, status FROM approval_requests WHERE id = %s", (appr_id,)).fetchone()
            assert appr_row is not None
            assert appr_row[0] == "CHANGE_REQUEST"
            assert appr_row[1] == "PENDING"

            # Must NOT have created task yet
            tasks_cnt = conn.execute("SELECT count(*) FROM case_tasks WHERE case_id = %s", (case["id"],)).fetchone()[0]
            assert tasks_cnt == 0, "Task must not be created before approval"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[attorney["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


# =====================================================================
# 2. PHÊ DUYỆT (POST /approvals/{id}/decide)
# =====================================================================

async def test_approval_decide_cannot_self_approve():
    """TC-CASE-04: Không tự duyệt yêu cầu của mình -> 403 APPROVAL_NOT_ALLOWED."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])
        cm = create_test_user(conn, role="ATTORNEY", full_name="Case Manager Vừa Yêu Cầu Vừa Duyệt")

        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'CASE_MANAGER', NOW())""",
            (case["id"], cm["id"]),
        )
        stage_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Stage 1', 1, 'ACTIVE')""",
            (stage_id, case["id"]),
        )
        task_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to)
               VALUES (%s, %s, %s, 'Task Của CM', 'WAITING_APPROVAL', %s)""",
            (task_id, case["id"], stage_id, cm["id"]),
        )
        appr_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO approval_requests (id, case_id, subject_type, subject_id, requested_by, status)
               VALUES (%s, %s, 'TASK', %s, %s, 'PENDING')""",
            (appr_id, case["id"], task_id, cm["id"]),
        )

    await sync_neo4j_graph(users=[cm], departments=[dept], cases=[case], assignments=[(cm["id"], case["id"], "CASE_MANAGER")])

    try:
        async with make_auth_client(cm["id"]) as c:
            r = await c.post(f"/api/v1/approvals/{appr_id}/decide", json={"action": "APPROVE"})
            assert r.status_code == 403, r.text
            assert r.json()["error"]["code"] == "APPROVAL_NOT_ALLOWED"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[cm["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_approval_decide_unauthorized_user_forbidden():
    """Người không đủ thẩm quyền duyệt (ví dụ luật sư thường EXECUTOR duyệt STAGE_GATE hoặc TASK) -> 403 APPROVAL_NOT_ALLOWED."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])
        requester = create_test_user(conn, role="ATTORNEY", full_name="Người Yêu Cầu")
        executor = create_test_user(conn, role="ATTORNEY", full_name="Luật Sư Thực Hiện")

        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'EXECUTOR', NOW()), (%s, %s, 'EXECUTOR', NOW())""",
            (case["id"], requester["id"], case["id"], executor["id"]),
        )
        stage_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Stage 1', 1, 'WAITING_APPROVAL')""",
            (stage_id, case["id"]),
        )
        appr_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO approval_requests (id, case_id, subject_type, subject_id, requested_by, status)
               VALUES (%s, %s, 'STAGE_GATE', %s, %s, 'PENDING')""",
            (appr_id, case["id"], stage_id, requester["id"]),
        )

    await sync_neo4j_graph(
        users=[requester, executor],
        departments=[dept],
        cases=[case],
        assignments=[(requester["id"], case["id"], "EXECUTOR"), (executor["id"], case["id"], "EXECUTOR")],
    )

    try:
        async with make_auth_client(executor["id"]) as c:
            r = await c.post(f"/api/v1/approvals/{appr_id}/decide", json={"action": "APPROVE"})
            assert r.status_code == 403, r.text
            assert r.json()["error"]["code"] == "APPROVAL_NOT_ALLOWED"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[requester["id"], executor["id"]],
                          dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_approval_decide_reject_requires_comment():
    """REJECT bắt buộc có comment -> thiếu hoặc rỗng -> 422 VALIDATION_ERROR; có comment -> 200 OK."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])
        cm = create_test_user(conn, role="ATTORNEY", full_name="Case Manager Approver")
        executor = create_test_user(conn, role="ATTORNEY", full_name="Executor")

        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'CASE_MANAGER', NOW()), (%s, %s, 'EXECUTOR', NOW())""",
            (case["id"], cm["id"], case["id"], executor["id"]),
        )
        stage_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Stage 1', 1, 'ACTIVE')""",
            (stage_id, case["id"]),
        )
        task_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to)
               VALUES (%s, %s, %s, 'Task Gửi Duyệt', 'WAITING_APPROVAL', %s)""",
            (task_id, case["id"], stage_id, executor["id"]),
        )
        appr_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO approval_requests (id, case_id, subject_type, subject_id, requested_by, status)
               VALUES (%s, %s, 'TASK', %s, %s, 'PENDING')""",
            (appr_id, case["id"], task_id, executor["id"]),
        )

    await sync_neo4j_graph(
        users=[cm, executor],
        departments=[dept],
        cases=[case],
        assignments=[(cm["id"], case["id"], "CASE_MANAGER"), (executor["id"], case["id"], "EXECUTOR")],
    )

    try:
        async with make_auth_client(cm["id"]) as c:
            # 1. REJECT without comment -> 422
            r_no_cmt = await c.post(f"/api/v1/approvals/{appr_id}/decide", json={"action": "REJECT"})
            assert r_no_cmt.status_code == 422, r_no_cmt.text

            # 2. REJECT with empty comment -> 422
            r_empty_cmt = await c.post(f"/api/v1/approvals/{appr_id}/decide", json={"action": "REJECT", "comment": ""})
            assert r_empty_cmt.status_code == 422, r_empty_cmt.text

            # 3. REJECT with valid comment -> 200 OK
            r_ok = await c.post(
                f"/api/v1/approvals/{appr_id}/decide",
                json={"action": "REJECT", "comment": "Hồ sơ chưa có chữ ký người đại diện theo pháp luật"},
            )
            assert r_ok.status_code == 200, r_ok.text
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[cm["id"], executor["id"]],
                          dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_approval_decide_task_approve_and_reject():
    """Duyệt TASK -> COMPLETED; trả về -> IN_PROGRESS; có audit APPROVAL_DECIDED."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])
        cm = create_test_user(conn, role="ATTORNEY", full_name="Case Manager")
        executor = create_test_user(conn, role="ATTORNEY", full_name="Executor")

        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'CASE_MANAGER', NOW()), (%s, %s, 'EXECUTOR', NOW())""",
            (case["id"], cm["id"], case["id"], executor["id"]),
        )
        stage_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Stage 1', 1, 'ACTIVE')""",
            (stage_id, case["id"]),
        )

        # Task 1 for reject test
        t1_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to)
               VALUES (%s, %s, %s, 'Task Trả Về', 'WAITING_APPROVAL', %s)""",
            (t1_id, case["id"], stage_id, executor["id"]),
        )
        appr1_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO approval_requests (id, case_id, subject_type, subject_id, requested_by, status)
               VALUES (%s, %s, 'TASK', %s, %s, 'PENDING')""",
            (appr1_id, case["id"], t1_id, executor["id"]),
        )

        # Task 2 for approve test
        t2_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to)
               VALUES (%s, %s, %s, 'Task Duyệt Đạt', 'WAITING_APPROVAL', %s)""",
            (t2_id, case["id"], stage_id, executor["id"]),
        )
        appr2_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO approval_requests (id, case_id, subject_type, subject_id, requested_by, status)
               VALUES (%s, %s, 'TASK', %s, %s, 'PENDING')""",
            (appr2_id, case["id"], t2_id, executor["id"]),
        )

    await sync_neo4j_graph(
        users=[cm, executor],
        departments=[dept],
        cases=[case],
        assignments=[(cm["id"], case["id"], "CASE_MANAGER"), (executor["id"], case["id"], "EXECUTOR")],
    )

    try:
        async with make_auth_client(cm["id"]) as c:
            # 1. Reject task 1 -> returns to IN_PROGRESS
            r_rej = await c.post(
                f"/api/v1/approvals/{appr1_id}/decide",
                json={"action": "REJECT", "comment": "Cần chỉnh sửa lại bản dịch"},
            )
            assert r_rej.status_code == 200, r_rej.text

            # 2. Approve task 2 -> becomes COMPLETED
            r_appr = await c.post(
                f"/api/v1/approvals/{appr2_id}/decide",
                json={"action": "APPROVE"},
            )
            assert r_appr.status_code == 200, r_appr.text

        # Verify DB states
        with db_conn() as conn:
            t1_status = conn.execute("SELECT status FROM case_tasks WHERE id = %s", (t1_id,)).fetchone()[0]
            assert t1_status == "IN_PROGRESS", "Rejected task must return to IN_PROGRESS"

            t2_status = conn.execute("SELECT status FROM case_tasks WHERE id = %s", (t2_id,)).fetchone()[0]
            assert t2_status == "COMPLETED", "Approved task must transition to COMPLETED"

            # Check audit log for APPROVAL_DECIDED
            audit_entry = conn.execute(
                """SELECT id, action, entity_id FROM audit_logs
                   WHERE entity_name = 'approval_requests' AND entity_id = %s AND action = 'APPROVAL_DECIDED'""",
                (appr2_id,),
            ).fetchone()
            assert audit_entry is not None, "Missing APPROVAL_DECIDED in audit_logs"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[cm["id"], executor["id"]],
                          dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_approval_decide_stage_gate_approve():
    """Duyệt STAGE_GATE -> stage COMPLETED + mở stage kế tiếp."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])
        supervisor = create_test_user(conn, role="ATTORNEY", full_name="Supervisor")
        executor = create_test_user(conn, role="ATTORNEY", full_name="Executor")

        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'SUPERVISOR', NOW()), (%s, %s, 'EXECUTOR', NOW())""",
            (case["id"], supervisor["id"], case["id"], executor["id"]),
        )

        s1_id = str(uuid.uuid4())
        s2_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status, requires_approval)
               VALUES (%s, %s, 'Giai đoạn 1', 1, 'WAITING_APPROVAL', TRUE),
                      (%s, %s, 'Giai đoạn 2', 2, 'LOCKED', FALSE)""",
            (s1_id, case["id"], s2_id, case["id"]),
        )
        appr_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO approval_requests (id, case_id, subject_type, subject_id, requested_by, status)
               VALUES (%s, %s, 'STAGE_GATE', %s, %s, 'PENDING')""",
            (appr_id, case["id"], s1_id, executor["id"]),
        )

    await sync_neo4j_graph(
        users=[supervisor, executor],
        departments=[dept],
        cases=[case],
        assignments=[(supervisor["id"], case["id"], "SUPERVISOR"), (executor["id"], case["id"], "EXECUTOR")],
    )

    try:
        async with make_auth_client(supervisor["id"]) as c:
            r = await c.post(f"/api/v1/approvals/{appr_id}/decide", json={"action": "APPROVE"})
            assert r.status_code == 200, r.text

        # Verify Stage 1 is COMPLETED and Stage 2 is ACTIVE
        with db_conn() as conn:
            s_rows = dict(conn.execute("SELECT id, status FROM case_stages WHERE case_id = %s", (case["id"],)).fetchall())
            assert s_rows[uuid.UUID(s1_id)] == "COMPLETED"
            assert s_rows[uuid.UUID(s2_id)] == "ACTIVE"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[supervisor["id"], executor["id"]],
                          dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_approval_decide_change_request_approve_creates_adhoc_task():
    """TC-WF-03: Duyệt CHANGE_REQUEST -> change_request APPROVED, sinh đúng 1 task is_ad_hoc = true liên kết yêu cầu."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"], workflow_mode="FLEXIBLE")
        dept_leader = create_test_user(conn, role="MANAGER", full_name="Trưởng Phòng Quản Lý")
        executor = create_test_user(conn, role="ATTORNEY", full_name="Executor")

        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'EXECUTOR', NOW())""",
            (case["id"], executor["id"]),
        )
        stage_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Stage 1', 1, 'ACTIVE')""",
            (stage_id, case["id"]),
        )

        cr_id = str(uuid.uuid4())
        appr_id = str(uuid.uuid4())
        proposal = {
            "stage_id": stage_id,
            "title": "Task Bổ Sung Đã Duyệt",
            "assigned_to": executor["id"],
            "complexity_weight": 2,
        }
        import json
        conn.execute(
            """INSERT INTO approval_requests (id, case_id, subject_type, subject_id, requested_by, status)
               VALUES (%s, %s, 'CHANGE_REQUEST', %s, %s, 'PENDING')""",
            (appr_id, case["id"], cr_id, executor["id"]),
        )
        conn.execute(
            """INSERT INTO workflow_change_requests (id, case_id, kind, proposal, reason, requested_by, status, approval_request_id)
               VALUES (%s, %s, 'ADD_TASK', %s, 'Thân chủ yêu cầu bổ sung', %s, 'PENDING', %s)""",
            (cr_id, case["id"], json.dumps(proposal), executor["id"], appr_id),
        )

    await sync_neo4j_graph(
        users=[dept_leader, executor],
        departments=[dept],
        cases=[case],
        leads=[(dept_leader["id"], dept["id"])],
        assignments=[(executor["id"], case["id"], "EXECUTOR")],
    )

    try:
        async with make_auth_client(dept_leader["id"]) as c:
            r = await c.post(f"/api/v1/approvals/{appr_id}/decide", json={"action": "APPROVE"})
            assert r.status_code == 200, r.text

        # Verify: Exactly 1 new task with is_ad_hoc = true and change_request_id = cr_id
        with db_conn() as conn:
            tasks = conn.execute(
                """SELECT id, title, is_ad_hoc, change_request_id, complexity_weight
                   FROM case_tasks WHERE case_id = %s""",
                (case["id"],),
            ).fetchall()
            assert len(tasks) == 1, "Must create exactly one ad-hoc task"
            t = tasks[0]
            assert t[1] == "Task Bổ Sung Đã Duyệt"
            assert t[2] is True, "is_ad_hoc must be True"
            assert str(t[3]) == cr_id, "change_request_id must point to the change request"
            assert t[4] == 2
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[dept_leader["id"], executor["id"]],
                          dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


# =====================================================================
# 3. HÀNG CHỜ DUYỆT (GET /approvals)
# =====================================================================

async def test_get_approvals_filtered_by_authority():
    """GET /approvals: chỉ trả mục người xem có thẩm quyền duyệt theo 12 §2.2; lọc ?type=."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])
        cm = create_test_user(conn, role="ATTORNEY", full_name="Case Manager X")
        other_user = create_test_user(conn, role="ATTORNEY", full_name="User Khác")
        executor = create_test_user(conn, role="ATTORNEY", full_name="Executor")

        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'CASE_MANAGER', NOW()), (%s, %s, 'EXECUTOR', NOW())""",
            (case["id"], cm["id"], case["id"], executor["id"]),
        )
        stage_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Stage 1', 1, 'ACTIVE')""",
            (stage_id, case["id"]),
        )
        task_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to)
               VALUES (%s, %s, %s, 'Task Case A', 'WAITING_APPROVAL', %s)""",
            (task_id, case["id"], stage_id, executor["id"]),
        )

        # Approval 1: TASK on case (cm is CASE_MANAGER -> authorized)
        appr1_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO approval_requests (id, case_id, subject_type, subject_id, requested_by, status)
               VALUES (%s, %s, 'TASK', %s, %s, 'PENDING')""",
            (appr1_id, case["id"], task_id, executor["id"]),
        )

        # Create Case 2 in another dept
        dept_other = create_test_department(conn, name="Ban Khác")
        mt_other = create_test_matter_type(conn, dept_other["id"])
        case2 = create_test_case(conn, client["id"], mt_other["id"], dept_other["id"], title="Vụ Ban Khác")
        s2_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Stage 2', 1, 'WAITING_APPROVAL')""",
            (s2_id, case2["id"]),
        )
        # Approval 2: STAGE_GATE on case2 (cm is NOT supervisor and NOT dept leader -> NOT authorized)
        appr2_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO approval_requests (id, case_id, subject_type, subject_id, requested_by, status)
               VALUES (%s, %s, 'STAGE_GATE', %s, %s, 'PENDING')""",
            (appr2_id, case2["id"], s2_id, other_user["id"]),
        )

    await sync_neo4j_graph(
        users=[cm, other_user, executor],
        departments=[dept, dept_other],
        cases=[case, case2],
        assignments=[(cm["id"], case["id"], "CASE_MANAGER"), (executor["id"], case["id"], "EXECUTOR")],
    )

    try:
        async with make_auth_client(cm["id"]) as c:
            # 1. GET /approvals -> returns Approval 1, does NOT return Approval 2
            r = await c.get("/api/v1/approvals?status=PENDING")
            assert r.status_code == 200, r.text
            items = r.json()["data"]
            item_ids = [item["id"] for item in items]
            assert appr1_id in item_ids
            assert appr2_id not in item_ids

            # 2. Filter ?type=TASK
            r_task = await c.get("/api/v1/approvals?status=PENDING&type=TASK")
            assert r_task.status_code == 200
            assert any(item["id"] == appr1_id for item in r_task.json()["data"])

            # 3. Filter ?type=STAGE_GATE -> empty for CM
            r_sg = await c.get("/api/v1/approvals?status=PENDING&type=STAGE_GATE")
            assert r_sg.status_code == 200
            assert not any(item["id"] == appr2_id for item in r_sg.json()["data"])
    finally:
        await cleanup_all(case_ids=[case["id"], case2["id"]], user_ids=[cm["id"], other_user["id"], executor["id"]],
                          dept_ids=[dept["id"], dept_other["id"]], client_ids=[client["id"]], mt_ids=[mt["id"], mt_other["id"]])
