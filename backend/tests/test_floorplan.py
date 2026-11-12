"""Nghiệm thu TSK-15 / SCR-15 — Backend Văn phòng số: GET /api/v1/operations/floorplan + WebSocket.

Hợp đồng: docs/07-api-contracts.md §3.7
Đặc tả & quy tắc: docs/features/virtual-office-floorplan.md (BR-FLOOR-01..04, TC-FL-01..07)
Schema: docs/06-database-schema.md (users, departments, department_leaders, case_tasks, approval_requests, workflow_change_requests)
"""
from __future__ import annotations

import datetime as dt
import json
import time
import uuid
from typing import Any, Dict, List, Optional

import jwt
import pytest
import redis as sync_redis
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.app.core.config import settings
from backend.app.db.redis import get_redis_url
from backend.app.main import app
from backend.tests.test_approvals import cleanup_all
from backend.tests.test_task_flow import (
    create_test_case,
    create_test_client,
    create_test_department,
    create_test_matter_type,
    create_test_user,
    db_conn,
    make_auth_client,
    sync_neo4j_graph,
)

BASE_HTTP = "/api/v1/operations/floorplan"
WS_ENDPOINT = "/ws/operations/floorplan"


def token_for(user_id: str) -> str:
    """Tạo JWT access token hợp lệ cho WebSocket test client."""
    now = int(time.time())
    with db_conn() as c:
        c.execute(
            "UPDATE users SET tokens_valid_after = now() - interval '10 minutes' WHERE id = %s",
            (str(user_id),),
        )
    return jwt.encode(
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


def create_user_with_dept(
    conn,
    role: str,
    name: str,
    dept_id: Optional[str] = None,
    *,
    is_executive: bool = False,
    title: str = "Chuyên viên",
    is_active: bool = True,
) -> Dict[str, Any]:
    u = create_test_user(conn, role, full_name=name, is_executive=is_executive)
    u["full_name"] = name
    u["title"] = title
    conn.execute(
        """UPDATE users
           SET department_id = %s, title = %s, is_active = %s
           WHERE id = %s""",
        (dept_id, title, is_active, u["id"]),
    )
    return u


def insert_task(
    conn,
    case_id: str,
    stage_id: str,
    assigned_to: str,
    title: str,
    status: str = "TODO",
    requires_approval: bool = False,
) -> str:
    task_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO case_tasks (id, case_id, stage_id, title, order_index, assigned_to,
                                  status, complexity_weight, requires_approval)
           VALUES (%s, %s, %s, %s, 1, %s, %s, 2, %s)""",
        (task_id, case_id, stage_id, title, assigned_to, status, requires_approval),
    )
    return task_id


def insert_approval_request(
    conn,
    case_id: str,
    subject_type: str,
    subject_id: str,
    requested_by: str,
    status: str = "PENDING",
    minutes_ago: int = 0,
) -> str:
    appr_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO approval_requests (id, case_id, subject_type, subject_id, requested_by,
                                         status, requested_at)
           VALUES (%s, %s, %s, %s, %s, %s, now() - make_interval(mins => %s))""",
        (appr_id, case_id, subject_type, subject_id, requested_by, status, minutes_ago),
    )
    return appr_id


def insert_change_request(
    conn,
    case_id: str,
    requested_by: str,
    reason: str,
    status: str = "PENDING",
    minutes_ago: int = 0,
) -> tuple[str, str]:
    cr_id = str(uuid.uuid4())
    appr_id = insert_approval_request(
        conn, case_id, "CHANGE_REQUEST", cr_id, requested_by, status=status, minutes_ago=minutes_ago
    )
    conn.execute(
        """INSERT INTO workflow_change_requests (id, case_id, kind, proposal, reason,
                                                requested_by, status, approval_request_id)
           VALUES (%s, %s, 'ADD_TASK', '{}', %s, %s, %s, %s)""",
        (cr_id, case_id, reason, requested_by, status, appr_id),
    )
    return cr_id, appr_id


# =====================================================================
# 1. PHÂN QUYỀN VÀ PHẠM VI (TC-FL-01)
# =====================================================================


