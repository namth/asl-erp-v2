from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any, Dict, Optional, Tuple

import psycopg
from psycopg.rows import dict_row

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.db.redis import get_redis
from backend.app.services.notifications import format_iso_utc

logger = logging.getLogger(__name__)


def resolve_floorplan_scope(
    cur: psycopg.Cursor,
    current_user: Dict[str, Any],
    department_id_param: Optional[str],
) -> Tuple[str, str]:
    """Kiểm tra vai trò và phân quyền phạm vi truy cập Văn phòng số.

    - Không phải MANAGER -> 403 FORBIDDEN_ROLE.
    - department_id sai định dạng -> 422 VALIDATION_ERROR.
    - department_id không tồn tại -> 404 NOT_FOUND.
    - MANAGER có is_executive -> truy cập được mọi phòng; bỏ trống -> phòng đầu tiên
      mình phụ trách (department_leaders), nếu không có thì phòng đầu tiên theo tên.
    - MANAGER thường -> chỉ phòng trong department_leaders; bỏ trống -> phòng đầu tiên
      theo tên; không phụ trách phòng nào hoặc chọn phòng khác -> 403 NEED_TO_KNOW_DENIED.
    """
    system_role = current_user.get("system_role")
    if system_role != "MANAGER":
        raise AppException(403, "FORBIDDEN_ROLE", "Chỉ Quản lý (MANAGER) mới có quyền truy cập Văn phòng số")

    is_executive = bool(current_user.get("is_executive", False))
    user_id = str(current_user["id"])

    parsed_dept_id: Optional[str] = None
    if department_id_param is not None and department_id_param.strip() != "":
        try:
            parsed_dept_id = str(uuid.UUID(department_id_param.strip()))
        except Exception:
            raise AppException(422, "VALIDATION_ERROR", "Tham số department_id không phải là UUID hợp lệ")

    dept_row = None
    if parsed_dept_id is not None:
        cur.execute("SELECT id, name FROM departments WHERE id = %s", (parsed_dept_id,))
        dept_row = cur.fetchone()
        if not dept_row:
            raise AppException(404, "NOT_FOUND", "Phòng ban không tồn tại")

    if is_executive:
        if parsed_dept_id is not None and dept_row is not None:
            return str(dept_row["id"]), str(dept_row["name"])
        else:
            cur.execute(
                """SELECT d.id, d.name
                   FROM department_leaders dl
                   JOIN departments d ON dl.department_id = d.id
                   WHERE dl.user_id = %s
                   ORDER BY d.name ASC, d.id ASC
                   LIMIT 1""",
                (user_id,),
            )
            led = cur.fetchone()
            if led:
                return str(led["id"]), str(led["name"])

            cur.execute("SELECT id, name FROM departments ORDER BY name ASC, id ASC LIMIT 1")
            first_dept = cur.fetchone()
            if not first_dept:
                raise AppException(404, "NOT_FOUND", "Không tìm thấy phòng ban nào trong hệ thống")
            return str(first_dept["id"]), str(first_dept["name"])
    else:
        cur.execute(
            """SELECT d.id, d.name
               FROM department_leaders dl
               JOIN departments d ON dl.department_id = d.id
               WHERE dl.user_id = %s
               ORDER BY d.name ASC, d.id ASC""",
            (user_id,),
        )
        led_depts = cur.fetchall()
        if not led_depts:
            raise AppException(403, "NEED_TO_KNOW_DENIED", "Bạn không phụ trách phòng ban nào")

        led_map = {str(d["id"]): str(d["name"]) for d in led_depts}
        if parsed_dept_id is not None:
            if parsed_dept_id not in led_map:
                raise AppException(403, "NEED_TO_KNOW_DENIED", "Bạn không có quyền truy cập phòng ban này")
            return parsed_dept_id, led_map[parsed_dept_id]
        else:
            return str(led_depts[0]["id"]), str(led_depts[0]["name"])


