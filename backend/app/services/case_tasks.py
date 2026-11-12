import uuid
from typing import Optional, List, Dict, Any
from sqlalchemy import text
import psycopg

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.db.postgres import engine
from backend.app.services.audit import log_audit_event
from backend.app.services.cases import check_case_access
from backend.app.schemas.cases import TaskPatchRequest
from backend.app.services.floorplan import notify_task_status_changed, notify_approval_submitted

def record_task_audit(user_id: str, task_id: str, action: str):
    try:
        with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
            log_audit_event(
                conn=conn,
                actor_type="USER",
                action=action,
                entity_name="case_tasks",
                entity_id=task_id,
                actor_id=user_id,
            )
    except Exception:
        pass

async def complete_stage_and_unlock_next(conn, case_id: uuid.UUID, current_order_index: int):
    # Find next stage
    next_st_res = await conn.execute(text("""
        SELECT id, blocking_milestone_id
        FROM case_stages
        WHERE case_id = :cid AND order_index > :idx
        ORDER BY order_index ASC
        LIMIT 1
    """), {"cid": case_id, "idx": current_order_index})
    next_st = next_st_res.fetchone()
    if not next_st:
        return

    next_status = "ACTIVE"
    if next_st.blocking_milestone_id:
        m_res = await conn.execute(text("""
            SELECT status FROM billing_milestones WHERE id = :mid
        """), {"mid": next_st.blocking_milestone_id})
        m = m_res.fetchone()
        if not m or m.status != "PAID_CONFIRMED":
            next_status = "WAITING_PAYMENT"

    if next_status == "ACTIVE":
        await conn.execute(text("""
            UPDATE case_stages
            SET status = 'ACTIVE', started_at = NOW()
            WHERE id = :sid
        """), {"sid": next_st.id})
    else:
        await conn.execute(text("""
            UPDATE case_stages
            SET status = :status
            WHERE id = :sid
        """), {"status": next_status, "sid": next_st.id})

async def complete_task_side_effects(
    conn,
    task_id: uuid.UUID,
    case_id: uuid.UUID,
    stage_id: uuid.UUID,
    triggers_milestone_id: Optional[uuid.UUID],
    current_user_id: str
):
    # 1. Update task to COMPLETED
    await conn.execute(text("""
        UPDATE case_tasks
        SET status = 'COMPLETED', completed_at = NOW()
        WHERE id = :tid
    """), {"tid": task_id})

    # 2. Trigger billing milestone if any
    if triggers_milestone_id:
        await conn.execute(text("""
            UPDATE billing_milestones
            SET status = 'AWAITING_PAYMENT', requested_at = NOW()
            WHERE id = :mid AND status = 'PENDING'
        """), {"mid": triggers_milestone_id})

    # 3. Check all tasks in stage
    rem_res = await conn.execute(text("""
        SELECT COUNT(*)
        FROM case_tasks
        WHERE stage_id = :sid AND status != 'COMPLETED'
    """), {"sid": stage_id})
    rem_count = rem_res.scalar() or 0

    if rem_count == 0:
        # Fetch stage details
        st_res = await conn.execute(text("""
            SELECT id, order_index, requires_approval
            FROM case_stages
            WHERE id = :sid
        """), {"sid": stage_id})
        st = st_res.fetchone()
        if st:
            if st.requires_approval:
                await conn.execute(text("""
                    UPDATE case_stages
                    SET status = 'WAITING_APPROVAL'
                    WHERE id = :sid
                """), {"sid": stage_id})

                appr_id = uuid.uuid4()
                await conn.execute(text("""
                    INSERT INTO approval_requests (id, case_id, subject_type, subject_id, requested_by, status, requested_at)
                    VALUES (:aid, :cid, 'STAGE_GATE', :sid, :uid, 'PENDING', NOW())
                """), {"aid": appr_id, "cid": case_id, "sid": stage_id, "uid": uuid.UUID(current_user_id)})
                return appr_id
            else:
                await conn.execute(text("""
                    UPDATE case_stages
                    SET status = 'COMPLETED', completed_at = NOW()
                    WHERE id = :sid
                """), {"sid": stage_id})

                await complete_stage_and_unlock_next(conn, case_id, st.order_index)
    return None

