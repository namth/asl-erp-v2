from __future__ import annotations

import datetime as dt
import math
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

import psycopg
from psycopg.rows import dict_row

from backend.app.core.config import settings
from backend.app.services.payments import format_money

ROLES = ("ORIGINATOR", "SUPERVISOR", "CASE_MANAGER", "EXECUTOR", "ASSISTANT")


def build_commission_ledger_where(
    cur: Any,
    current_user: Dict[str, Any],
    case_id: Optional[str] = None,
    user_id: Optional[str] = None,
    role_type: Optional[str] = None,
    from_date: Optional[dt.date] = None,
    to_date: Optional[dt.date] = None,
) -> Tuple[str, Dict[str, Any], bool]:
    system_role = current_user.get("system_role")
    is_executive = bool(current_user.get("is_executive", False))
    me = str(current_user["id"])

    where_clauses = ["1=1"]
    params: Dict[str, Any] = {}

    if system_role == "ATTORNEY":
        where_clauses.append("ct.user_id = %(me)s")
        params["me"] = me
    elif system_role == "MANAGER" and not is_executive:
        cur.execute(
            "SELECT department_id FROM department_leaders WHERE user_id = %s",
            (me,)
        )
        dept_rows = cur.fetchall()
        if not dept_rows:
            return "1=0", params, True
        led_dept_ids = [str(r["department_id"]) for r in dept_rows]
        where_clauses.append("u.department_id = ANY(%(led_dept_ids)s)")
        params["led_dept_ids"] = led_dept_ids
        if user_id:
            where_clauses.append("ct.user_id = %(user_id)s")
            params["user_id"] = user_id
    else:
        # ACCOUNTANT hoặc MANAGER có is_executive -> toàn hãng
        if user_id:
            where_clauses.append("ct.user_id = %(user_id)s")
            params["user_id"] = user_id

    # 2. Bộ lọc dữ liệu
    if case_id:
        where_clauses.append("ct.case_id = %(case_id)s")
        params["case_id"] = case_id

    if role_type:
        where_clauses.append("ct.role_type = %(role_type)s")
        params["role_type"] = role_type

    if from_date is not None:
        where_clauses.append("(ct.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= %(from_date)s")
        params["from_date"] = from_date

    if to_date is not None:
        where_clauses.append("(ct.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= %(to_date)s")
        params["to_date"] = to_date

    where_sql = " AND ".join(where_clauses)
    return where_sql, params, False


