"""Nghiệm thu TSK-07 / TSK-08 — Luồng task, máy trạng thái, phụ thuộc, khoá tiền & Việc của tôi (GET /me/tasks).

Hợp đồng: docs/07-api-contracts.md §3.4, §1.2-1.3
Quy tắc: docs/12-business-rules.md §1.3, §1.4, §2.1, §2.3, §2.5, §2.6
Schema: docs/06-database-schema.md (case_stages, case_tasks, case_task_dependencies, billing_milestones)
Test cases: TC-CASE-01, TC-CASE-02, TC-CASE-05, TC-MISA-01
"""
import datetime as dt
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
    c.cookies.set("access_token", token, domain="testserver")
    c.cookies.set("csrf_token", csrf_token, domain="testserver")
    return c


def create_test_department(conn, code: str | None = None, name: str = "Ban SHTT Task Flow") -> dict:
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
    full_name: str = "Luật sư Task Flow",
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


def create_test_client(conn, name: str = "Khách Hàng Task Flow") -> dict:
    client_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO clients (id, client_type, name, normalized_name, phone, address, category_group)
           VALUES (%s, 'FOREIGN', %s, %s, '0987654321', '456 Task Flow Way', 'NEW')""",
        (client_id, name, name.lower()),
    )
    return {"id": client_id, "name": name}


def create_test_matter_type(conn, department_id: str, code: str | None = None, name: str = "Đăng ký bản quyền") -> dict:
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
    matter_code: str = "CR",
    title: str = "Vụ việc bản quyền task flow",
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
# 1. MÁY TRẠNG THÁI TASK, PHỤ THUỘC & KHOÁ TRẠNG THÁI
# =====================================================================

async def test_task_status_prerequisite_blocking():
    """TC-CASE-01: TODO -> IN_PROGRESS bị chặn khi phụ thuộc chưa xong -> 422 PREREQUISITE_TASK_NOT_COMPLETED, details chứa blocked_by."""
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
        task_a_id = str(uuid.uuid4())
        task_b_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to)
               VALUES (%s, %s, %s, 'Task A Tiên Quyết', 'TODO', %s),
                      (%s, %s, %s, 'Task B Bị Phụ Thuộc', 'TODO', %s)""",
            (task_a_id, case["id"], stage_id, attorney["id"], task_b_id, case["id"], stage_id, attorney["id"]),
        )
        # Task B depends on Task A
        conn.execute(
            """INSERT INTO case_task_dependencies (case_task_id, depends_on_task_id)
               VALUES (%s, %s)""",
            (task_b_id, task_a_id),
        )

    await sync_neo4j_graph(
        users=[attorney],
        departments=[dept],
        cases=[case],
        assignments=[(attorney["id"], case["id"], "EXECUTOR")],
    )

    try:
        async with make_auth_client(attorney["id"]) as c:
            # Attempt to move Task B to IN_PROGRESS while Task A is TODO -> 422
            r = await c.patch(
                f"/api/v1/cases/{case['id']}/tasks/{task_b_id}/status",
                json={"status": "IN_PROGRESS"},
            )
            assert r.status_code == 422, r.text
            body = r.json()
            assert body["success"] is False
            assert body["error"]["code"] == "PREREQUISITE_TASK_NOT_COMPLETED"
            # Response details must indicate blocked by Task A
            details_str = str(body["error"]["details"])
            assert task_a_id in details_str, f"Missing prerequisite task ID in details: {body}"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[attorney["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_task_status_invalid_transition_todo_to_completed():
    """Nhảy cóc TODO -> COMPLETED -> 409 INVALID_STATE_TRANSITION."""
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
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to, requires_approval)
               VALUES (%s, %s, %s, 'Task Đang TODO', 'TODO', %s, FALSE)""",
            (task_id, case["id"], stage_id, attorney["id"]),
        )

    await sync_neo4j_graph(users=[attorney], departments=[dept], cases=[case], assignments=[(attorney["id"], case["id"], "EXECUTOR")])

    try:
        async with make_auth_client(attorney["id"]) as c:
            r = await c.patch(f"/api/v1/cases/{case['id']}/tasks/{task_id}/status", json={"status": "COMPLETED"})
            assert r.status_code == 409, r.text
            assert r.json()["error"]["code"] == "INVALID_STATE_TRANSITION"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[attorney["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_task_status_requires_approval_transition():
    """Task requires_approval = TRUE: không được nhảy thẳng COMPLETED; sang WAITING_APPROVAL tạo approval_requests."""
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
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to, requires_approval)
               VALUES (%s, %s, %s, 'Task Cần Duyệt', 'IN_PROGRESS', %s, TRUE)""",
            (task_id, case["id"], stage_id, attorney["id"]),
        )

    await sync_neo4j_graph(users=[attorney], departments=[dept], cases=[case], assignments=[(attorney["id"], case["id"], "EXECUTOR")])

    try:
        async with make_auth_client(attorney["id"]) as c:
            # 1. Trực tiếp COMPLETED -> bị chặn
            r_direct = await c.patch(
                f"/api/v1/cases/{case['id']}/tasks/{task_id}/status",
                json={"status": "COMPLETED"},
            )
            assert r_direct.status_code in (409, 422), r_direct.text

            # 2. Sang WAITING_APPROVAL -> 200 OK
            r_approval = await c.patch(
                f"/api/v1/cases/{case['id']}/tasks/{task_id}/status",
                json={"status": "WAITING_APPROVAL", "note": "Đã làm xong, gửi kiểm tra"},
            )
            assert r_approval.status_code == 200, r_approval.text

        # Verify approval_requests entry created
        with db_conn() as conn:
            row = conn.execute(
                """SELECT id, subject_type, subject_id, status
                   FROM approval_requests
                   WHERE case_id = %s AND subject_id = %s""",
                (case["id"], task_id),
            ).fetchone()
            assert row is not None, "Missing approval_requests row for task"
            assert row[1] == "TASK"
            assert row[3] == "PENDING"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[attorney["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_task_status_blocked_when_stage_locked_or_waiting_payment():
    """TC-CASE-05: Stage LOCKED hoặc WAITING_PAYMENT -> đổi trạng thái task bị 409 STAGE_LOCKED."""
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
        milestone_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO billing_milestones (id, case_id, order_index, name, amount, received_total, status)
               VALUES (%s, %s, 1, 'Đợt 1', 50000000, 0, 'PENDING')""",
            (milestone_id, case["id"]),
        )
        stage_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status, blocking_milestone_id)
               VALUES (%s, %s, 'Giai đoạn 2', 2, 'WAITING_PAYMENT', %s)""",
            (stage_id, case["id"], milestone_id),
        )
        task_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to)
               VALUES (%s, %s, %s, 'Task Ở Stage Bị Khoá', 'TODO', %s)""",
            (task_id, case["id"], stage_id, attorney["id"]),
        )

    await sync_neo4j_graph(users=[attorney], departments=[dept], cases=[case], assignments=[(attorney["id"], case["id"], "EXECUTOR")])

    try:
        async with make_auth_client(attorney["id"]) as c:
            r = await c.patch(
                f"/api/v1/cases/{case['id']}/tasks/{task_id}/status",
                json={"status": "IN_PROGRESS"},
            )
            assert r.status_code == 409, r.text
            assert r.json()["error"]["code"] == "STAGE_LOCKED"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[attorney["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_task_status_blocked_when_case_paused():
    """Vụ việc PAUSED -> đổi trạng thái task bị 409 CASE_PAUSED."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"], status="PAUSED")
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
               VALUES (%s, %s, %s, 'Task Trong Vụ Tạm Dừng', 'TODO', %s)""",
            (task_id, case["id"], stage_id, attorney["id"]),
        )

    await sync_neo4j_graph(users=[attorney], departments=[dept], cases=[case], assignments=[(attorney["id"], case["id"], "EXECUTOR")])

    try:
        async with make_auth_client(attorney["id"]) as c:
            r = await c.patch(
                f"/api/v1/cases/{case['id']}/tasks/{task_id}/status",
                json={"status": "IN_PROGRESS"},
            )
            assert r.status_code == 409, r.text
            assert r.json()["error"]["code"] == "CASE_PAUSED"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[attorney["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_task_status_blocked_when_case_is_legacy():
    """TC-CASE-06: Vụ việc is_legacy = True -> đổi trạng thái task bị 409 LEGACY_CASE_READ_ONLY."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"], is_legacy=True)
        attorney = create_test_user(conn, role="ATTORNEY")

        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'EXECUTOR', NOW())""",
            (case["id"], attorney["id"]),
        )
        stage_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Giai đoạn Cũ', 1, 'ACTIVE')""",
            (stage_id, case["id"]),
        )
        task_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to)
               VALUES (%s, %s, %s, 'Task Vụ Lịch Sử', 'TODO', %s)""",
            (task_id, case["id"], stage_id, attorney["id"]),
        )

    await sync_neo4j_graph(users=[attorney], departments=[dept], cases=[case], assignments=[(attorney["id"], case["id"], "EXECUTOR")])

    try:
        async with make_auth_client(attorney["id"]) as c:
            r = await c.patch(
                f"/api/v1/cases/{case['id']}/tasks/{task_id}/status",
                json={"status": "IN_PROGRESS"},
            )
            assert r.status_code == 409, r.text
            assert r.json()["error"]["code"] == "LEGACY_CASE_READ_ONLY"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[attorney["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_task_patch_assignee_validation():
    """PATCH /cases/{id}/tasks/{taskId}: giao cho người ngoài case -> 422 ASSIGNEE_NOT_IN_CASE; người trong case -> 200 OK."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])
        cm = create_test_user(conn, role="ATTORNEY", full_name="Case Manager")
        in_case = create_test_user(conn, role="ATTORNEY", full_name="Trong Vụ Việc")
        out_case = create_test_user(conn, role="ATTORNEY", full_name="Ngoài Vụ Việc")

        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'CASE_MANAGER', NOW()), (%s, %s, 'EXECUTOR', NOW())""",
            (case["id"], cm["id"], case["id"], in_case["id"]),
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
               VALUES (%s, %s, %s, 'Task Cần Phân Công', 'TODO', %s)""",
            (task_id, case["id"], stage_id, in_case["id"]),
        )

    await sync_neo4j_graph(
        users=[cm, in_case, out_case],
        departments=[dept],
        cases=[case],
        assignments=[(cm["id"], case["id"], "CASE_MANAGER"), (in_case["id"], case["id"], "EXECUTOR")],
    )

    try:
        async with make_auth_client(cm["id"]) as c:
            # Giao cho người ngoài vụ việc -> 422
            r_out = await c.patch(
                f"/api/v1/cases/{case['id']}/tasks/{task_id}",
                json={"assigned_to": out_case["id"]},
            )
            assert r_out.status_code == 422, r_out.text
            assert r_out.json()["error"]["code"] == "ASSIGNEE_NOT_IN_CASE"

            # Giao cho người trong vụ việc -> 200 OK
            r_in = await c.patch(
                f"/api/v1/cases/{case['id']}/tasks/{task_id}",
                json={"assigned_to": in_case["id"], "description": "Ghi chú công việc"},
            )
            assert r_in.status_code == 200, r_in.text
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[cm["id"], in_case["id"], out_case["id"]],
                          dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


