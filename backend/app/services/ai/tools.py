from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Tuple

from sqlalchemy import text

from backend.app.db.postgres import engine
from backend.app.guards.need_to_know import verify_need_to_know
from backend.app.services.ai.pii_redactor import PiiRedactor


AI_TOOLS_SCHEMA: List[Dict[str, Any]] = [
    {
        "name": "get_urgent_tasks",
        "description": "Lấy danh sách các tác vụ sắp tới hạn hoặc quá hạn của người dùng đang đăng nhập",
        "parameters": {
            "type": "object",
            "properties": {
                "days_ahead": {
                    "type": "integer",
                    "description": "Số ngày tới để quét deadline, mặc định là 3",
                }
            },
        },
    },
    {
        "name": "lookup_case_status",
        "description": "Tra cứu tiến độ, giai đoạn hiện tại và nhân sự phụ trách của một vụ việc theo mã hoặc tên",
        "parameters": {
            "type": "object",
            "properties": {
                "keyword": {
                    "type": "string",
                    "description": "Mã vụ việc (VD: ASL-2026-TM-0012) hoặc mã giả khách hàng (VD: KH-001)",
                }
            },
            "required": ["keyword"],
        },
    },
]


def _like_escape(value: str) -> str:
    """Thoát ký tự đại diện của ILIKE để từ khoá người dùng không thành mẫu khớp mọi vụ."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def execute_tool(
    user: Dict[str, Any],
    tool_name: str,
    arguments: Dict[str, Any],
    redactor: PiiRedactor,
    discovered_cases: List[Tuple[str, str]],
) -> Any:
    """Executes an AI tool within the caller's authorized scope."""
    try:
        if tool_name == "get_urgent_tasks":
            return await _get_urgent_tasks(user, arguments, discovered_cases)
        elif tool_name == "lookup_case_status":
            return await _lookup_case_status(user, arguments, redactor, discovered_cases)
        else:
            return {"error": f"Công cụ lạ: {tool_name}"}
    except Exception as e:
        return {"error": f"Lỗi khi thực thi công cụ {tool_name}: {e}"}


async def _get_urgent_tasks(
    user: Dict[str, Any],
    arguments: Dict[str, Any],
    discovered_cases: List[Tuple[str, str]],
) -> Dict[str, Any]:
    raw_days = arguments.get("days_ahead", 3)
    try:
        days_ahead = int(raw_days)
    except (ValueError, TypeError):
        days_ahead = 3

    now_utc = datetime.now(timezone.utc)
    cutoff = now_utc + timedelta(days=days_ahead)
    user_id = uuid.UUID(str(user["id"]))

    async with engine.connect() as conn:
        res = await conn.execute(
            text("""
                SELECT t.id, t.title, t.status, t.due_at, t.case_id,
                       c.case_code, c.title AS case_title
                FROM case_tasks t
                JOIN cases c ON t.case_id = c.id
                WHERE t.assigned_to = :uid
                  AND t.status != 'COMPLETED'
                  AND t.due_at IS NOT NULL
                  AND t.due_at <= :cutoff
                ORDER BY t.due_at ASC
            """),
            {"uid": user_id, "cutoff": cutoff},
        )
        rows = res.fetchall()

    tasks_data = []
    for r in rows:
        due_at = r.due_at
        if due_at and due_at.tzinfo is None:
            due_at = due_at.replace(tzinfo=timezone.utc)

        is_overdue = bool(due_at and due_at < now_utc)
        case_id_str = str(r.case_id)
        case_code_str = str(r.case_code)

        discovered_cases.append((case_id_str, case_code_str))
        tasks_data.append({
            "task_id": str(r.id),
            "case_id": case_id_str,
            "case_code": case_code_str,
            "title": r.title,
            "status": r.status,
            "due_at": due_at.isoformat() if due_at else None,
            "is_overdue": is_overdue,
        })

    return {"tasks": tasks_data}


async def _lookup_case_status(
    user: Dict[str, Any],
    arguments: Dict[str, Any],
    redactor: PiiRedactor,
    discovered_cases: List[Tuple[str, str]],
) -> Dict[str, Any]:
    keyword = str(arguments.get("keyword", "")).strip()
    if not keyword:
        return {"error": "Thiếu tham số keyword"}

    user_id_str = str(user["id"])
    real_client_name = redactor.get_real_name(keyword)

    async with engine.connect() as conn:
        if real_client_name:
            res = await conn.execute(
                text("""
                    SELECT c.id, c.case_code, c.title, c.status, c.client_id,
                           cl.name AS client_name, cl.representative_name,
                           cl.tax_code, cl.phone, cl.email, cl.address
                    FROM cases c
                    JOIN clients cl ON c.client_id = cl.id
                    WHERE cl.name ILIKE :cname
                    ORDER BY c.created_at DESC
                    LIMIT 20
                """),
                {"cname": f"%{_like_escape(real_client_name)}%"},
            )
        else:
            res = await conn.execute(
                text("""
                    SELECT c.id, c.case_code, c.title, c.status, c.client_id,
                           cl.name AS client_name, cl.representative_name,
                           cl.tax_code, cl.phone, cl.email, cl.address
                    FROM cases c
                    LEFT JOIN clients cl ON c.client_id = cl.id
                    WHERE c.case_code ILIKE :kw
                       OR cl.name ILIKE :kw
                       OR c.title ILIKE :kw
                    ORDER BY c.created_at DESC
                    LIMIT 20
                """),
                {"kw": f"%{_like_escape(keyword)}%"},
            )
        matched_cases = res.fetchall()

    results = []
    for c in matched_cases:
        case_id_str = str(c.id)
        # Verify Need-to-Know for each case
        try:
            await verify_need_to_know(user_id=user_id_str, case_id=case_id_str, scope="progress")
        except Exception:
            continue

        # Register client PII into redactor
        if c.client_name:
            redactor.register_name(c.client_name)
        if c.representative_name:
            redactor.register_name(c.representative_name)
        if c.tax_code:
            redactor.register_hidden(c.tax_code)
        if c.phone:
            redactor.register_hidden(c.phone)
        if c.email:
            redactor.register_hidden(c.email)
        if c.address:
            redactor.register_hidden(c.address)

        discovered_cases.append((case_id_str, str(c.case_code)))

        async with engine.connect() as conn:
            # Query active or lowest order uncompleted stage
            st_res = await conn.execute(
                text("""
                    SELECT name, status, order_index
                    FROM case_stages
                    WHERE case_id = :cid AND status != 'COMPLETED'
                    ORDER BY order_index ASC
                    LIMIT 1
                """),
                {"cid": c.id},
            )
            st_row = st_res.fetchone()
            current_stage_name = st_row.name if st_row else "Không có giai đoạn đang chạy"

            # Query assigned personnel
            assign_res = await conn.execute(
                text("""
                    SELECT u.full_name, ca.role_in_case
                    FROM case_assignments ca
                    JOIN users u ON ca.user_id = u.id
                    WHERE ca.case_id = :cid AND ca.unassigned_at IS NULL
                    ORDER BY ca.assigned_at ASC
                """),
                {"cid": c.id},
            )
            assignees = [f"{r.full_name} ({r.role_in_case})" for r in assign_res.fetchall()]

        results.append({
            "case_code": c.case_code,
            "case_id": case_id_str,
            "title": c.title,
            "client_name": c.client_name or "",
            "status": c.status,
            "current_stage": current_stage_name,
            "assigned_personnel": assignees,
        })

    return {"cases": results}