def get_commission_ledger_sync(
    current_user: Dict[str, Any],
    case_id: Optional[str],
    user_id: Optional[str],
    role_type: Optional[str],
    from_date: Optional[dt.date],
    to_date: Optional[dt.date],
    page: int,
    limit: int,
    *args: Any,
    **kwargs: Any,  # DEC-09: payout_status bị bỏ qua trong logic
) -> Dict[str, Any]:
    with psycopg.connect(settings.DATABASE_SYNC_URL) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            where_sql, params, is_empty = build_commission_ledger_where(
                cur=cur,
                current_user=current_user,
                case_id=case_id,
                user_id=user_id,
                role_type=role_type,
                from_date=from_date,
                to_date=to_date,
            )
            if is_empty:
                # Quản lý chưa phụ trách phòng ban nào -> kết quả rỗng
                return {
                    "success": True,
                    "data": [],
                    "meta": {
                        "page": page,
                        "limit": limit,
                        "total_records": 0,
                        "total_pages": 0,
                        "summary": {
                            "total_amount": "0",
                            "by_role": {r: "0" for r in ROLES},
                        },
                    },
                }

            # 3. Đếm tổng số bản ghi
            count_query = f"""
                SELECT count(*) AS total_count
                FROM commission_transactions ct
                JOIN cases c ON ct.case_id = c.id
                JOIN users u ON ct.user_id = u.id
                LEFT JOIN billing_milestones m ON ct.milestone_id = m.id
                LEFT JOIN case_tasks t ON ct.task_id = t.id
                WHERE {where_sql}
            """
            cur.execute(count_query, params)
            total_records = cur.fetchone()["total_count"]
            total_pages = math.ceil(total_records / limit) if total_records > 0 else 0

            # 4. Tính summary theo role_type trên toàn bộ kết quả sau lọc
            summary_query = f"""
                SELECT ct.role_type, SUM(ct.amount) AS role_total
                FROM commission_transactions ct
                JOIN cases c ON ct.case_id = c.id
                JOIN users u ON ct.user_id = u.id
                LEFT JOIN billing_milestones m ON ct.milestone_id = m.id
                LEFT JOIN case_tasks t ON ct.task_id = t.id
                WHERE {where_sql}
                GROUP BY ct.role_type
            """
            cur.execute(summary_query, params)
            summary_rows = cur.fetchall()

            role_totals = {r: Decimal("0") for r in ROLES}
            for s_row in summary_rows:
                rt = s_row["role_type"]
                if rt in role_totals:
                    role_totals[rt] = Decimal(str(s_row["role_total"] or "0"))

            total_amount_dec = sum(role_totals.values(), Decimal("0"))
            summary = {
                "total_amount": format_money(total_amount_dec),
                "by_role": {r: format_money(role_totals[r]) for r in ROLES},
            }

            # 5. Truy vấn dữ liệu phân trang
            offset = (page - 1) * limit
            page_params = dict(params)
            page_params["limit"] = limit
            page_params["offset"] = offset

            data_query = f"""
                SELECT
                    ct.id,
                    ct.case_id,
                    c.case_code,
                    ct.milestone_id,
                    m.name AS milestone_name,
                    ct.user_id,
                    u.full_name AS user_full_name,
                    ct.role_type,
                    ct.task_id,
                    t.title AS task_title,
                    ct.base_amount,
                    ct.rate_pct,
                    ct.amount,
                    ct.created_at
                FROM commission_transactions ct
                JOIN cases c ON ct.case_id = c.id
                JOIN users u ON ct.user_id = u.id
                LEFT JOIN billing_milestones m ON ct.milestone_id = m.id
                LEFT JOIN case_tasks t ON ct.task_id = t.id
                WHERE {where_sql}
                ORDER BY ct.created_at DESC, ct.id
                LIMIT %(limit)s OFFSET %(offset)s
            """
            cur.execute(data_query, page_params)
            rows = cur.fetchall()

            items = []
            for row in rows:
                c_at = row["created_at"]
                if isinstance(c_at, dt.datetime):
                    if c_at.tzinfo is None:
                        c_at = c_at.replace(tzinfo=dt.timezone.utc)
                    else:
                        c_at = c_at.astimezone(dt.timezone.utc)
                    created_at_str = c_at.isoformat().replace("+00:00", "Z")
                elif isinstance(c_at, dt.date):
                    created_at_str = c_at.isoformat()
                else:
                    created_at_str = str(c_at)

                items.append({
                    "id": str(row["id"]),
                    "case": {
                        "id": str(row["case_id"]),
                        "case_code": row["case_code"],
                    },
                    "milestone": {
                        "id": str(row["milestone_id"]),
                        "name": row["milestone_name"],
                    } if row["milestone_id"] else None,
                    "user": {
                        "id": str(row["user_id"]),
                        "full_name": row["user_full_name"],
                    },
                    "role_type": row["role_type"],
                    "task": {
                        "id": str(row["task_id"]),
                        "title": row["task_title"],
                    } if row["task_id"] else None,
                    "base_amount": format_money(row["base_amount"]),
                    "rate_pct": format_money(row["rate_pct"]),
                    "amount": format_money(row["amount"]),
                    "created_at": created_at_str,
                })

            return {
                "success": True,
                "data": items,
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total_records": total_records,
                    "total_pages": total_pages,
                    "summary": summary,
                },
            }