async def get_case_tasks(
    case_id: str,
    current_user: Dict[str, Any],
    stage_id: Optional[str] = None,
    status: Optional[str] = None,
    assigned_to: Optional[str] = None
) -> List[Dict[str, Any]]:
    await check_case_access(current_user["id"], case_id, "professional")

    conditions = ["t.case_id = :cid"]
    params: Dict[str, Any] = {"cid": uuid.UUID(case_id)}

    if stage_id:
        conditions.append("t.stage_id = :sid")
        params["sid"] = uuid.UUID(stage_id)
    if status:
        conditions.append("t.status = :status")
        params["status"] = status
    if assigned_to:
        conditions.append("t.assigned_to = :assigned_to")
        params["assigned_to"] = uuid.UUID(assigned_to)

    where_clause = "WHERE " + " AND ".join(conditions)

    async with engine.connect() as conn:
        res = await conn.execute(text(f"""
            SELECT t.id, t.stage_id, t.title, t.status, t.assigned_to, t.due_at,
                   t.sla_business_days, t.complexity_weight, t.requires_approval, t.is_ad_hoc,
                   u.full_name AS assignee_name
            FROM case_tasks t
            LEFT JOIN users u ON t.assigned_to = u.id
            {where_clause}
            ORDER BY t.created_at ASC
        """), params)
        rows = res.fetchall()

        result = []
        for r in rows:
            # Dependencies
            dep_res = await conn.execute(text("""
                SELECT d.depends_on_task_id, pt.status
                FROM case_task_dependencies d
                JOIN case_tasks pt ON d.depends_on_task_id = pt.id
                WHERE d.case_task_id = :tid
            """), {"tid": r.id})
            deps = dep_res.fetchall()
            depends_on = [str(d.depends_on_task_id) for d in deps]
            blocked_by = [str(d.depends_on_task_id) for d in deps if d.status != "COMPLETED"]

            assignee = None
            if r.assigned_to:
                assignee = {"id": str(r.assigned_to), "full_name": r.assignee_name or ""}

            result.append({
                "id": str(r.id),
                "stage_id": str(r.stage_id),
                "title": r.title,
                "status": r.status,
                "assigned_to": assignee,
                "due_at": r.due_at.isoformat() if r.due_at else None,
                "sla_business_days": r.sla_business_days,
                "complexity_weight": r.complexity_weight,
                "requires_approval": bool(r.requires_approval),
                "is_ad_hoc": bool(r.is_ad_hoc),
                "depends_on": depends_on,
                "blocked_by": blocked_by
            })
        return result