# =====================================================================
# 2. CHUỖI HỆ QUẢ: STAGE KẾ (ACTIVE/WAITING_PAYMENT), KÍCH HOẠT TIỀN, STAGE GATE
# =====================================================================

async def test_stage_completion_unblocks_next_stage_active_or_waiting_payment():
    """Chuỗi hệ quả: hoàn thành task cuối của stage -> stage kế ACTIVE (không chặn tiền) hoặc WAITING_PAYMENT (có chặn)."""
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

        # Stage 1: 1 task duy nhất (requires_approval = False)
        s1_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status, requires_approval)
               VALUES (%s, %s, 'Stage 1', 1, 'ACTIVE', FALSE)""",
            (s1_id, case["id"]),
        )
        t1_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to, requires_approval)
               VALUES (%s, %s, %s, 'Task Duy Nhất S1', 'IN_PROGRESS', %s, FALSE)""",
            (t1_id, case["id"], s1_id, attorney["id"]),
        )

        # Stage 2: có blocking_milestone_id (chưa thanh toán)
        m2_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO billing_milestones (id, case_id, order_index, name, amount, received_total, status)
               VALUES (%s, %s, 1, 'Đợt 2', 40000000, 0, 'PENDING')""",
            (m2_id, case["id"]),
        )
        s2_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status, blocking_milestone_id)
               VALUES (%s, %s, 'Stage 2 Chặn Tiền', 2, 'LOCKED', %s)""",
            (s2_id, case["id"], m2_id),
        )

    await sync_neo4j_graph(users=[attorney], departments=[dept], cases=[case], assignments=[(attorney["id"], case["id"], "EXECUTOR")])

    try:
        async with make_auth_client(attorney["id"]) as c:
            # Complete task in Stage 1
            r = await c.patch(
                f"/api/v1/cases/{case['id']}/tasks/{t1_id}/status",
                json={"status": "COMPLETED"},
            )
            assert r.status_code == 200, r.text

        # Verify: Stage 1 is COMPLETED, Stage 2 is WAITING_PAYMENT (because m2 is not paid)
        with db_conn() as conn:
            s_rows = dict(conn.execute("SELECT id, status FROM case_stages WHERE case_id = %s", (case["id"],)).fetchall())
            assert s_rows[uuid.UUID(s1_id)] == "COMPLETED"
            assert s_rows[uuid.UUID(s2_id)] == "WAITING_PAYMENT"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[attorney["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_task_completion_triggers_milestone_awaiting_payment():
    """TC-MISA-01: Hoàn thành task có triggers_milestone_id -> đợt thu chuyển AWAITING_PAYMENT, có audit TASK_STATUS_CHANGED."""
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
        m_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO billing_milestones (id, case_id, order_index, name, amount, received_total, status)
               VALUES (%s, %s, 1, 'Đợt Kích Hoạt', 50000000, 0, 'PENDING')""",
            (m_id, case["id"]),
        )
        stage_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Stage 1', 1, 'ACTIVE')""",
            (stage_id, case["id"]),
        )
        task_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to, requires_approval, triggers_milestone_id)
               VALUES (%s, %s, %s, 'Task Kích Hoạt Tiền', 'IN_PROGRESS', %s, FALSE, %s)""",
            (task_id, case["id"], stage_id, attorney["id"], m_id),
        )

    await sync_neo4j_graph(users=[attorney], departments=[dept], cases=[case], assignments=[(attorney["id"], case["id"], "EXECUTOR")])

    try:
        async with make_auth_client(attorney["id"]) as c:
            r = await c.patch(
                f"/api/v1/cases/{case['id']}/tasks/{task_id}/status",
                json={"status": "COMPLETED"},
            )
            assert r.status_code == 200, r.text

        # Verify milestone transitioned to AWAITING_PAYMENT
        with db_conn() as conn:
            m_status = conn.execute("SELECT status, requested_at FROM billing_milestones WHERE id = %s", (m_id,)).fetchone()
            assert m_status[0] == "AWAITING_PAYMENT"
            assert m_status[1] is not None, "requested_at must be populated"

            # Check audit log
            audit_row = conn.execute(
                """SELECT id, action FROM audit_logs
                   WHERE entity_name = 'case_tasks' AND entity_id = %s AND action = 'TASK_STATUS_CHANGED'""",
                (task_id,),
            ).fetchone()
            assert audit_row is not None, "Missing TASK_STATUS_CHANGED audit log"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[attorney["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_stage_completion_requires_approval_creates_stage_gate():
    """TC-CASE-02: Hoàn thành mọi task của stage có requires_approval = TRUE -> stage WAITING_APPROVAL + tạo approval STAGE_GATE."""
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
            """INSERT INTO case_stages (id, case_id, name, order_index, status, requires_approval)
               VALUES (%s, %s, 'Stage Có Cổng Duyệt', 1, 'ACTIVE', TRUE)""",
            (stage_id, case["id"]),
        )
        task_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to, requires_approval)
               VALUES (%s, %s, %s, 'Task Cuối Stage', 'IN_PROGRESS', %s, FALSE)""",
            (task_id, case["id"], stage_id, attorney["id"]),
        )

    await sync_neo4j_graph(users=[attorney], departments=[dept], cases=[case], assignments=[(attorney["id"], case["id"], "EXECUTOR")])

    try:
        async with make_auth_client(attorney["id"]) as c:
            r = await c.patch(
                f"/api/v1/cases/{case['id']}/tasks/{task_id}/status",
                json={"status": "COMPLETED"},
            )
            assert r.status_code == 200, r.text

        # Verify stage is WAITING_APPROVAL and approval_requests row created with STAGE_GATE
        with db_conn() as conn:
            s_status = conn.execute("SELECT status FROM case_stages WHERE id = %s", (stage_id,)).fetchone()
            assert s_status[0] == "WAITING_APPROVAL"

            appr = conn.execute(
                """SELECT id, subject_type, status FROM approval_requests
                   WHERE case_id = %s AND subject_id = %s""",
                (case["id"], stage_id),
            ).fetchone()
            assert appr is not None
            assert appr[1] == "STAGE_GATE"
            assert appr[2] == "PENDING"
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[attorney["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


async def test_get_case_stages():
    """GET /cases/{id}/stages: trả danh sách stages kèm order_index, task_counts, blocking_milestone."""
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
               VALUES (%s, %s, 'Giai đoạn Thử Nghiệm', 1, 'ACTIVE')""",
            (stage_id, case["id"]),
        )
        t_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to)
               VALUES (%s, %s, %s, 'Task Demo', 'TODO', %s)""",
            (t_id, case["id"], stage_id, attorney["id"]),
        )

    await sync_neo4j_graph(users=[attorney], departments=[dept], cases=[case], assignments=[(attorney["id"], case["id"], "EXECUTOR")])

    try:
        async with make_auth_client(attorney["id"]) as c:
            r = await c.get(f"/api/v1/cases/{case['id']}/stages")
            assert r.status_code == 200, r.text
            stages = r.json()["data"]
            assert len(stages) >= 1
            s = stages[0]
            assert "id" in s and "name" in s and "order_index" in s and "status" in s
            assert "task_counts" in s
            assert "todo" in s["task_counts"]
    finally:
        await cleanup_all(case_ids=[case["id"]], user_ids=[attorney["id"]], dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])


