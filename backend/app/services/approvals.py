import json
import uuid
from typing import Optional, List, Dict, Any
from sqlalchemy import text
import psycopg

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.db.postgres import engine
from backend.app.db.neo4j import get_neo4j_driver
from backend.app.guards.need_to_know import query_need_to_know_facts
from backend.app.services.audit import log_audit_event
from backend.app.services.case_tasks import complete_task_side_effects, complete_stage_and_unlock_next

def record_approval_audit(user_id: str, approval_id: str, action: str):
    try:
        with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
            log_audit_event(
                conn=conn,
                actor_type="USER",
                action="APPROVAL_DECIDED",
                entity_name="approval_requests",
                entity_id=approval_id,
                actor_id=user_id,
            )
    except Exception:
        pass

async def check_user_approval_authority(
    conn,
    subject_type: str,
    case_id: uuid.UUID,
    department_id: uuid.UUID,
    current_user: Dict[str, Any]
) -> bool:
    user_id = str(current_user["id"])

    # 1. Executive
    if current_user.get("is_executive"):
        return True

    # 2. Check facts from Neo4j (includes leads_case_department and is_case_manager)
    facts = await query_need_to_know_facts(user_id, str(case_id))
    if facts.get("is_executive") or facts.get("leads_case_department"):
        return True

    # 3. Dept leader from Postgres
    user_uuid = uuid.UUID(user_id)
    dept_res = await conn.execute(text("""
        SELECT 1 FROM department_leaders
        WHERE user_id = :uid AND department_id = :did
    """), {"uid": user_uuid, "did": department_id})
    if dept_res.fetchone():
        return True

    # 4. Type-specific checks
    if subject_type == "TASK":
        if facts.get("is_case_manager"):
            return True
        cm_res = await conn.execute(text("""
            SELECT 1 FROM case_assignments
            WHERE case_id = :cid AND user_id = :uid AND role_in_case = 'CASE_MANAGER' AND unassigned_at IS NULL
        """), {"cid": case_id, "uid": user_uuid})
        if cm_res.fetchone():
            return True

    elif subject_type == "STAGE_GATE":
        # Check supervisor in Postgres
        sup_res = await conn.execute(text("""
            SELECT 1 FROM case_assignments
            WHERE case_id = :cid AND user_id = :uid AND role_in_case = 'SUPERVISOR' AND unassigned_at IS NULL
        """), {"cid": case_id, "uid": user_uuid})
        if sup_res.fetchone():
            return True

        # Check supervisor in Neo4j
        driver = get_neo4j_driver()
        db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
        kwargs = {"database": db_name} if db_name else {}
        try:
            async with driver.session(**kwargs) as session:
                r = await session.run("""
                    MATCH (u:User {id: $uid})-[rel:ASSIGNED_TO {role: 'SUPERVISOR'}]->(c:Case {id: $cid})
                    RETURN rel IS NOT NULL AS is_sup
                """, uid=user_id, cid=str(case_id))
                rec = await r.single()
                if rec and rec["is_sup"]:
                    return True
        except Exception:
            pass

    return False

async def list_approvals(
    status: Optional[str],
    approval_type: Optional[str],
    current_user: Dict[str, Any]
) -> List[Dict[str, Any]]:
    status_filter = status or "PENDING"

    conditions = ["ar.status = :status"]
    params: Dict[str, Any] = {"status": status_filter}

    if approval_type:
        conditions.append("ar.subject_type = :type")
        params["type"] = approval_type

    where_clause = "WHERE " + " AND ".join(conditions)

    async with engine.connect() as conn:
        res = await conn.execute(text(f"""
            SELECT ar.id, ar.case_id, ar.subject_type, ar.subject_id, ar.requested_by, ar.status, ar.requested_at,
                   c.case_code, c.title AS case_title, c.department_id,
                   u.full_name AS requester_name
            FROM approval_requests ar
            JOIN cases c ON ar.case_id = c.id
            LEFT JOIN users u ON ar.requested_by = u.id
            {where_clause}
            ORDER BY ar.requested_at DESC
        """), params)
        rows = res.fetchall()

        items = []
        for r in rows:
            # Check authority
            has_auth = await check_user_approval_authority(
                conn=conn,
                subject_type=r.subject_type,
                case_id=r.case_id,
                department_id=r.department_id,
                current_user=current_user
            )
            if not has_auth:
                continue

            # Subject title
            subject_title = ""
            if r.subject_type == "TASK":
                t_res = await conn.execute(text("SELECT title FROM case_tasks WHERE id = :tid"), {"tid": r.subject_id})
                t_row = t_res.fetchone()
                subject_title = t_row.title if t_row else ""
            elif r.subject_type == "STAGE_GATE":
                s_res = await conn.execute(text("SELECT name FROM case_stages WHERE id = :sid"), {"sid": r.subject_id})
                s_row = s_res.fetchone()
                subject_title = s_row.name if s_row else ""
            elif r.subject_type == "CHANGE_REQUEST":
                cr_res = await conn.execute(text("SELECT proposal FROM workflow_change_requests WHERE id = :crid"), {"crid": r.subject_id})
                cr_row = cr_res.fetchone()
                if cr_row and cr_row.proposal:
                    prop = cr_row.proposal if isinstance(cr_row.proposal, dict) else json.loads(cr_row.proposal or "{}")
                    subject_title = prop.get("title", "Yêu cầu bổ sung")

            items.append({
                "id": str(r.id),
                "type": r.subject_type,
                "case": {
                    "id": str(r.case_id),
                    "case_code": r.case_code,
                    "title": r.case_title
                },
                "subject": {
                    "id": str(r.subject_id),
                    "title": subject_title
                },
                "requested_by": {
                    "id": str(r.requested_by),
                    "full_name": r.requester_name or ""
                },
                "requested_at": r.requested_at.isoformat() if r.requested_at else None,
                "note": None
            })

        return items