async def test_director_access_all_departments_and_default():
    """TC-FL-01: Giám đốc (MANAGER, is_executive=true) truy cập được mọi phòng.

    - Gọi rõ ?department_id={deptA} -> 200, đúng phòng A.
    - Gọi rõ ?department_id={deptB} -> 200, đúng phòng B.
    - Bỏ trống department_id:
      + Nếu có trong department_leaders -> phòng đầu tiên mình phụ trách.
      + Nếu không có trong department_leaders -> phòng đầu tiên theo tên trong hệ thống.
    """
    with db_conn() as conn:
        dept_a = create_test_department(conn, name="AAA Phòng SHTT Test Floorplan")
        dept_b = create_test_department(conn, name="BBB Phòng Tranh Tụng Test Floorplan")
        director = create_user_with_dept(conn, "MANAGER", "Giám đốc Hãng Luật", dept_a["id"], is_executive=True)
        # Giám đốc đồng thời phụ trách dept_a
        conn.execute(
            "INSERT INTO department_leaders (user_id, department_id) VALUES (%s, %s)",
            (director["id"], dept_a["id"]),
        )

    await sync_neo4j_graph(
        users=[director],
        departments=[dept_a, dept_b],
        leads=[(director["id"], dept_a["id"])],
    )

    try:
        async with make_auth_client(director["id"]) as c:
            # Truy cập phòng A
            res_a = await c.get(f"{BASE_HTTP}?department_id={dept_a['id']}")
            assert res_a.status_code == 200, res_a.text
            assert res_a.json()["data"]["department"]["id"] == dept_a["id"]

            # Truy cập phòng B
            res_b = await c.get(f"{BASE_HTTP}?department_id={dept_b['id']}")
            assert res_b.status_code == 200, res_b.text
            assert res_b.json()["data"]["department"]["id"] == dept_b["id"]

            # Bỏ trống department_id -> phòng đầu tiên mình phụ trách (dept_a)
            res_def = await c.get(BASE_HTTP)
            assert res_def.status_code == 200, res_def.text
            assert res_def.json()["data"]["department"]["id"] == dept_a["id"]
    finally:
        await cleanup_all(user_ids=[director["id"]], dept_ids=[dept_a["id"], dept_b["id"]])


async def test_department_leader_scope_and_default():
    """TC-FL-01: Trưởng phòng A chỉ được xem phòng A, xem phòng B bị 403 NEED_TO_KNOW_DENIED;

    bỏ trống department_id -> mặc định phòng A.
    """
    with db_conn() as conn:
        dept_a = create_test_department(conn, name="Phòng Ban A Test")
        dept_b = create_test_department(conn, name="Phòng Ban B Test")
        leader_a = create_user_with_dept(conn, "MANAGER", "Trưởng Phòng A", dept_a["id"], is_executive=False)
        conn.execute(
            "INSERT INTO department_leaders (user_id, department_id) VALUES (%s, %s)",
            (leader_a["id"], dept_a["id"]),
        )

    await sync_neo4j_graph(
        users=[leader_a],
        departments=[dept_a, dept_b],
        leads=[(leader_a["id"], dept_a["id"])],
    )

    try:
        async with make_auth_client(leader_a["id"]) as c:
            # Xem phòng mình phụ trách -> 200
            res_a = await c.get(f"{BASE_HTTP}?department_id={dept_a['id']}")
            assert res_a.status_code == 200, res_a.text
            assert res_a.json()["data"]["department"]["id"] == dept_a["id"]

            # Bỏ trống department_id -> mặc định phòng A
            res_def = await c.get(BASE_HTTP)
            assert res_def.status_code == 200, res_def.text
            assert res_def.json()["data"]["department"]["id"] == dept_a["id"]

            # Xem phòng B -> 403 NEED_TO_KNOW_DENIED
            res_b = await c.get(f"{BASE_HTTP}?department_id={dept_b['id']}")
            assert res_b.status_code == 403, res_b.text
            assert res_b.json()["error"]["code"] == "NEED_TO_KNOW_DENIED"
    finally:
        await cleanup_all(user_ids=[leader_a["id"]], dept_ids=[dept_a["id"], dept_b["id"]])


async def test_manager_without_assigned_departments_denied():
    """Manager không phụ trách phòng nào -> 403 NEED_TO_KNOW_DENIED cả khi truyền hay bỏ trống."""
    with db_conn() as conn:
        dept = create_test_department(conn, name="Phòng Riêng Test")
        manager_none = create_user_with_dept(conn, "MANAGER", "Quản lý không phòng", is_executive=False)

    await sync_neo4j_graph(users=[manager_none], departments=[dept])

    try:
        async with make_auth_client(manager_none["id"]) as c:
            res_empty = await c.get(BASE_HTTP)
            assert res_empty.status_code == 403, res_empty.text
            assert res_empty.json()["error"]["code"] == "NEED_TO_KNOW_DENIED"

            res_dept = await c.get(f"{BASE_HTTP}?department_id={dept['id']}")
            assert res_dept.status_code == 403, res_dept.text
            assert res_dept.json()["error"]["code"] == "NEED_TO_KNOW_DENIED"
    finally:
        await cleanup_all(user_ids=[manager_none["id"]], dept_ids=[dept["id"]])


