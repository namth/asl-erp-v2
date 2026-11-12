import asyncio
import uuid
from typing import Optional, List, Dict, Any
from sqlalchemy import text
import psycopg

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.db.postgres import engine
from backend.app.db.neo4j import get_neo4j_driver
from backend.app.guards.need_to_know import query_need_to_know_facts
from backend.app.guards.access_policy import can_access_scope
from backend.app.services.audit import log_audit_event
from backend.app.schemas.cases import AssignmentItem

def record_access_denied_audit(user_id: str, case_id: str):
    try:
        with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
            log_audit_event(
                conn=conn,
                actor_type="USER",
                action="ACCESS_DENIED",
                entity_name="cases",
                entity_id=case_id,
                actor_id=user_id,
            )
    except Exception:
        pass

async def check_case_access(user_id: str, case_id: str, scope: str) -> None:
    facts = await query_need_to_know_facts(user_id, case_id)
    allowed = can_access_scope(facts, scope)
    if not allowed:
        # Retry once after 100ms in case of Neo4j Aura replication/session delay
        await asyncio.sleep(0.1)
        facts = await query_need_to_know_facts(user_id, case_id)
        allowed = can_access_scope(facts, scope)

    if not allowed:
        record_access_denied_audit(user_id, case_id)
        raise AppException(
            status_code=403,
            code="NEED_TO_KNOW_DENIED",
            message=f"NEED_TO_KNOW_DENIED: Access to scope '{scope}' on case '{case_id}' is restricted."
        )

async def get_accessible_case_ids(current_user: Dict[str, Any]) -> Optional[List[str]]:
    """Returns None if user can see all cases, or a list of accessible case UUIDs."""
    if current_user.get("is_executive") or current_user.get("system_role") == "ACCOUNTANT":
        return None  # Unrestricted progress scope

    user_id = str(current_user["id"])
    driver = get_neo4j_driver()
    db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
    kwargs = {"database": db_name} if db_name else {}

    cypher = """
    MATCH (u:User {id: $uid})
    OPTIONAL MATCH (u)-[:ASSIGNED_TO]->(c1:Case)
    OPTIONAL MATCH (u)-[:LEADS]->(:Department)<-[:IN_DEPARTMENT]-(c2:Case)
    OPTIONAL MATCH (u)-[:ORIGINATED]->(c3:Case)
    RETURN apoc.coll.toSet(
        [x IN collect(DISTINCT c1.id) WHERE x IS NOT NULL] +
        [x IN collect(DISTINCT c2.id) WHERE x IS NOT NULL] +
        [x IN collect(DISTINCT c3.id) WHERE x IS NOT NULL]
    ) AS case_ids
    """
    fallback_cypher = """
    MATCH (u:User {id: $uid})
    OPTIONAL MATCH (u)-[:ASSIGNED_TO]->(c1:Case)
    OPTIONAL MATCH (u)-[:LEADS]->(:Department)<-[:IN_DEPARTMENT]-(c2:Case)
    OPTIONAL MATCH (u)-[:ORIGINATED]->(c3:Case)
    RETURN collect(DISTINCT c1.id) + collect(DISTINCT c2.id) + collect(DISTINCT c3.id) AS case_ids
    """
    try:
        async with driver.session(**kwargs) as session:
            try:
                res = await session.run(cypher, uid=user_id)
                rec = await res.single()
                raw_ids = rec["case_ids"] if rec else []
            except Exception:
                res = await session.run(fallback_cypher, uid=user_id)
                rec = await res.single()
                raw_ids = rec["case_ids"] if rec else []
            return list(set(str(x) for x in raw_ids if x))
    except Exception:
        # Fallback to Postgres if Neo4j error
        async with engine.connect() as conn:
            q = text("""
                SELECT DISTINCT case_id FROM case_assignments WHERE user_id = :uid AND unassigned_at IS NULL
                UNION
                SELECT c.id FROM cases c JOIN department_leaders dl ON c.department_id = dl.department_id WHERE dl.user_id = :uid
            """)
            r = await conn.execute(q, {"uid": user_id})
            return [str(row[0]) for row in r.fetchall()]