async def decide_approval(
    approval_id: str,
    action: str,
    comment: Optional[str],
    current_user: Dict[str, Any]
) -> Dict[str, Any]:
    if action not in ("APPROVE", "REJECT"):
        raise AppException(422, "VALIDATION_ERROR", f"Hành động không hợp lệ: {action}. Chỉ chấp nhận APPROVE hoặc REJECT")

    if action == "REJECT" and (not comment or not comment.strip()):
        raise AppException(422, "VALIDATION_ERROR", "Từ chối phê duyệt bắt buộc phải có nhận xét (comment)")

    appr_uuid = uuid.UUID(approval_id)

    async with engine.begin() as conn:
        res = await conn.execute(text("""
            SELECT ar.id, ar.case_id, ar.subject_type, ar.subject_id, ar.requested_by, ar.status,
                   c.department_id, c.is_legacy
            FROM approval_requests ar
            JOIN cases c ON ar.case_id = c.id
            WHERE ar.id = :aid
            FOR UPDATE
        """), {"aid": appr_uuid})
        ar = res.fetchone()
        if not ar:
            raise AppException(404, "NOT_FOUND", "Không tìm thấy yêu cầu phê duyệt")

        if ar.status != "PENDING":
            raise AppException(409, "INVALID_STATE_TRANSITION", f"Yêu cầu phê duyệt đang ở trạng thái {ar.status}")

        # Check self approval
        if str(ar.requested_by) == str(current_user["id"]):
            raise AppException(403, "APPROVAL_NOT_ALLOWED", "Không được tự phê duyệt yêu cầu của chính mình")

        # Check authority
        has_auth = await check_user_approval_authority(
            conn=conn,
            subject_type=ar.subject_type,
            case_id=ar.case_id,
            department_id=ar.department_id,
            current_user=current_user
        )
        if not has_auth:
            raise AppException(403, "APPROVAL_NOT_ALLOWED", "Bạn không có thẩm quyền phê duyệt yêu cầu này")

        # Update approval_requests
        new_appr_status = "APPROVED" if action == "APPROVE" else "REJECTED"
        await conn.execute(text("""
            UPDATE approval_requests
            SET status = :status, decided_by = :uid, decided_at = NOW(), decision_comment = :comment
            WHERE id = :aid
        """), {
            "status": new_appr_status,
            "uid": uuid.UUID(current_user["id"]),
            "comment": comment,
            "aid": ar.id
        })

        # Side effects
        if ar.subject_type == "TASK":
            t_res = await conn.execute(text("""
                SELECT id, case_id, stage_id, triggers_milestone_id
                FROM case_tasks WHERE id = :tid
            """), {"tid": ar.subject_id})
            t = t_res.fetchone()
            if t:
                if action == "APPROVE":
                    await complete_task_side_effects(
                        conn=conn,
                        task_id=t.id,
                        case_id=t.case_id,
                        stage_id=t.stage_id,
                        triggers_milestone_id=t.triggers_milestone_id,
                        current_user_id=current_user["id"]
                    )
                else:
                    await conn.execute(text("""
                        UPDATE case_tasks
                        SET status = 'IN_PROGRESS'
                        WHERE id = :tid
                    """), {"tid": t.id})

        elif ar.subject_type == "STAGE_GATE":
            st_res = await conn.execute(text("""
                SELECT id, order_index
                FROM case_stages WHERE id = :sid
            """), {"sid": ar.subject_id})
            st = st_res.fetchone()
            if st:
                if action == "APPROVE":
                    await conn.execute(text("""
                        UPDATE case_stages
                        SET status = 'COMPLETED', completed_at = NOW()
                        WHERE id = :sid
                    """), {"sid": st.id})

                    await complete_stage_and_unlock_next(conn, ar.case_id, st.order_index)
                else:
                    await conn.execute(text("""
                        UPDATE case_stages
                        SET status = 'ACTIVE'
                        WHERE id = :sid
                    """), {"sid": st.id})

        elif ar.subject_type == "CHANGE_REQUEST":
            cr_res = await conn.execute(text("""
                SELECT id, proposal FROM workflow_change_requests WHERE id = :crid
            """), {"crid": ar.subject_id})
            cr = cr_res.fetchone()
            if cr:
                await conn.execute(text("""
                    UPDATE workflow_change_requests
                    SET status = :status
                    WHERE id = :crid
                """), {"status": new_appr_status, "crid": cr.id})

                if action == "APPROVE":
                    prop = cr.proposal if isinstance(cr.proposal, dict) else json.loads(cr.proposal or "{}")
                    new_task_id = uuid.uuid4()
                    await conn.execute(text("""
                        INSERT INTO case_tasks (
                            id, case_id, stage_id, title, status, assigned_to,
                            complexity_weight, requires_approval, is_ad_hoc, change_request_id, due_at, created_at
                        ) VALUES (
                            :tid, :cid, :sid, :title, 'TODO', :assigned_to,
                            :weight, TRUE, TRUE, :crid, :due_at, NOW()
                        )
                    """), {
                        "tid": new_task_id,
                        "cid": ar.case_id,
                        "sid": uuid.UUID(prop["stage_id"]),
                        "title": prop["title"],
                        "assigned_to": uuid.UUID(prop["assigned_to"]) if prop.get("assigned_to") else None,
                        "weight": prop.get("complexity_weight", 1),
                        "crid": cr.id,
                        "due_at": prop.get("due_at")
                    })

    record_approval_audit(current_user["id"], approval_id, action)

    return {"id": approval_id, "action": action, "status": new_appr_status}