async def test_other_roles_forbidden():
    """Luật sư, Kế toán, Quản trị viên không phải MANAGER -> 403 FORBIDDEN_ROLE."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        attorney = create_user_with_dept(conn, "ATTORNEY", "LS Test", dept["id"])
        accountant = create_user_with_dept(conn, "ACCOUNTANT", "KT Test", dept["id"])
        admin = create_user_with_dept(conn, "ADMIN", "Admin Test", dept["id"])

    try:
        for u in (attorney, accountant, admin):
            async with make_auth_client(u["id"]) as c:
                res = await c.get(f"{BASE_HTTP}?department_id={dept['id']}")
                assert res.status_code == 403, f"{u['system_role']} must be 403"
                assert res.json()["error"]["code"] == "FORBIDDEN_ROLE"
    finally:
        await cleanup_all(user_ids=[attorney["id"], accountant["id"], admin["id"]], dept_ids=[dept["id"]])


async def test_unauthenticated_and_param_validation():
    """Chưa đăng nhập -> 401; department_id sai định dạng -> 422; không tồn tại -> 404."""
    import httpx

    with db_conn() as conn:
        dept = create_test_department(conn)
        director = create_user_with_dept(conn, "MANAGER", "Giám đốc Val", is_executive=True)

    try:
        # Chưa đăng nhập
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://testserver") as anon:
            res_anon = await anon.get(f"{BASE_HTTP}?department_id={dept['id']}")
            assert res_anon.status_code == 401

        async with make_auth_client(director["id"]) as c:
            # department_id không phải UUID -> 422 VALIDATION_ERROR
            res_bad_uuid = await c.get(f"{BASE_HTTP}?department_id=not-a-valid-uuid")
            assert res_bad_uuid.status_code == 422
            assert res_bad_uuid.json()["error"]["code"] == "VALIDATION_ERROR"

            # department_id là UUID nhưng không tồn tại -> 404 NOT_FOUND
            non_existent = str(uuid.uuid4())
            res_not_found = await c.get(f"{BASE_HTTP}?department_id={non_existent}")
            assert res_not_found.status_code == 404
            assert res_not_found.json()["error"]["code"] == "NOT_FOUND"
    finally:
        await cleanup_all(user_ids=[director["id"]], dept_ids=[dept["id"]])


# =====================================================================
# 2. DỮ LIỆU WORKSTATIONS VÀ STATS (TC-FL-02, BR-FLOOR-01)
# =====================================================================


async def test_department_leader_workstations_and_stats_calculation():
    """TC-FL-02:

    - department.leader: người đầu tiên theo tên trong department_leaders; title từ users.title; avatar_url null.
    - workstations: chỉ users đang hoạt động trong phòng, TRỪ trưởng phòng; sắp xếp full_name ASC, id ASC;
      desk_index 1..n.
    - 3 task IN_PROGRESS + 2 TODO -> in_progress_count=3, todo_count=2, is_idle=False.
    - 0 task IN_PROGRESS + 1 TODO -> in_progress_count=0, todo_count=1, is_idle=True.
    - 0 task IN_PROGRESS + 0 TODO -> in_progress_count=0, todo_count=0, is_idle=True.
    - stats: total_staff, working_count, resting_count khớp chính xác.
    """
    with db_conn() as conn:
        dept = create_test_department(conn, name="Phòng Nghiệp Vụ SHTT")
        client = create_test_client(conn, name="Công ty Khách Hàng SHTT")
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])

        # Stage
        stage_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Giai đoạn chuẩn bị', 1, 'ACTIVE')""",
            (stage_id, case["id"]),
        )

        # Trưởng phòng
        leader = create_user_with_dept(
            conn, "MANAGER", "Nguyễn Văn An Leader", dept["id"], is_executive=False, title="Trưởng Ban SHTT"
        )
        conn.execute(
            "INSERT INTO department_leaders (user_id, department_id) VALUES (%s, %s)",
            (leader["id"], dept["id"]),
        )

        # Nhân viên 1: Đặng Văn Một (sắp xếp đứng đầu theo tên) -> 3 IN_PROGRESS, 2 TODO
        u1 = create_user_with_dept(conn, "ATTORNEY", "Đặng Văn Một", dept["id"], title="Luật sư cấp cao")
        # Nhân viên 2: Hoàng Thị Hai -> 0 IN_PROGRESS, 1 TODO
        u2 = create_user_with_dept(conn, "ATTORNEY", "Hoàng Thị Hai", dept["id"], title="Chuyên viên pháp lý")
        # Nhân viên 3: Vũ Văn Ba -> 0 IN_PROGRESS, 0 TODO
        u3 = create_user_with_dept(conn, "ATTORNEY", "Vũ Văn Ba", dept["id"], title="Trợ lý luật sư")

        # Nhân viên bị vô hiệu hoá (is_active=False) -> không có bàn
        u_inactive = create_user_with_dept(
            conn, "ATTORNEY", "Bùi Văn Ẩn", dept["id"], title="Đã nghỉ việc", is_active=False
        )

        # Phân công vào vụ việc
        for u in (u1, u2, u3):
            conn.execute(
                """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
                   VALUES (%s, %s, 'EXECUTOR', now())""",
                (case["id"], u["id"]),
            )

        # Tasks cho u1: 3 IN_PROGRESS + 2 TODO + 1 COMPLETED (không tính)
        for i in range(3):
            insert_task(conn, case["id"], stage_id, u1["id"], f"Task đang làm {i+1}", status="IN_PROGRESS")
        for i in range(2):
            insert_task(conn, case["id"], stage_id, u1["id"], f"Task chờ làm {i+1}", status="TODO")
        insert_task(conn, case["id"], stage_id, u1["id"], "Task đã xong", status="COMPLETED")

        # Task cho u2: 1 TODO + 1 WAITING_APPROVAL (không tính vào in_progress hay todo)
        insert_task(conn, case["id"], stage_id, u2["id"], "Task chờ xử lý", status="TODO")
        insert_task(conn, case["id"], stage_id, u2["id"], "Task chờ duyệt", status="WAITING_APPROVAL")

    await sync_neo4j_graph(
        users=[leader, u1, u2, u3, u_inactive],
        departments=[dept],
        cases=[case],
        leads=[(leader["id"], dept["id"])],
    )

    try:
        async with make_auth_client(leader["id"]) as c:
            r = await c.get(f"{BASE_HTTP}?department_id={dept['id']}")
            assert r.status_code == 200, r.text
            j = r.json()
            assert j["success"] is True
            data = j["data"]

            # 1. Department info
            dept_res = data["department"]
            assert dept_res["id"] == dept["id"]
            assert dept_res["name"] == dept["name"]
            assert dept_res["leader"] is not None
            assert dept_res["leader"]["id"] == leader["id"]
            assert dept_res["leader"]["name"] == "Nguyễn Văn An Leader"
            assert dept_res["leader"]["title"] == "Trưởng Ban SHTT"
            assert dept_res["leader"]["avatar_url"] is None

            # 2. Workstations: đúng 3 nhân sự đang hoạt động (loại trừ leader và inactive)
            desks = data["workstations"]
            assert len(desks) == 3

            desk_user_ids = [d["user"]["id"] for d in desks]
            assert leader["id"] not in desk_user_ids, "Trưởng phòng không được có bàn trong workstations"
            assert u_inactive["id"] not in desk_user_ids, "Nhân sự không hoạt động không được có bàn"
            assert desk_user_ids == [u1["id"], u2["id"], u3["id"]]

            # Desk 1: Đặng Văn Một (3 IN_PROGRESS, 2 TODO -> is_idle=False)
            d1 = desks[0]
            assert d1["desk_index"] == 1
            assert d1["user"]["name"] == "Đặng Văn Một"
            assert d1["user"]["title"] == "Luật sư cấp cao"
            assert d1["in_progress_count"] == 3
            assert d1["todo_count"] == 2
            assert d1["is_idle"] is False
            assert d1["is_in_queue"] is False

            # Desk 2: Hoàng Thị Hai (0 IN_PROGRESS, 1 TODO -> is_idle=True)
            d2 = desks[1]
            assert d2["desk_index"] == 2
            assert d2["user"]["name"] == "Hoàng Thị Hai"
            assert d2["in_progress_count"] == 0
            assert d2["todo_count"] == 1
            assert d2["is_idle"] is True
            assert d2["is_in_queue"] is False

            # Desk 3: Vũ Văn Ba (0 IN_PROGRESS, 0 TODO -> is_idle=True)
            d3 = desks[2]
            assert d3["desk_index"] == 3
            assert d3["user"]["name"] == "Vũ Văn Ba"
            assert d3["in_progress_count"] == 0
            assert d3["todo_count"] == 0
            assert d3["is_idle"] is True
            assert d3["is_in_queue"] is False

            # 3. Stats
            stats = data["stats"]
            assert stats["total_staff"] == 3
            assert stats["working_count"] == 1
            assert stats["resting_count"] == 2
            assert stats["pending_approvals_count"] == 0
    finally:
        await cleanup_all(
            case_ids=[case["id"]],
            user_ids=[leader["id"], u1["id"], u2["id"], u3["id"], u_inactive["id"]],
            dept_ids=[dept["id"]],
            client_ids=[client["id"]],
            mt_ids=[mt["id"]],
        )