async def list_cases(
    current_user: Dict[str, Any],
    q: Optional[str] = None,
    status: Optional[str] = None,
    department_id: Optional[str] = None,
    mine: bool = False,
    page: int = 1,
    limit: int = 50
) -> Dict[str, Any]:
    accessible_ids = await get_accessible_case_ids(current_user)
    if accessible_ids is not None and len(accessible_ids) == 0:
        return {"data": [], "meta": {"page": page, "limit": limit, "total_records": 0, "total_pages": 0}}

    conditions = []
    params: Dict[str, Any] = {}

    if accessible_ids is not None:
        conditions.append("c.id = ANY(:accessible_ids)")
        params["accessible_ids"] = [uuid.UUID(x) for x in accessible_ids]

    if q:
        conditions.append("(c.case_code ILIKE :q OR c.title ILIKE :q)")
        params["q"] = f"%{q.strip()}%"

    if status:
        conditions.append("c.status = :status")
        params["status"] = status

    if department_id:
        conditions.append("c.department_id = :dept_id")
        params["dept_id"] = uuid.UUID(department_id)

    if mine:
        conditions.append("EXISTS (SELECT 1 FROM case_assignments ca WHERE ca.case_id = c.id AND ca.user_id = :my_id AND ca.unassigned_at IS NULL)")
        params["my_id"] = uuid.UUID(current_user["id"])

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    async with engine.connect() as conn:
        count_sql = text(f"SELECT COUNT(*) FROM cases c {where_clause}")
        total = (await conn.execute(count_sql, params)).scalar() or 0

        offset = (page - 1) * limit
        params["limit"] = limit
        params["offset"] = offset

        sql = text(f"""
            SELECT c.id, c.case_code, c.title, c.status, c.workflow_mode,
                   COALESCE(c.current_stage_id, (
                       SELECT s.id FROM case_stages s
                       WHERE s.case_id = c.id AND s.status NOT IN ('LOCKED', 'COMPLETED')
                       ORDER BY s.order_index LIMIT 1
                   )) AS current_stage_id,
                   (SELECT MIN(t.due_at) FROM case_tasks t
                    WHERE t.case_id = c.id AND t.status <> 'COMPLETED') AS due_at_nearest,
                   c.department_id, cl.name AS client_name,
                   (SELECT role_in_case FROM case_assignments WHERE case_id = c.id AND user_id = :curr_uid AND unassigned_at IS NULL LIMIT 1) AS my_role
            FROM cases c
            LEFT JOIN clients cl ON c.client_id = cl.id
            {where_clause}
            ORDER BY c.created_at DESC
            LIMIT :limit OFFSET :offset
        """)
        params["curr_uid"] = uuid.UUID(current_user["id"])
        rows = (await conn.execute(sql, params)).fetchall()

        items = []
        for r in rows:
            case_id = str(r.id)
            # Progress calculation
            progress_res = await conn.execute(text("""
                SELECT COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed
                FROM case_tasks WHERE case_id = :cid
            """), {"cid": r.id})
            prog = progress_res.fetchone()
            tot = prog.total if prog else 0
            comp = prog.completed if prog else 0
            pct = round((comp / tot) * 100) if tot > 0 else 0

            # Current stage info
            stage_info = None
            if r.current_stage_id:
                st_res = await conn.execute(text("""
                    SELECT name, status FROM case_stages WHERE id = :sid
                """), {"sid": r.current_stage_id})
                st_row = st_res.fetchone()
                if st_row:
                    stage_info = {"name": st_row.name, "status": st_row.status}

            items.append({
                "id": case_id,
                "case_code": r.case_code,
                "title": r.title,
                "client_name": r.client_name or "",
                "status": r.status,
                "workflow_mode": r.workflow_mode,
                "current_stage": stage_info,
                "progress_pct": pct,
                "due_at_nearest": r.due_at_nearest.isoformat() if r.due_at_nearest else None,
                "my_role_in_case": r.my_role
            })

    return {"data": items, "meta": {"page": page, "limit": limit, "total_records": total, "total_pages": -(-total // limit) if total else 0}}

async def get_case_detail(case_id: str, view: Optional[str], current_user: Dict[str, Any]) -> Dict[str, Any]:
    scope = "progress" if view == "progress" else "professional"
    await check_case_access(current_user["id"], case_id, scope)

    async with engine.connect() as conn:
        res = await conn.execute(text("""
            SELECT c.id, c.case_code, c.title, c.status, c.workflow_mode, c.contract_value,
                   c.is_legacy, c.custom_data, c.client_id,
                   COALESCE(c.current_stage_id, (
                       SELECT s.id FROM case_stages s
                       WHERE s.case_id = c.id AND s.status NOT IN ('LOCKED', 'COMPLETED')
                       ORDER BY s.order_index LIMIT 1
                   )) AS current_stage_id,
                   cl.name AS client_name, cl.tax_code AS client_tax_code
            FROM cases c
            LEFT JOIN clients cl ON c.client_id = cl.id
            WHERE c.id = :cid
        """), {"cid": uuid.UUID(case_id)})
        c = res.fetchone()
        if not c:
            raise AppException(404, "NOT_FOUND", "Không tìm thấy vụ việc")

        # Progress calculation
        progress_res = await conn.execute(text("""
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed
            FROM case_tasks WHERE case_id = :cid
        """), {"cid": c.id})
        prog = progress_res.fetchone()
        tot = prog.total if prog else 0
        comp = prog.completed if prog else 0
        pct = round((comp / tot) * 100) if tot > 0 else 0

        if view == "progress":
            return {
                "id": str(c.id),
                "case_code": c.case_code,
                "title": c.title,
                "status": c.status,
                "progress_pct": pct,
            }

        # Professional view
        # Current stage
        current_stage = None
        if c.current_stage_id:
            st_res = await conn.execute(text("""
                SELECT id, name, order_index, status, blocking_milestone_id
                FROM case_stages WHERE id = :sid
            """), {"sid": c.current_stage_id})
            st = st_res.fetchone()
            if st:
                current_stage = {
                    "id": str(st.id),
                    "name": st.name,
                    "order_index": st.order_index,
                    "status": st.status,
                    "blocking_milestone_id": str(st.blocking_milestone_id) if st.blocking_milestone_id else None
                }
        else:
            # Pick lowest order_index stage that is not completed
            st_res = await conn.execute(text("""
                SELECT id, name, order_index, status, blocking_milestone_id
                FROM case_stages WHERE case_id = :cid ORDER BY order_index ASC LIMIT 1
            """), {"cid": c.id})
            st = st_res.fetchone()
            if st:
                current_stage = {
                    "id": str(st.id),
                    "name": st.name,
                    "order_index": st.order_index,
                    "status": st.status,
                    "blocking_milestone_id": str(st.blocking_milestone_id) if st.blocking_milestone_id else None
                }

        # Assignments
        assign_res = await conn.execute(text("""
            SELECT ca.user_id, ca.role_in_case, u.full_name, u.email
            FROM case_assignments ca
            JOIN users u ON ca.user_id = u.id
            WHERE ca.case_id = :cid AND ca.unassigned_at IS NULL
            ORDER BY ca.assigned_at ASC
        """), {"cid": c.id})
        assignments = [
            {
                "user_id": str(a.user_id),
                "full_name": a.full_name,
                "role_in_case": a.role_in_case
            }
            for a in assign_res.fetchall()
        ]

        return {
            "id": str(c.id),
            "case_code": c.case_code,
            "title": c.title,
            "status": c.status,
            "workflow_mode": c.workflow_mode,
            "is_legacy": bool(c.is_legacy),
            "contract_value": str(c.contract_value) if c.contract_value is not None else "0",
            "client": {
                "id": str(c.client_id),
                "name": c.client_name or "",
                "tax_code": c.client_tax_code
            },
            "current_stage": current_stage,
            "progress_pct": pct,
            "assignments": assignments,
            "custom_data": c.custom_data if c.custom_data is not None else {}
        }

async def update_case_status(
    case_id: str,
    new_status: str,
    reason: Optional[str],
    current_user: Dict[str, Any]
) -> Dict[str, Any]:
    await check_case_access(current_user["id"], case_id, "professional")

    async with engine.begin() as conn:
        res = await conn.execute(text("""
            SELECT id, status, is_legacy, case_code
            FROM cases WHERE id = :cid FOR UPDATE
        """), {"cid": uuid.UUID(case_id)})
        c = res.fetchone()
        if not c:
            raise AppException(404, "NOT_FOUND", "Không tìm thấy vụ việc")

        if c.is_legacy:
            raise AppException(409, "LEGACY_CASE_READ_ONLY", "Vụ việc lịch sử chỉ đọc, không thể thay đổi trạng thái")

        current_status = c.status

        # Transition validations
        if current_status == "INITIALIZING" and new_status == "ACTIVE":
            # Check personnel
            count_res = await conn.execute(text("""
                SELECT role_in_case, COUNT(*) AS cnt
                FROM case_assignments
                WHERE case_id = :cid AND unassigned_at IS NULL
                GROUP BY role_in_case
            """), {"cid": c.id})
            counts = {row.role_in_case: row.cnt for row in count_res.fetchall()}
            if counts.get("CASE_MANAGER", 0) != 1 or counts.get("EXECUTOR", 0) < 1:
                raise AppException(422, "INSUFFICIENT_PERSONNEL", "Cần đúng 1 CASE_MANAGER và ít nhất 1 EXECUTOR để kích hoạt vụ việc")

        elif current_status == "ACTIVE" and new_status == "PAUSED":
            if not reason or not reason.strip():
                raise AppException(422, "VALIDATION_ERROR", "Tạm dừng vụ việc bắt buộc có lý do")

        elif current_status == "PAUSED" and new_status == "ACTIVE":
            pass

        elif new_status == "TERMINATED":
            if current_status not in ("INITIALIZING", "ACTIVE", "PAUSED"):
                raise AppException(409, "INVALID_STATE_TRANSITION", f"Không thể chấm dứt vụ việc từ trạng thái {current_status}")
            if not reason or not reason.strip():
                raise AppException(422, "VALIDATION_ERROR", "Chấm dứt vụ việc bắt buộc có lý do")

            # Cancel unconfirmed billing milestones
            await conn.execute(text("""
                UPDATE billing_milestones
                SET status = 'CANCELLED', cancelled_reason = :reason
                WHERE case_id = :cid AND status != 'PAID_CONFIRMED'
            """), {"cid": c.id, "reason": reason.strip()})

        elif current_status == "ACTIVE" and new_status == "CLOSED":
            # Check stages and milestones
            st_res = await conn.execute(text("""
                SELECT COUNT(*) FROM case_stages WHERE case_id = :cid AND status != 'COMPLETED'
            """), {"cid": c.id})
            if (st_res.scalar() or 0) > 0:
                raise AppException(409, "INVALID_STATE_TRANSITION", "Mọi giai đoạn phải hoàn thành trước khi đóng vụ việc")
        else:
            raise AppException(409, "INVALID_STATE_TRANSITION", f"Chuyển trạng thái không hợp lệ: {current_status} -> {new_status}")

        update_fields = {"status": new_status, "cid": c.id}
        if new_status == "TERMINATED":
            await conn.execute(text("""
                UPDATE cases
                SET status = :status, termination_reason = :reason
                WHERE id = :cid
            """), {"status": new_status, "reason": reason.strip(), "cid": c.id})
        elif new_status == "CLOSED":
            await conn.execute(text("""
                UPDATE cases
                SET status = :status, closed_at = NOW()
                WHERE id = :cid
            """), update_fields)
        else:
            await conn.execute(text("""
                UPDATE cases
                SET status = :status
                WHERE id = :cid
            """), update_fields)

    # Sync Neo4j
    driver = get_neo4j_driver()
    db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
    kwargs = {"database": db_name} if db_name else {}
    try:
        async with driver.session(**kwargs) as session:
            await session.run("MATCH (c:Case {id: $cid}) SET c.status = $status", cid=case_id, status=new_status)
    except Exception:
        pass

    return {"id": case_id, "status": new_status}

async def get_case_assignments(case_id: str, current_user: Dict[str, Any]) -> List[Dict[str, Any]]:
    await check_case_access(current_user["id"], case_id, "professional")

    async with engine.connect() as conn:
        res = await conn.execute(text("""
            SELECT ca.user_id, ca.role_in_case, ca.assigned_at, u.full_name, u.email
            FROM case_assignments ca
            JOIN users u ON ca.user_id = u.id
            WHERE ca.case_id = :cid AND ca.unassigned_at IS NULL
            ORDER BY ca.assigned_at ASC
        """), {"cid": uuid.UUID(case_id)})
        return [
            {
                "user_id": str(r.user_id),
                "full_name": r.full_name,
                "email": r.email,
                "role_in_case": r.role_in_case,
                "assigned_at": r.assigned_at.isoformat() if r.assigned_at else None
            }
            for r in res.fetchall()
        ]

async def update_case_assignments(
    case_id: str,
    assignments: List[AssignmentItem],
    current_user: Dict[str, Any]
) -> List[Dict[str, Any]]:
    await check_case_access(current_user["id"], case_id, "professional")

    async with engine.begin() as conn:
        res = await conn.execute(text("""
            SELECT id, is_legacy FROM cases WHERE id = :cid FOR UPDATE
        """), {"cid": uuid.UUID(case_id)})
        c = res.fetchone()
        if not c:
            raise AppException(404, "NOT_FOUND", "Không tìm thấy vụ việc")
        if c.is_legacy:
            raise AppException(409, "LEGACY_CASE_READ_ONLY", "Vụ việc lịch sử chỉ đọc, không thể thay đổi phân công")

        # Validate count
        cm_count = sum(1 for a in assignments if a.role_in_case == "CASE_MANAGER")
        sup_count = sum(1 for a in assignments if a.role_in_case == "SUPERVISOR")
        if cm_count != 1:
            raise AppException(422, "VALIDATION_ERROR", f"Cần đúng 1 CASE_MANAGER, hiện có {cm_count}")
        if sup_count > 1:
            raise AppException(422, "VALIDATION_ERROR", f"Tối đa 1 SUPERVISOR, hiện có {sup_count}")

        new_user_ids = {str(a.user_id) for a in assignments}

        # Check open tasks of removed assignees
        open_tasks = await conn.execute(text("""
            SELECT id, assigned_to
            FROM case_tasks
            WHERE case_id = :cid AND status IN ('IN_PROGRESS', 'WAITING_APPROVAL') AND assigned_to IS NOT NULL
        """), {"cid": c.id})
        for task in open_tasks.fetchall():
            if str(task.assigned_to) not in new_user_ids:
                raise AppException(
                    409,
                    "ASSIGNEE_HAS_OPEN_TASKS",
                    "Không thể gỡ phân công nhân sự đang có tác vụ dở dang",
                    details={"task_ids": [str(task.id)], "user_id": str(task.assigned_to)}
                )

        # Mark removed assignments as unassigned
        await conn.execute(text("""
            UPDATE case_assignments
            SET unassigned_at = NOW()
            WHERE case_id = :cid AND unassigned_at IS NULL
        """), {"cid": c.id})

        # Insert new assignments
        for item in assignments:
            await conn.execute(text("""
                INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
                VALUES (:cid, :uid, :role, NOW())
            """), {"cid": c.id, "uid": item.user_id, "role": item.role_in_case})

    # Sync Neo4j graph immediately in request
    driver = get_neo4j_driver()
    db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
    kwargs = {"database": db_name} if db_name else {}
    async with driver.session(**kwargs) as session:
        await session.run("""
            MATCH (c:Case {id: $cid})
            OPTIONAL MATCH (u:User)-[r:ASSIGNED_TO]->(c)
            DELETE r
            WITH c
            UNWIND $assignments AS a
            MATCH (u:User {id: a.user_id})
            MERGE (u)-[:ASSIGNED_TO {role: a.role_in_case}]->(c)
        """, cid=case_id, assignments=[{"user_id": str(a.user_id), "role_in_case": a.role_in_case} for a in assignments])

    return await get_case_assignments(case_id, current_user)

async def get_case_stages(case_id: str, current_user: Dict[str, Any]) -> List[Dict[str, Any]]:
    await check_case_access(current_user["id"], case_id, "professional")

    async with engine.connect() as conn:
        stages_res = await conn.execute(text("""
            SELECT s.id, s.name, s.order_index, s.status, s.requires_approval, s.blocking_milestone_id,
                   m.name AS milestone_name, m.status AS milestone_status
            FROM case_stages s
            LEFT JOIN billing_milestones m ON s.blocking_milestone_id = m.id
            WHERE s.case_id = :cid
            ORDER BY s.order_index ASC
        """), {"cid": uuid.UUID(case_id)})
        stages = stages_res.fetchall()

        result = []
        for s in stages:
            counts_res = await conn.execute(text("""
                SELECT status, COUNT(*) AS cnt
                FROM case_tasks
                WHERE stage_id = :sid
                GROUP BY status
            """), {"sid": s.id})
            c_map = {r.status: r.cnt for r in counts_res.fetchall()}
            task_counts = {
                "todo": c_map.get("TODO", 0),
                "in_progress": c_map.get("IN_PROGRESS", 0),
                "waiting_approval": c_map.get("WAITING_APPROVAL", 0),
                "completed": c_map.get("COMPLETED", 0),
            }

            blocking = None
            if s.blocking_milestone_id:
                blocking = {
                    "id": str(s.blocking_milestone_id),
                    "name": s.milestone_name,
                    "status": s.milestone_status
                }

            result.append({
                "id": str(s.id),
                "name": s.name,
                "order_index": s.order_index,
                "status": s.status,
                "requires_approval": bool(s.requires_approval),
                "blocking_milestone": blocking,
                "task_counts": task_counts
            })

        return result