def resolve_floorplan_dept_id(current_user: Dict[str, Any], department_id_param: Optional[str]) -> str:
    with psycopg.connect(settings.DATABASE_SYNC_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            dept_id, _ = resolve_floorplan_scope(cur, current_user, department_id_param)
            return dept_id


def get_floorplan_data_sync(current_user: Dict[str, Any], department_id_param: Optional[str]) -> Dict[str, Any]:
    """Truy vấn dữ liệu sơ đồ văn phòng số và hàng đợi duyệt cho phòng ban."""
    with psycopg.connect(settings.DATABASE_SYNC_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            dept_id, dept_name = resolve_floorplan_scope(cur, current_user, department_id_param)

            # 1. Trưởng phòng: người đầu tiên (theo tên) trong department_leaders của phòng
            cur.execute(
                """SELECT u.id, u.full_name, u.title
                   FROM department_leaders dl
                   JOIN users u ON dl.user_id = u.id
                   WHERE dl.department_id = %s
                   ORDER BY u.full_name ASC, u.id ASC
                   LIMIT 1""",
                (dept_id,),
            )
            leader_row = cur.fetchone()
            if leader_row:
                leader = {
                    "id": str(leader_row["id"]),
                    "name": leader_row["full_name"],
                    "title": leader_row["title"] or "",
                    "avatar_url": None,
                }
            else:
                leader = None

            # 2. Nhân sự (workstations): users đang hoạt động trong phòng, TRỪ trưởng phòng
            cur.execute(
                """SELECT
                       u.id,
                       u.full_name,
                       u.title,
                       COALESCE(tc.in_progress_count, 0) AS in_progress_count,
                       COALESCE(tc.todo_count, 0) AS todo_count
                   FROM users u
                   LEFT JOIN (
                       SELECT
                           assigned_to,
                           COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') AS in_progress_count,
                           COUNT(*) FILTER (WHERE status = 'TODO') AS todo_count
                       FROM case_tasks
                       GROUP BY assigned_to
                   ) tc ON tc.assigned_to = u.id
                   WHERE u.department_id = %s
                     AND u.is_active = TRUE
                     AND u.id NOT IN (
                         SELECT user_id FROM department_leaders WHERE department_id = %s
                     )
                   ORDER BY u.full_name ASC, u.id ASC""",
                (dept_id, dept_id),
            )
            staff_rows = cur.fetchall()

            # 3. Hàng đợi duyệt (approval_queue): yêu cầu PENDING thuộc vụ việc của phòng và nhân sự phòng
            cur.execute(
                """SELECT
                       ar.id,
                       ar.case_id,
                       ar.subject_type,
                       ar.subject_id,
                       ar.requested_by,
                       ar.requested_at,
                       c.case_code,
                       u.full_name AS requester_name,
                       u.title AS requester_title,
                       t.title AS task_title,
                       s.name AS stage_title,
                       cr.reason AS cr_reason
                   FROM approval_requests ar
                   JOIN cases c ON ar.case_id = c.id
                   JOIN users u ON ar.requested_by = u.id
                   LEFT JOIN case_tasks t ON ar.subject_type = 'TASK' AND ar.subject_id = t.id
                   LEFT JOIN case_stages s ON ar.subject_type = 'STAGE_GATE' AND ar.subject_id = s.id
                   LEFT JOIN workflow_change_requests cr ON ar.subject_type = 'CHANGE_REQUEST' AND ar.subject_id = cr.id
                   WHERE ar.status = 'PENDING'
                     AND c.department_id = %s
                     AND u.department_id = %s
                     AND u.is_active = TRUE
                     AND u.id NOT IN (
                         SELECT user_id FROM department_leaders WHERE department_id = %s
                     )
                   ORDER BY ar.requested_at ASC, ar.id ASC""",
                (dept_id, dept_id, dept_id),
            )
            ar_rows = cur.fetchall()

            queue_by_user: Dict[str, Dict[str, Any]] = {}
            for r in ar_rows:
                uid = str(r["requested_by"])
                if uid not in queue_by_user:
                    queue_by_user[uid] = {
                        "user": {
                            "id": uid,
                            "name": r["requester_name"],
                            "title": r["requester_title"] or "",
                            "avatar_url": None,
                        },
                        "requests": [],
                    }

                if r["subject_type"] == "TASK":
                    title = r["task_title"] or ""
                elif r["subject_type"] == "STAGE_GATE":
                    title = r["stage_title"] or ""
                elif r["subject_type"] == "CHANGE_REQUEST":
                    title = r["cr_reason"] or ""
                else:
                    title = ""

                queue_by_user[uid]["requests"].append(
                    {
                        "id": str(r["id"]),
                        "subject_type": r["subject_type"],
                        "case_code": r["case_code"],
                        "title": title,
                        "requested_at": format_iso_utc(r["requested_at"]),
                    }
                )

            approval_queue = [
                {
                    "user": item["user"],
                    "pending_count": len(item["requests"]),
                    "requests": item["requests"],
                }
                for item in queue_by_user.values()
            ]

            workstations = []
            for idx, u in enumerate(staff_rows, start=1):
                uid = str(u["id"])
                in_prog = int(u["in_progress_count"])
                todo = int(u["todo_count"])
                is_idle = in_prog == 0
                pending_count = len(queue_by_user.get(uid, {}).get("requests", []))
                is_in_queue = pending_count > 0
                workstations.append(
                    {
                        "desk_index": idx,
                        "user": {
                            "id": uid,
                            "name": u["full_name"],
                            "title": u["title"] or "",
                            "avatar_url": None,
                        },
                        "in_progress_count": in_prog,
                        "todo_count": todo,
                        "is_idle": is_idle,
                        "is_in_queue": is_in_queue,
                    }
                )

            stats = {
                "total_staff": len(workstations),
                "working_count": sum(1 for w in workstations if not w["is_idle"]),
                "resting_count": sum(1 for w in workstations if w["is_idle"]),
                "pending_approvals_count": sum(item["pending_count"] for item in approval_queue),
            }

            return {
                "success": True,
                "data": {
                    "department": {
                        "id": dept_id,
                        "name": dept_name,
                        "leader": leader,
                    },
                    "stats": stats,
                    "approval_queue": approval_queue,
                    "workstations": workstations,
                },
            }


async def publish_floorplan_event(
    department_id: Optional[str | uuid.UUID],
    event_type: str,
    payload: Dict[str, Any],
) -> None:
    """Phát sự kiện lên kênh Redis Pub/Sub floorplan:{department_id}.

    Nuốt lỗi Redis và ghi log — không được làm gián đoạn luồng nghiệp vụ.
    """
    if not department_id:
        return
    dept_id_str = str(department_id)
    channel = f"floorplan:{dept_id_str}"
    message = json.dumps({"type": event_type, "payload": payload}, ensure_ascii=False)
    try:
        r = get_redis()
        await r.publish(channel, message)
    except Exception as e:
        logger.warning("Failed to publish floorplan event %s on channel %s: %s", event_type, channel, e)


def _get_task_status_changed_event(user_id: str) -> Optional[Tuple[str, Dict[str, Any]]]:
    with psycopg.connect(settings.DATABASE_SYNC_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT department_id FROM users WHERE id = %s", (user_id,))
            u_row = cur.fetchone()
            if not u_row or not u_row["department_id"]:
                return None
            dept_id = str(u_row["department_id"])

            cur.execute(
                """SELECT
                       COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') AS in_progress_count,
                       COUNT(*) FILTER (WHERE status = 'TODO') AS todo_count
                   FROM case_tasks
                   WHERE assigned_to = %s""",
                (user_id,),
            )
            counts = cur.fetchone() or {"in_progress_count": 0, "todo_count": 0}
            payload = {
                "user_id": user_id,
                "in_progress_count": int(counts["in_progress_count"] or 0),
                "todo_count": int(counts["todo_count"] or 0),
            }
            return dept_id, payload


async def notify_task_status_changed(user_id: Optional[str | uuid.UUID]) -> None:
    if not user_id:
        return
    uid_str = str(user_id)
    try:
        res = await asyncio.to_thread(_get_task_status_changed_event, uid_str)
        if res:
            dept_id, payload = res
            await publish_floorplan_event(dept_id, "EVENT_TASK_STATUS_UPDATED", payload)
    except Exception as e:
        logger.warning("Error in notify_task_status_changed for user %s: %s", uid_str, e)


def _get_approval_submitted_event(approval_id: str) -> Optional[Tuple[str, Dict[str, Any]]]:
    with psycopg.connect(settings.DATABASE_SYNC_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT
                       ar.id,
                       ar.subject_type,
                       ar.subject_id,
                       ar.requested_by,
                       ar.requested_at,
                       c.case_code,
                       u.department_id,
                       t.title AS task_title,
                       s.name AS stage_title,
                       cr.reason AS cr_reason
                   FROM approval_requests ar
                   JOIN cases c ON ar.case_id = c.id
                   JOIN users u ON ar.requested_by = u.id
                   LEFT JOIN case_tasks t ON ar.subject_type = 'TASK' AND ar.subject_id = t.id
                   LEFT JOIN case_stages s ON ar.subject_type = 'STAGE_GATE' AND ar.subject_id = s.id
                   LEFT JOIN workflow_change_requests cr ON ar.subject_type = 'CHANGE_REQUEST' AND ar.subject_id = cr.id
                   WHERE ar.id = %s""",
                (approval_id,),
            )
            row = cur.fetchone()
            if not row or not row["department_id"]:
                return None
            dept_id = str(row["department_id"])

            if row["subject_type"] == "TASK":
                title = row["task_title"] or ""
            elif row["subject_type"] == "STAGE_GATE":
                title = row["stage_title"] or ""
            elif row["subject_type"] == "CHANGE_REQUEST":
                title = row["cr_reason"] or ""
            else:
                title = ""

            req_item = {
                "id": str(row["id"]),
                "subject_type": row["subject_type"],
                "case_code": row["case_code"],
                "title": title,
                "requested_at": format_iso_utc(row["requested_at"]),
            }
            payload = {
                "user_id": str(row["requested_by"]),
                "request": req_item,
            }
            return dept_id, payload


async def notify_approval_submitted(approval_id: Optional[str | uuid.UUID]) -> None:
    if not approval_id:
        return
    aid_str = str(approval_id)
    try:
        res = await asyncio.to_thread(_get_approval_submitted_event, aid_str)
        if res:
            dept_id, payload = res
            await publish_floorplan_event(dept_id, "EVENT_APPROVAL_SUBMITTED", payload)
    except Exception as e:
        logger.warning("Error in notify_approval_submitted for approval %s: %s", aid_str, e)


def _get_approval_decided_event(approval_id: str, status: Optional[str]) -> Optional[Tuple[str, Dict[str, Any]]]:
    with psycopg.connect(settings.DATABASE_SYNC_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT ar.id, ar.requested_by, ar.status, u.department_id
                   FROM approval_requests ar
                   JOIN users u ON ar.requested_by = u.id
                   WHERE ar.id = %s""",
                (approval_id,),
            )
            row = cur.fetchone()
            if not row or not row["department_id"]:
                return None
            dept_id = str(row["department_id"])
            decided_status = status or row["status"]
            payload = {
                "user_id": str(row["requested_by"]),
                "request_id": str(row["id"]),
                "status": decided_status,
            }
            return dept_id, payload


async def notify_approval_decided(approval_id: Optional[str | uuid.UUID], status: Optional[str] = None) -> None:
    if not approval_id:
        return
    aid_str = str(approval_id)
    try:
        res = await asyncio.to_thread(_get_approval_decided_event, aid_str, status)
        if res:
            dept_id, payload = res
            await publish_floorplan_event(dept_id, "EVENT_APPROVAL_DECIDED", payload)
    except Exception as e:
        logger.warning("Error in notify_approval_decided for approval %s: %s", aid_str, e)