async def test_department_without_leader_returns_null():
    """Phòng ban chưa có trưởng phòng trong department_leaders -> leader là null."""
    with db_conn() as conn:
        dept = create_test_department(conn, name="Phòng Tạm Chưa Leader")
        director = create_user_with_dept(conn, "MANAGER", "Giám đốc Kiểm Leader", is_executive=True)

    await sync_neo4j_graph(users=[director], departments=[dept])

    try:
        async with make_auth_client(director["id"]) as c:
            r = await c.get(f"{BASE_HTTP}?department_id={dept['id']}")
            assert r.status_code == 200, r.text
            data = r.json()["data"]
            assert data["department"]["leader"] is None
    finally:
        await cleanup_all(user_ids=[director["id"]], dept_ids=[dept["id"]])


# =====================================================================
# 3. HÀNG ĐỢI DUYỆT (TC-FL-03, BR-FLOOR-02)
# =====================================================================


async def test_approval_queue_details_and_isolation():
    """TC-FL-03:

    - approval_queue nhóm theo nhân sự, chỉ lấy requests PENDING thuộc vụ việc của phòng.
    - title lấy đúng: tiêu đề task (TASK), tên stage (STAGE_GATE), lý do (CHANGE_REQUEST).
    - requests xếp cũ nhất trước (requested_at ASC).
    - Nhân sự có yêu cầu PENDING -> is_in_queue = True trên workstation tương ứng.
    - Yêu cầu của người ngoài phòng, hoặc vụ việc phòng khác, hoặc đã APPROVED -> không xuất hiện.
    """
    with db_conn() as conn:
        dept_main = create_test_department(conn, name="Phòng Chính SHTT")
        dept_other = create_test_department(conn, name="Phòng Khác Doanh Nghiệp")

        client = create_test_client(conn, name="Khách Hàng Approval Queue")
        mt_main = create_test_matter_type(conn, dept_main["id"])
        mt_other = create_test_matter_type(conn, dept_other["id"])

        case_main = create_test_case(conn, client["id"], mt_main["id"], dept_main["id"])
        case_other = create_test_case(conn, client["id"], mt_other["id"], dept_other["id"])

        leader = create_user_with_dept(conn, "MANAGER", "Trưởng Phòng Chính", dept_main["id"], is_executive=False)
        conn.execute(
            "INSERT INTO department_leaders (user_id, department_id) VALUES (%s, %s)",
            (leader["id"], dept_main["id"]),
        )

        # 2 nhân sự phòng chính
        staff_a = create_user_with_dept(conn, "ATTORNEY", "Nhân sự A Queue", dept_main["id"])
        staff_b = create_user_with_dept(conn, "ATTORNEY", "Nhân sự B Queue", dept_main["id"])
        # 1 nhân sự phòng ngoài
        staff_other = create_user_with_dept(conn, "ATTORNEY", "Nhân sự Ngoài Phòng", dept_other["id"])

        for u in (staff_a, staff_b):
            conn.execute(
                """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
                   VALUES (%s, %s, 'EXECUTOR', now())""",
                (case_main["id"], u["id"]),
            )

        # Tạo stages
        stage_main_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Thẩm định nội dung đơn', 1, 'ACTIVE')""",
            (stage_main_id, case_main["id"]),
        )

        stage_other_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Thẩm định ngoài phòng', 1, 'ACTIVE')""",
            (stage_other_id, case_other["id"]),
        )

        # 1. Staff A có 2 yêu cầu PENDING trên case_main:
        # Request 1 (cũ hơn, 30 phút trước): TASK
        task_a = insert_task(conn, case_main["id"], stage_main_id, staff_a["id"], "Soạn tờ khai đăng ký nhãn hiệu")
        appr_task = insert_approval_request(
            conn, case_main["id"], "TASK", task_a, staff_a["id"], status="PENDING", minutes_ago=30
        )

        # Request 2 (mới hơn, 10 phút trước): STAGE_GATE
        appr_stage = insert_approval_request(
            conn, case_main["id"], "STAGE_GATE", stage_main_id, staff_a["id"], status="PENDING", minutes_ago=10
        )

        # 2. Staff B có 1 yêu cầu PENDING trên case_main: CHANGE_REQUEST
        cr_id, appr_cr = insert_change_request(
            conn,
            case_main["id"],
            staff_b["id"],
            reason="Yêu cầu bổ sung tra cứu nhãn hiệu tương tự",
            status="PENDING",
            minutes_ago=20,
        )

        # 3. Yêu cầu của Staff A nhưng đã APPROVED -> không được vào queue
        task_approved = insert_task(conn, case_main["id"], stage_main_id, staff_a["id"], "Task đã được duyệt")
        insert_approval_request(
            conn, case_main["id"], "TASK", task_approved, staff_a["id"], status="APPROVED", minutes_ago=5
        )

        # 4. Yêu cầu PENDING của Staff Other (ngoài phòng) -> không được vào queue phòng main
        task_by_other = insert_task(conn, case_main["id"], stage_main_id, staff_other["id"], "Task người ngoài phòng")
        insert_approval_request(
            conn, case_main["id"], "TASK", task_by_other, staff_other["id"], status="PENDING", minutes_ago=15
        )

        # 5. Yêu cầu PENDING của Staff A nhưng trên case_other (phòng khác) -> không được vào queue phòng main
        task_other_dept = insert_task(
            conn, case_other["id"], stage_other_id, staff_a["id"], "Task thuộc vụ phòng khác"
        )
        insert_approval_request(
            conn, case_other["id"], "TASK", task_other_dept, staff_a["id"], status="PENDING", minutes_ago=15
        )

    await sync_neo4j_graph(
        users=[leader, staff_a, staff_b, staff_other],
        departments=[dept_main, dept_other],
        cases=[case_main, case_other],
        leads=[(leader["id"], dept_main["id"])],
    )

    try:
        async with make_auth_client(leader["id"]) as c:
            r = await c.get(f"{BASE_HTTP}?department_id={dept_main['id']}")
            assert r.status_code == 200, r.text
            data = r.json()["data"]

            # stats pending_approvals_count = 3 (2 của staff A + 1 của staff B)
            assert data["stats"]["pending_approvals_count"] == 3

            # approval_queue
            queue = data["approval_queue"]
            assert len(queue) == 2, f"Queue chỉ gồm 2 nhân viên phòng chính, nhận được: {len(queue)}"

            queue_by_user = {item["user"]["id"]: item for item in queue}
            assert staff_a["id"] in queue_by_user
            assert staff_b["id"] in queue_by_user
            assert staff_other["id"] not in queue_by_user

            # Kiểm tra Staff A: 2 requests, cũ nhất trước
            qa = queue_by_user[staff_a["id"]]
            assert qa["pending_count"] == 2
            assert len(qa["requests"]) == 2
            req1, req2 = qa["requests"][0], qa["requests"][1]

            # Request 1: TASK
            assert req1["id"] == appr_task
            assert req1["subject_type"] == "TASK"
            assert req1["case_code"] == case_main["case_code"]
            assert req1["title"] == "Soạn tờ khai đăng ký nhãn hiệu"

            # Request 2: STAGE_GATE
            assert req2["id"] == appr_stage
            assert req2["subject_type"] == "STAGE_GATE"
            assert req2["case_code"] == case_main["case_code"]
            assert req2["title"] == "Thẩm định nội dung đơn"

            # Kiểm tra Staff B: 1 request CHANGE_REQUEST
            qb = queue_by_user[staff_b["id"]]
            assert qb["pending_count"] == 1
            assert len(qb["requests"]) == 1
            req_cr = qb["requests"][0]
            assert req_cr["id"] == appr_cr
            assert req_cr["subject_type"] == "CHANGE_REQUEST"
            assert req_cr["title"] == "Yêu cầu bổ sung tra cứu nhãn hiệu tương tự"

            # Kiểm tra workstations: cả staff_a và staff_b đều is_in_queue = True
            desks = {d["user"]["id"]: d for d in data["workstations"]}
            assert desks[staff_a["id"]]["is_in_queue"] is True
            assert desks[staff_b["id"]]["is_in_queue"] is True
    finally:
        await cleanup_all(
            case_ids=[case_main["id"], case_other["id"]],
            user_ids=[leader["id"], staff_a["id"], staff_b["id"], staff_other["id"]],
            dept_ids=[dept_main["id"], dept_other["id"]],
            client_ids=[client["id"]],
            mt_ids=[mt_main["id"], mt_other["id"]],
        )