async def patch_task(
    case_id: str,
    task_id: str,
    patch_data: TaskPatchRequest,
    current_user: Dict[str, Any]
) -> Dict[str, Any]:
    await check_case_access(current_user["id"], case_id, "professional")

    old_assigned_to = None
    new_assigned_to = None
    async with engine.begin() as conn:
        res = await conn.execute(text("""
            SELECT t.id, t.case_id, t.assigned_to, c.is_legacy
            FROM case_tasks t
            JOIN cases c ON t.case_id = c.id
            WHERE t.id = :tid AND t.case_id = :cid
            FOR UPDATE
        """), {"tid": uuid.UUID(task_id), "cid": uuid.UUID(case_id)})
        row = res.fetchone()
        if not row:
            raise AppException(404, "NOT_FOUND", "Không tìm thấy tác vụ")
        if row.is_legacy:
            raise AppException(409, "LEGACY_CASE_READ_ONLY", "Vụ việc lịch sử chỉ đọc")

        old_assigned_to = row.assigned_to
        if patch_data.assigned_to is not None:
            new_assigned_to = patch_data.assigned_to
            # Verify assigned_to is in case
            assign_res = await conn.execute(text("""
                SELECT 1 FROM case_assignments
                WHERE case_id = :cid AND user_id = :uid AND unassigned_at IS NULL
            """), {"cid": row.case_id, "uid": patch_data.assigned_to})
            if not assign_res.fetchone():
                raise AppException(422, "ASSIGNEE_NOT_IN_CASE", "Người được giao không thuộc phân công của vụ việc")

        updates = []
        params: Dict[str, Any] = {"tid": row.id}
        if patch_data.assigned_to is not None:
            updates.append("assigned_to = :assigned_to")
            params["assigned_to"] = patch_data.assigned_to
        if patch_data.due_at is not None:
            updates.append("due_at = :due_at")
            params["due_at"] = patch_data.due_at
        if patch_data.description is not None:
            updates.append("description = :description")
            params["description"] = patch_data.description

        if updates:
            sql = f"UPDATE case_tasks SET {', '.join(updates)} WHERE id = :tid"
            await conn.execute(text(sql), params)

    if new_assigned_to is not None:
        if old_assigned_to and str(old_assigned_to) != str(new_assigned_to):
            await notify_task_status_changed(old_assigned_to)
        await notify_task_status_changed(new_assigned_to)

    return {"id": task_id, "message": "Cập nhật tác vụ thành công"}

async def update_task_status(
    case_id: str,
    task_id: str,
    new_status: str,
    note: Optional[str],
    current_user: Dict[str, Any]
) -> Dict[str, Any]:
    await check_case_access(current_user["id"], case_id, "professional")

    created_appr_id = None
    stage_appr_id = None
    async with engine.begin() as conn:
        res = await conn.execute(text("""
            SELECT t.id, t.case_id, t.stage_id, t.status, t.requires_approval, t.triggers_milestone_id,
                   t.assigned_to,
                   s.status AS stage_status, s.requires_approval AS stage_requires_approval, s.order_index AS stage_order_index,
                   c.status AS case_status, c.is_legacy AS case_is_legacy
            FROM case_tasks t
            JOIN case_stages s ON t.stage_id = s.id
            JOIN cases c ON t.case_id = c.id
            WHERE t.id = :tid AND t.case_id = :cid
            FOR UPDATE
        """), {"tid": uuid.UUID(task_id), "cid": uuid.UUID(case_id)})
        t = res.fetchone()
        if not t:
            raise AppException(404, "NOT_FOUND", "Không tìm thấy tác vụ")

        if t.case_is_legacy:
            raise AppException(409, "LEGACY_CASE_READ_ONLY", "Vụ việc lịch sử chỉ đọc, không thể đổi trạng thái tác vụ")

        if t.case_status == "PAUSED":
            raise AppException(409, "CASE_PAUSED", "Vụ việc đang tạm dừng, không thể đổi trạng thái tác vụ")

        if t.stage_status != "ACTIVE":
            raise AppException(409, "STAGE_LOCKED", f"Giai đoạn đang ở trạng thái {t.stage_status}, không thể đổi trạng thái tác vụ")

        current_status = t.status

        if current_status == "TODO" and new_status == "IN_PROGRESS":
            # Check dependencies
            dep_res = await conn.execute(text("""
                SELECT d.depends_on_task_id, pt.status
                FROM case_task_dependencies d
                JOIN case_tasks pt ON d.depends_on_task_id = pt.id
                WHERE d.case_task_id = :tid
            """), {"tid": t.id})
            dep_rows = dep_res.fetchall()
            blocked_by = [str(r.depends_on_task_id) for r in dep_rows if r.status != "COMPLETED"]
            if blocked_by:
                raise AppException(
                    422,
                    "PREREQUISITE_TASK_NOT_COMPLETED",
                    f"Tác vụ bị chặn bởi {len(blocked_by)} tác vụ tiên quyết chưa hoàn thành",
                    details={"blocked_by": blocked_by, "prerequisite_task_ids": blocked_by}
                )

            await conn.execute(text("""
                UPDATE case_tasks
                SET status = 'IN_PROGRESS', started_at = NOW()
                WHERE id = :tid
            """), {"tid": t.id})

        elif current_status == "IN_PROGRESS" and new_status == "WAITING_APPROVAL":
            await conn.execute(text("""
                UPDATE case_tasks
                SET status = 'WAITING_APPROVAL'
                WHERE id = :tid
            """), {"tid": t.id})

            appr_id = uuid.uuid4()
            await conn.execute(text("""
                INSERT INTO approval_requests (id, case_id, subject_type, subject_id, requested_by, status, requested_at)
                VALUES (:aid, :cid, 'TASK', :tid, :uid, 'PENDING', NOW())
            """), {"aid": appr_id, "cid": t.case_id, "tid": t.id, "uid": uuid.UUID(current_user["id"])})
            created_appr_id = appr_id

        elif current_status == "IN_PROGRESS" and new_status == "COMPLETED":
            if t.requires_approval:
                raise AppException(409, "INVALID_STATE_TRANSITION", "Tác vụ yêu cầu phê duyệt không thể chuyển thẳng hoàn thành")

            stage_appr_id = await complete_task_side_effects(
                conn=conn,
                task_id=t.id,
                case_id=t.case_id,
                stage_id=t.stage_id,
                triggers_milestone_id=t.triggers_milestone_id,
                current_user_id=current_user["id"]
            )
        else:
            raise AppException(409, "INVALID_STATE_TRANSITION", f"Chuyển trạng thái task không hợp lệ: {current_status} -> {new_status}")

    record_task_audit(current_user["id"], task_id, "TASK_STATUS_CHANGED")

    if t and t.assigned_to:
        await notify_task_status_changed(t.assigned_to)

    if created_appr_id:
        await notify_approval_submitted(created_appr_id)

    if stage_appr_id:
        await notify_approval_submitted(stage_appr_id)

    return {"id": task_id, "status": new_status}