# =====================================================================
# 3. VIỆC CỦA TÔI (GET /me/tasks): ĐÚNG NGƯỜI, SUMMARY, LỌC DUE
# =====================================================================

async def test_get_me_tasks_filters_and_summary():
    """GET /me/tasks: đúng người, đúng summary {todo, in_progress, waiting_approval, overdue}, lọc due theo giờ VN."""
    now = dt.datetime.now(dt.timezone.utc)
    yesterday = now - dt.timedelta(days=1)
    today = now + dt.timedelta(hours=2)
    in_three_days = now + dt.timedelta(days=3)

    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case1 = create_test_case(conn, client["id"], mt["id"], dept["id"], title="Vụ A")
        case2 = create_test_case(conn, client["id"], mt["id"], dept["id"], title="Vụ B")
        me = create_test_user(conn, role="ATTORNEY", full_name="Tôi")
        other = create_test_user(conn, role="ATTORNEY", full_name="Người Khác")

        # Assign 'me' to case1, 'other' to case1 and case2
        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'EXECUTOR', NOW()), (%s, %s, 'EXECUTOR', NOW()), (%s, %s, 'EXECUTOR', NOW())""",
            (case1["id"], me["id"], case1["id"], other["id"], case2["id"], other["id"]),
        )
        s1 = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Stage Case 1', 1, 'ACTIVE')""",
            (s1, case1["id"]),
        )

        # Task 1: assigned to 'me', status TODO, overdue (due yesterday)
        t1 = str(uuid.uuid4())
        # Task 2: assigned to 'me', status IN_PROGRESS, due today
        t2 = str(uuid.uuid4())
        # Task 3: assigned to 'me', status WAITING_APPROVAL, due in 3 days (this week)
        t3 = str(uuid.uuid4())
        # Task 4: assigned to 'other', on case1
        t4 = str(uuid.uuid4())
        # Task 5: assigned to 'me' on case2, BUT 'me' is NOT assigned to case2 -> must not appear!
        s2 = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Stage Case 2', 1, 'ACTIVE')""",
            (s2, case2["id"]),
        )
        t5 = str(uuid.uuid4())

        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to, due_at)
               VALUES (%s, %s, %s, 'Task Quá Hạn', 'TODO', %s, %s),
                      (%s, %s, %s, 'Task Hôm Nay', 'IN_PROGRESS', %s, %s),
                      (%s, %s, %s, 'Task Trong Tuần', 'WAITING_APPROVAL', %s, %s),
                      (%s, %s, %s, 'Task Của Người Khác', 'TODO', %s, %s),
                      (%s, %s, %s, 'Task Vụ Không Có Quyền', 'TODO', %s, %s)""",
            (t1, case1["id"], s1, me["id"], yesterday,
             t2, case1["id"], s1, me["id"], today,
             t3, case1["id"], s1, me["id"], in_three_days,
             t4, case1["id"], s1, other["id"], today,
             t5, case2["id"], s2, me["id"], today),
        )

    await sync_neo4j_graph(
        users=[me, other],
        departments=[dept],
        cases=[case1, case2],
        assignments=[(me["id"], case1["id"], "EXECUTOR"), (other["id"], case1["id"], "EXECUTOR"), (other["id"], case2["id"], "EXECUTOR")],
    )

    try:
        async with make_auth_client(me["id"]) as c:
            # 1. GET /me/tasks without filter -> returns only tasks for 'me' on accessible cases (t1, t2, t3)
            r = await c.get("/api/v1/me/tasks")
            assert r.status_code == 200, r.text
            body = r.json()
            tasks = body["data"]
            task_ids = [t["id"] for t in tasks]
            assert t1 in task_ids, "Task 1 (overdue) must be in me/tasks"
            assert t2 in task_ids, "Task 2 (today) must be in me/tasks"
            assert t3 in task_ids, "Task 3 (week) must be in me/tasks"
            assert t4 not in task_ids, "Task 4 (other user) must not be in me/tasks"
            assert t5 not in task_ids, "Task 5 (unauthorized case) must not be in me/tasks"

            # 2. Check summary
            summary = body.get("summary") or {}
            assert summary.get("todo") == 1
            assert summary.get("in_progress") == 1
            assert summary.get("waiting_approval") == 1
            assert summary.get("overdue") == 1

            # 3. Filter ?due=overdue
            r_overdue = await c.get("/api/v1/me/tasks?due=overdue")
            assert r_overdue.status_code == 200
            overdue_ids = [t["id"] for t in r_overdue.json()["data"]]
            assert t1 in overdue_ids
            assert t2 not in overdue_ids
            assert t3 not in overdue_ids

            # 4. Filter ?due=today
            r_today = await c.get("/api/v1/me/tasks?due=today")
            assert r_today.status_code == 200
            today_ids = [t["id"] for t in r_today.json()["data"]]
            assert t2 in today_ids
            assert t3 not in today_ids
    finally:
        await cleanup_all(case_ids=[case1["id"], case2["id"]], user_ids=[me["id"], other["id"]],
                          dept_ids=[dept["id"]], client_ids=[client["id"]], mt_ids=[mt["id"]])