# =====================================================================
# 4. WEBSOCKET XÁC THỰC VÀ PHẠM VI
# =====================================================================


def test_ws_authentication_and_scope_disconnect_codes():
    """WebSocket:

    - Không có cookie access_token -> đóng mã 4401.
    - Cookie không hợp lệ -> đóng mã 4401.
    - Không phải MANAGER (ví dụ ATTORNEY) -> đóng mã 4403.
    - Trưởng phòng A nối tới phòng B -> đóng mã 4403.
    """
    with db_conn() as conn:
        dept_a = create_test_department(conn, name="Phòng WS A")
        dept_b = create_test_department(conn, name="Phòng WS B")
        leader_a = create_user_with_dept(conn, "MANAGER", "Leader A WS", dept_a["id"])
        conn.execute(
            "INSERT INTO department_leaders (user_id, department_id) VALUES (%s, %s)",
            (leader_a["id"], dept_a["id"]),
        )
        attorney = create_user_with_dept(conn, "ATTORNEY", "Luật sư WS", dept_a["id"])

    tok_leader_a = token_for(leader_a["id"])
    tok_attorney = token_for(attorney["id"])

    try:
        with TestClient(app) as tc:
            # 1. Không cookie -> 4401
            with pytest.raises(WebSocketDisconnect) as e1:
                with tc.websocket_connect(f"{WS_ENDPOINT}?department_id={dept_a['id']}") as ws:
                    ws.receive_json()
            assert e1.value.code == 4401

            # 2. Token sai -> 4401
            tc.cookies.set("access_token", "invalid-token-string")
            with pytest.raises(WebSocketDisconnect) as e2:
                with tc.websocket_connect(f"{WS_ENDPOINT}?department_id={dept_a['id']}") as ws:
                    ws.receive_json()
            assert e2.value.code == 4401

            # 3. Attorney role -> 4403
            tc.cookies.set("access_token", tok_attorney)
            with pytest.raises(WebSocketDisconnect) as e3:
                with tc.websocket_connect(f"{WS_ENDPOINT}?department_id={dept_a['id']}") as ws:
                    ws.receive_json()
            assert e3.value.code == 4403

            # 4. Trưởng phòng A nối tới phòng B -> 4403
            tc.cookies.set("access_token", tok_leader_a)
            with pytest.raises(WebSocketDisconnect) as e4:
                with tc.websocket_connect(f"{WS_ENDPOINT}?department_id={dept_b['id']}") as ws:
                    ws.receive_json()
            assert e4.value.code == 4403
    finally:
        with db_conn() as conn:
            conn.execute("DELETE FROM department_leaders WHERE user_id = %s", (leader_a["id"],))
            conn.execute("DELETE FROM users WHERE id IN (%s, %s)", (leader_a["id"], attorney["id"]))
            conn.execute("DELETE FROM departments WHERE id IN (%s, %s)", (dept_a["id"], dept_b["id"]))