async def get_task_comments(case_id: str, task_id: str, current_user: Dict[str, Any]) -> List[Dict[str, Any]]:
    await check_case_access(current_user["id"], case_id, "professional")

    async with engine.connect() as conn:
        res = await conn.execute(text("""
            SELECT c.id, c.task_id, c.author_id, c.body, c.created_at, u.full_name
            FROM case_task_comments c
            LEFT JOIN users u ON c.author_id = u.id
            WHERE c.task_id = :tid
            ORDER BY c.created_at DESC
        """), {"tid": uuid.UUID(task_id)})
        return [
            {
                "id": str(r.id),
                "task_id": str(r.task_id),
                "author_id": str(r.author_id) if r.author_id else None,
                "author_name": r.full_name,
                "body": r.body,
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in res.fetchall()
        ]

async def create_task_comment(case_id: str, task_id: str, body: str, current_user: Dict[str, Any]) -> Dict[str, Any]:
    await check_case_access(current_user["id"], case_id, "professional")

    if not body or not body.strip():
        raise AppException(422, "VALIDATION_ERROR", "Nội dung bình luận không được để trống")
    if len(body) > 5000:
        raise AppException(422, "VALIDATION_ERROR", "Nội dung bình luận tối đa 5000 ký tự")

    comment_id = uuid.uuid4()
    async with engine.begin() as conn:
        await conn.execute(text("""
            INSERT INTO case_task_comments (id, task_id, author_id, body, created_at)
            VALUES (:cid, :tid, :uid, :body, NOW())
        """), {"cid": comment_id, "tid": uuid.UUID(task_id), "uid": uuid.UUID(current_user["id"]), "body": body})

    return {
        "id": str(comment_id),
        "task_id": task_id,
        "author_id": current_user["id"],
        "body": body
    }
