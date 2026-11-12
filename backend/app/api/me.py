import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends
from sqlalchemy import text

from backend.app.core.security import get_current_user
from backend.app.db.postgres import engine
from backend.app.services.cases import get_accessible_case_ids

router = APIRouter(prefix="/me", tags=["Me"])


def _list_meta(total: int, summary: Dict[str, int]) -> Dict[str, Any]:
    """meta theo docs/07 §1.2; /me/tasks trả trọn danh sách trong một trang, summary nằm trong meta."""
    return {"page": 1, "limit": total, "total_records": total, "total_pages": 1 if total else 0, "summary": summary}

@router.get("/tasks")
async def get_my_tasks(
    status: Optional[str] = None,
    due: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    accessible_ids = await get_accessible_case_ids(current_user)
    if accessible_ids is not None and len(accessible_ids) == 0:
        return {
            "success": True,
            "data": [],
            "meta": _list_meta(0, {"todo": 0, "in_progress": 0, "waiting_approval": 0, "overdue": 0}),
        }

    conditions = ["t.assigned_to = :uid", "t.status != 'COMPLETED'"]
    params: Dict[str, Any] = {"uid": uuid.UUID(current_user["id"])}

    if accessible_ids is not None:
        conditions.append("t.case_id = ANY(:accessible_ids)")
        params["accessible_ids"] = [uuid.UUID(x) for x in accessible_ids]

    if status:
        conditions.append("t.status = :status")
        params["status"] = status

    where_clause = "WHERE " + " AND ".join(conditions)

    tz_vn = timezone(timedelta(hours=7))
    now_utc = datetime.now(timezone.utc)
    now_vn = datetime.now(tz_vn)
    today_start_vn = now_vn.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end_vn = today_start_vn + timedelta(days=1)
    # End of current week (Sunday end)
    days_until_sunday = 6 - today_start_vn.weekday()
    week_end_vn = today_start_vn + timedelta(days=days_until_sunday + 1)

    today_start_utc = today_start_vn.astimezone(timezone.utc)
    today_end_utc = today_end_vn.astimezone(timezone.utc)
    week_end_utc = week_end_vn.astimezone(timezone.utc)

    async with engine.connect() as conn:
        res = await conn.execute(text(f"""
            SELECT t.id, t.title, t.status, t.due_at, t.case_id, t.stage_id,
                   c.case_code, c.title AS case_title,
                   s.name AS stage_name, s.status AS stage_status
            FROM case_tasks t
            JOIN cases c ON t.case_id = c.id
            JOIN case_stages s ON t.stage_id = s.id
            {where_clause}
            ORDER BY t.due_at ASC NULLS LAST, t.created_at DESC
        """), params)
        rows = res.fetchall()

        all_my_tasks = []
        summary = {"todo": 0, "in_progress": 0, "waiting_approval": 0, "overdue": 0}

        for r in rows:
            due_at = r.due_at
            if due_at and due_at.tzinfo is None:
                due_at = due_at.replace(tzinfo=timezone.utc)

            is_overdue = bool(due_at and due_at < now_utc)

            # Summary counts
            st_lower = r.status.lower()
            if st_lower in summary:
                summary[st_lower] += 1
            if is_overdue:
                summary["overdue"] += 1

            # Count blocked by
            dep_res = await conn.execute(text("""
                SELECT COUNT(*) FROM case_task_dependencies d
                JOIN case_tasks pt ON d.depends_on_task_id = pt.id
                WHERE d.case_task_id = :tid AND pt.status != 'COMPLETED'
            """), {"tid": r.id})
            blocked_by_count = dep_res.scalar() or 0

            item = {
                "id": str(r.id),
                "title": r.title,
                "status": r.status,
                "due_at": due_at.isoformat() if due_at else None,
                "is_overdue": is_overdue,
                "case": {
                    "id": str(r.case_id),
                    "case_code": r.case_code,
                    "title": r.case_title
                },
                "stage": {
                    "name": r.stage_name,
                    "status": r.stage_status
                },
                "blocked_by_count": blocked_by_count,
                "_due_dt": due_at
            }
            all_my_tasks.append(item)

        # Filter by ?due= if specified
        filtered_tasks = []
        for t in all_my_tasks:
            due_dt = t.pop("_due_dt")
            if due == "overdue":
                if t["is_overdue"]:
                    filtered_tasks.append(t)
            elif due == "today":
                if due_dt and today_start_utc <= due_dt < today_end_utc:
                    filtered_tasks.append(t)
            elif due == "week":
                if due_dt and today_start_utc <= due_dt < week_end_utc:
                    filtered_tasks.append(t)
            else:
                filtered_tasks.append(t)

        return {
            "success": True,
            "data": filtered_tasks,
            "meta": _list_meta(len(filtered_tasks), summary),
        }