def test_ws_receives_redis_events_on_department_channel():
    """Trưởng phòng A nối phòng A nhận được sự kiện phát qua Redis channel floorplan:{deptA};

    không nhận sự kiện của floorplan:{deptB}.
    """
    with db_conn() as conn:
        dept_a = create_test_department(conn, name="Phòng WS Redis A")
        dept_b = create_test_department(conn, name="Phòng WS Redis B")
        leader_a = create_user_with_dept(conn, "MANAGER", "Leader A Redis", dept_a["id"])
        conn.execute(
            "INSERT INTO department_leaders (user_id, department_id) VALUES (%s, %s)",
            (leader_a["id"], dept_a["id"]),
        )

    tok_leader_a = token_for(leader_a["id"])
    r = sync_redis.Redis.from_url(get_redis_url(), decode_responses=True)

    event_a = {
        "type": "EVENT_TASK_STATUS_UPDATED",
        "payload": {
            "user_id": str(uuid.uuid4()),
            "in_progress_count": 2,
            "todo_count": 1,
        },
    }
    event_b = {
        "type": "EVENT_TASK_STATUS_UPDATED",
        "payload": {
            "user_id": str(uuid.uuid4()),
            "in_progress_count": 9,
            "todo_count": 9,
        },
    }

    try:
        with TestClient(app) as tc:
            tc.cookies.set("access_token", tok_leader_a)
            with tc.websocket_connect(f"{WS_ENDPOINT}?department_id={dept_a['id']}") as ws:
                # Bắn tin vào dept_b -> WS phòng A không nhận
                r.publish(f"floorplan:{dept_b['id']}", json.dumps(event_b))

                # Bắn tin vào dept_a -> WS phòng A nhận
                r.publish(f"floorplan:{dept_a['id']}", json.dumps(event_a))

                msg = ws.receive_json()
                # Có thể có handshake hoặc nhận thẳng event_a
                if msg.get("type") == "READY":
                    msg = ws.receive_json()

                assert msg == event_a
    finally:
        with db_conn() as conn:
            conn.execute("DELETE FROM department_leaders WHERE user_id = %s", (leader_a["id"],))
            conn.execute("DELETE FROM users WHERE id = %s", (leader_a["id"],))
            conn.execute("DELETE FROM departments WHERE id IN (%s, %s)", (dept_a["id"], dept_b["id"]))


# =====================================================================
# 5. TÍCH HỢP NGHIỆP VỤ & PHÁT SỰ KIỆN REAL-TIME (TC-FL-04, TC-FL-07)
# =====================================================================


async def test_decide_approval_publishes_event_and_updates_floorplan():
    """TC-FL-04:

    - Nhân sự có 1 yêu cầu PENDING.
    - Khi phê duyệt qua POST /api/v1/approvals/{id}/decide:
      + Redis kênh floorplan:{dept_id} nhận EVENT_APPROVAL_DECIDED {user_id, request_id, status}.
      + GET lại /operations/floorplan: nhân sự rời khỏi approval_queue, is_in_queue = False.
    """
    with db_conn() as conn:
        dept = create_test_department(conn, name="Phòng Duyệt Live")
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])

        leader = create_user_with_dept(conn, "MANAGER", "Trưởng Phòng Duyệt Live", dept["id"])
        conn.execute(
            "INSERT INTO department_leaders (user_id, department_id) VALUES (%s, %s)",
            (leader["id"], dept["id"]),
        )

        staff = create_user_with_dept(conn, "ATTORNEY", "Nhân Sự Duyệt Live", dept["id"])
        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'EXECUTOR', now())""",
            (case["id"], staff["id"]),
        )

        stage_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Stage Live', 1, 'ACTIVE')""",
            (stage_id, case["id"]),
        )
        task_id = insert_task(conn, case["id"], stage_id, staff["id"], "Task Cần Duyệt", requires_approval=True)
        appr_id = insert_approval_request(conn, case["id"], "TASK", task_id, staff["id"], status="PENDING")

    await sync_neo4j_graph(
        users=[leader, staff],
        departments=[dept],
        cases=[case],
        leads=[(leader["id"], dept["id"])],
        assignments=[(staff["id"], case["id"], "EXECUTOR")],
    )

    r_sync = sync_redis.Redis.from_url(get_redis_url(), decode_responses=True)
    ps = r_sync.pubsub()
    ps.subscribe(f"floorplan:{dept['id']}")
    ps.get_message(timeout=2)  # Xác nhận subscribe

    try:
        async with make_auth_client(leader["id"]) as c:
            # Kiểm tra trước khi duyệt: staff có trong queue
            res_before = await c.get(f"{BASE_HTTP}?department_id={dept['id']}")
            assert res_before.status_code == 200, res_before.text
            assert res_before.json()["data"]["stats"]["pending_approvals_count"] == 1
            assert res_before.json()["data"]["workstations"][0]["is_in_queue"] is True

            # Thực hiện phê duyệt
            decide_res = await c.post(
                f"/api/v1/approvals/{appr_id}/decide",
                json={"action": "APPROVE", "comment": "Đã duyệt hồ sơ"},
            )
            assert decide_res.status_code == 200, decide_res.text

            # Kiểm tra nhận sự kiện trên Redis
            msg = None
            for _ in range(25):
                m = ps.get_message(timeout=0.2)
                if m and m["type"] == "message":
                    data = json.loads(m["data"])
                    if data.get("type") == "EVENT_APPROVAL_DECIDED":
                        msg = data
                        break

            assert msg is not None, "Không nhận được EVENT_APPROVAL_DECIDED trên kênh Redis floorplan"
            assert msg["payload"]["user_id"] == staff["id"]
            assert msg["payload"]["request_id"] == appr_id
            assert msg["payload"]["status"] == "APPROVED"

            # Kiểm tra lại GET floorplan sau khi duyệt
            res_after = await c.get(f"{BASE_HTTP}?department_id={dept['id']}")
            assert res_after.status_code == 200, res_after.text
            data_after = res_after.json()["data"]
            assert data_after["stats"]["pending_approvals_count"] == 0
            assert len(data_after["approval_queue"]) == 0
            assert data_after["workstations"][0]["is_in_queue"] is False
    finally:
        ps.close()
        await cleanup_all(
            case_ids=[case["id"]],
            user_ids=[leader["id"], staff["id"]],
            dept_ids=[dept["id"]],
            client_ids=[client["id"]],
            mt_ids=[mt["id"]],
        )


async def test_task_status_update_publishes_event_and_updates_floorplan():
    """TC-FL-07:

    - Khi đổi trạng thái task của nhân sự:
      + Redis kênh floorplan:{dept_id} nhận EVENT_TASK_STATUS_UPDATED {user_id, in_progress_count, todo_count}.
      + GET lại /operations/floorplan: số đếm và is_idle cập nhật đúng.
    """
    with db_conn() as conn:
        dept = create_test_department(conn, name="Phòng Task Live")
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"])

        leader = create_user_with_dept(conn, "MANAGER", "Trưởng Phòng Task Live", dept["id"])
        conn.execute(
            "INSERT INTO department_leaders (user_id, department_id) VALUES (%s, %s)",
            (leader["id"], dept["id"]),
        )

        staff = create_user_with_dept(conn, "ATTORNEY", "Nhân Sự Task Live", dept["id"])
        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'EXECUTOR', now())""",
            (case["id"], staff["id"]),
        )

        stage_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO case_stages (id, case_id, name, order_index, status)
               VALUES (%s, %s, 'Stage Task', 1, 'ACTIVE')""",
            (stage_id, case["id"]),
        )
        task_id = insert_task(conn, case["id"], stage_id, staff["id"], "Task Chuyển Đổi Trạng Thái", status="TODO")

    await sync_neo4j_graph(
        users=[leader, staff],
        departments=[dept],
        cases=[case],
        leads=[(leader["id"], dept["id"])],
        assignments=[(staff["id"], case["id"], "EXECUTOR")],
    )

    r_sync = sync_redis.Redis.from_url(get_redis_url(), decode_responses=True)
    ps = r_sync.pubsub()
    ps.subscribe(f"floorplan:{dept['id']}")
    ps.get_message(timeout=2)

    try:
        async with make_auth_client(leader["id"]) as c_leader:
            # Ban đầu: in_progress_count = 0, todo_count = 1, is_idle = True
            r_before = await c_leader.get(f"{BASE_HTTP}?department_id={dept['id']}")
            assert r_before.status_code == 200, r_before.text
            ws_before = r_before.json()["data"]["workstations"][0]
            assert ws_before["in_progress_count"] == 0
            assert ws_before["todo_count"] == 1
            assert ws_before["is_idle"] is True

        # Nhân sự bắt đầu làm task (chuyển sang IN_PROGRESS)
        async with make_auth_client(staff["id"]) as c_staff:
            patch_res = await c_staff.patch(
                f"/api/v1/cases/{case['id']}/tasks/{task_id}/status",
                json={"status": "IN_PROGRESS", "note": "Bắt đầu triển khai"},
            )
            assert patch_res.status_code == 200, patch_res.text

        # Kiểm tra nhận sự kiện trên Redis
        msg = None
        for _ in range(25):
            m = ps.get_message(timeout=0.2)
            if m and m["type"] == "message":
                data = json.loads(m["data"])
                if data.get("type") == "EVENT_TASK_STATUS_UPDATED":
                    msg = data
                    break

        assert msg is not None, "Không nhận được EVENT_TASK_STATUS_UPDATED trên kênh Redis floorplan"
        assert msg["payload"]["user_id"] == staff["id"]
        assert msg["payload"]["in_progress_count"] == 1
        assert msg["payload"]["todo_count"] == 0

        # Kiểm tra lại GET floorplan
        async with make_auth_client(leader["id"]) as c_leader:
            r_after = await c_leader.get(f"{BASE_HTTP}?department_id={dept['id']}")
            assert r_after.status_code == 200, r_after.text
            ws_after = r_after.json()["data"]["workstations"][0]
            assert ws_after["in_progress_count"] == 1
            assert ws_after["todo_count"] == 0
            assert ws_after["is_idle"] is False
    finally:
        ps.close()
        await cleanup_all(
            case_ids=[case["id"]],
            user_ids=[leader["id"], staff["id"]],
            dept_ids=[dept["id"]],
            client_ids=[client["id"]],
            mt_ids=[mt["id"]],
        )


async def test_publish_floorplan_event_contract_and_resilience():
    """Service publish_floorplan_event:

    - Không lỗi khi department_id là None.
    - Nuốt lỗi Redis và ghi log, không văng exception làm hỏng luồng gọi.
    """
    try:
        from backend.app.services.floorplan import publish_floorplan_event
    except ImportError:
        pytest.fail("Chưa triển khai backend.app.services.floorplan.publish_floorplan_event")

    # Gọi với None -> không làm gì, an toàn
    await publish_floorplan_event(None, "EVENT_TASK_STATUS_UPDATED", {"user_id": str(uuid.uuid4())})
