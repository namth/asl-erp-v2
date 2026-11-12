"""Module dịch vụ báo cáo & thống kê SCR-18 (TSK-15).

Cung cấp các hàm truy vấn và tổng hợp dữ liệu báo cáo:
- Doanh thu (revenue)
- Hoa hồng (commissions)
- Vận hành (operations)
- Xuất Excel (export)
"""
from __future__ import annotations

import datetime as dt
import uuid
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple

import psycopg
from psycopg.rows import dict_row

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.services.audit import log_audit_event
from backend.app.services.report_export import build_report_xlsx

VN_TZ = dt.timezone(dt.timedelta(hours=7))
VALID_REPORT_NAMES = {"revenue", "commissions", "operations"}
ALLOWED_GROUP_BY = {"month", "quarter"}
ALLOWED_PAYOUT_STATUS = {"ACCUMULATED", "DISBURSED"}


def validate_and_parse_period(
    from_param: Optional[str],
    to_param: Optional[str],
) -> Tuple[dt.date, dt.date]:
    """Kiểm tra và chuẩn hoá khoảng ngày from / to.

    Quy ước:
    - Mặc định: from = đầu quý hiện tại (giờ VN), to = hôm nay (giờ VN).
    - Định dạng YYYY-MM-DD.
    - from <= to.
    - Khoảng cách (cả hai đầu) tối đa 366 ngày: (to - from).days <= 365.
    """
    today_vn = dt.datetime.now(VN_TZ).date()

    if from_param is None:
        q_start_month = 3 * ((today_vn.month - 1) // 3) + 1
        from_date = dt.date(today_vn.year, q_start_month, 1)
    else:
        if not isinstance(from_param, str):
            raise AppException(422, "VALIDATION_ERROR", "Tham số 'from' phải là chuỗi định dạng YYYY-MM-DD")
        try:
            from_date = dt.date.fromisoformat(from_param)
        except ValueError:
            raise AppException(422, "VALIDATION_ERROR", "Tham số 'from' không đúng định dạng YYYY-MM-DD hoặc ngày không hợp lệ")

    if to_param is None:
        to_date = today_vn
    else:
        if not isinstance(to_param, str):
            raise AppException(422, "VALIDATION_ERROR", "Tham số 'to' phải là chuỗi định dạng YYYY-MM-DD")
        try:
            to_date = dt.date.fromisoformat(to_param)
        except ValueError:
            raise AppException(422, "VALIDATION_ERROR", "Tham số 'to' không đúng định dạng YYYY-MM-DD hoặc ngày không hợp lệ")

    if from_date > to_date:
        raise AppException(422, "VALIDATION_ERROR", "Ngày bắt đầu (from) không được lớn hơn ngày kết thúc (to)")

    if (to_date - from_date).days > 365:
        raise AppException(422, "VALIDATION_ERROR", "Khoảng thời gian báo cáo không được vượt quá 366 ngày")

    return from_date, to_date


class ScopeContext:
    def __init__(
        self,
        scope: str,  # "FIRM" | "DEPARTMENT" | "SELF"
        meta_departments: List[Dict[str, str]],
        applied_departments: List[Dict[str, str]],
        filter_department_ids: Optional[List[str]],
        empty_result: bool,
    ):
        self.scope = scope
        self.meta_departments = meta_departments
        self.applied_departments = applied_departments
        self.filter_department_ids = filter_department_ids
        self.empty_result = empty_result


def resolve_scope(
    conn: psycopg.Connection,
    current_user: Dict[str, Any],
    report_name: str,
    department_id_param: Optional[str],
) -> ScopeContext:
    """Xác thực vai trò và phạm vi dữ liệu theo DEC-04 & docs/07 §3.9."""
    system_role = current_user.get("system_role")
    is_executive = bool(current_user.get("is_executive", False))
    user_id = str(current_user["id"])

    # 1. Kiểm tra vai trò
    if system_role == "ADMIN":
        raise AppException(403, "FORBIDDEN_ROLE", "Quản trị viên không có quyền truy cập báo cáo")

    if report_name == "operations" and system_role == "ACCOUNTANT":
        raise AppException(403, "FORBIDDEN_ROLE", "Kế toán không có quyền truy cập báo cáo vận hành")

    if system_role not in ("MANAGER", "ACCOUNTANT", "ATTORNEY"):
        raise AppException(403, "FORBIDDEN_ROLE", "Vai trò không có quyền truy cập báo cáo")

    # 2. Kiểm tra định dạng department_id nếu được truyền
    parsed_dept_id: Optional[str] = None
    if department_id_param is not None and department_id_param != "":
        try:
            parsed_dept_id = str(uuid.UUID(department_id_param.strip()))
        except Exception:
            raise AppException(422, "VALIDATION_ERROR", "Tham số 'department_id' không phải UUID hợp lệ")

    with conn.cursor(row_factory=dict_row) as cur:
        # Lấy toàn bộ phòng ban của hãng sắp xếp theo tên
        cur.execute("SELECT id, name FROM departments ORDER BY name ASC")
        all_depts_raw = cur.fetchall()
        all_depts = [{"id": str(d["id"]), "name": str(d["name"])} for d in all_depts_raw]
        all_dept_map = {d["id"]: d["name"] for d in all_depts}

        # 3. Luật sư: phạm vi SELF, bỏ qua department_id
        if system_role == "ATTORNEY":
            return ScopeContext(
                scope="SELF",
                meta_departments=[],
                applied_departments=[],
                filter_department_ids=None,
                empty_result=False,
            )

        # 4. Giám đốc hoặc Kế toán
        if is_executive or system_role == "ACCOUNTANT":
            if parsed_dept_id:
                if parsed_dept_id not in all_dept_map:
                    raise AppException(422, "VALIDATION_ERROR", "Phòng ban không tồn tại")
                dept_obj = {"id": parsed_dept_id, "name": all_dept_map[parsed_dept_id]}
                return ScopeContext(
                    scope="DEPARTMENT",
                    meta_departments=all_depts,
                    applied_departments=[dept_obj],
                    filter_department_ids=[parsed_dept_id],
                    empty_result=False,
                )
            else:
                return ScopeContext(
                    scope="FIRM",
                    meta_departments=all_depts,
                    applied_departments=[],
                    filter_department_ids=None,
                    empty_result=False,
                )

        # 5. Trưởng phòng (MANAGER không phải is_executive)
        cur.execute(
            """SELECT d.id, d.name
               FROM department_leaders dl
               JOIN departments d ON dl.department_id = d.id
               WHERE dl.user_id = %s
               ORDER BY d.name ASC""",
            (user_id,)
        )
        led_depts_raw = cur.fetchall()
        led_depts = [{"id": str(d["id"]), "name": str(d["name"])} for d in led_depts_raw]
        led_dept_ids = {d["id"] for d in led_depts}

        if not led_depts:
            # Quản lý chưa phụ trách phòng ban nào -> trả rỗng
            return ScopeContext(
                scope="DEPARTMENT",
                meta_departments=[],
                applied_departments=[],
                filter_department_ids=[],
                empty_result=True,
            )

        if parsed_dept_id:
            if parsed_dept_id not in led_dept_ids:
                raise AppException(403, "NEED_TO_KNOW_DENIED", "Bạn không có quyền truy cập báo cáo của phòng ban này")
            dept_obj = next(d for d in led_depts if d["id"] == parsed_dept_id)
            return ScopeContext(
                scope="DEPARTMENT",
                meta_departments=led_depts,
                applied_departments=[dept_obj],
                filter_department_ids=[parsed_dept_id],
                empty_result=False,
            )
        else:
            return ScopeContext(
                scope="DEPARTMENT",
                meta_departments=led_depts,
                applied_departments=led_depts,
                filter_department_ids=list(led_dept_ids),
                empty_result=False,
            )


def generate_periods(from_date: dt.date, to_date: dt.date, group_by: str) -> List[str]:
    """Sinh danh sách tất cả các tháng hoặc quý trong khoảng [from_date, to_date] sắp tăng dần."""
    periods: List[str] = []
    if group_by == "month":
        cur_y = from_date.year
        cur_m = from_date.month
        end_y = to_date.year
        end_m = to_date.month

        while (cur_y < end_y) or (cur_y == end_y and cur_m <= end_m):
            periods.append(f"{cur_y:04d}-{cur_m:02d}")
            cur_m += 1
            if cur_m > 12:
                cur_m = 1
                cur_y += 1
    elif group_by == "quarter":
        cur_y = from_date.year
        cur_q = (from_date.month - 1) // 3 + 1
        end_y = to_date.year
        end_q = (to_date.month - 1) // 3 + 1

        while (cur_y < end_y) or (cur_y == end_y and cur_q <= end_q):
            periods.append(f"{cur_y:04d}-Q{cur_q}")
            cur_q += 1
            if cur_q > 4:
                cur_q = 1
                cur_y += 1
    return periods


def get_revenue_data(
    conn: psycopg.Connection,
    current_user: Dict[str, Any],
    from_date: dt.date,
    to_date: dt.date,
    group_by: str,
    scope_ctx: ScopeContext,
) -> Dict[str, Any]:
    """Truy vấn và tính toán báo cáo doanh thu SCR-18."""
    periods = generate_periods(from_date, to_date, group_by)

    if scope_ctx.empty_result:
        return {
            "summary": {
                "received_total": "0",
                "contract_value_total": "0",
                "collection_rate_pct": "0.00",
                "payment_count": 0,
            },
            "by_period": [{"period": p, "received_total": "0"} for p in periods],
            "by_department": [],
            "by_matter_type": [],
        }

    where_clauses = [
        "(m.confirmed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= %(from_date)s",
        "(m.confirmed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= %(to_date)s",
    ]
    query_params: Dict[str, Any] = {
        "from_date": from_date,
        "to_date": to_date,
    }

    if scope_ctx.scope == "SELF":
        where_clauses.append(
            """c.id IN (
                SELECT case_id FROM case_assignments
                WHERE user_id = %(user_id)s AND unassigned_at IS NULL
            )"""
        )
        query_params["user_id"] = str(current_user["id"])
    elif scope_ctx.filter_department_ids:
        where_clauses.append("c.department_id = ANY(%(filter_dept_ids)s)")
        query_params["filter_dept_ids"] = scope_ctx.filter_department_ids

    where_sql = " AND ".join(where_clauses)

    query = f"""
        SELECT
            m.id,
            m.received_amount,
            (m.confirmed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS vn_date,
            c.id AS case_id,
            COALESCE(c.contract_value, 0) AS contract_value,
            d.id AS dept_id,
            d.name AS dept_name,
            mt.code AS mt_code,
            mt.name AS mt_name
        FROM misa_transactions m
        JOIN billing_milestones bm ON m.milestone_id = bm.id
        JOIN cases c ON bm.case_id = c.id
        LEFT JOIN departments d ON c.department_id = d.id
        LEFT JOIN matter_types mt ON c.matter_type_id = mt.id
        WHERE {where_sql}
    """

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(query, query_params)
        rows = cur.fetchall()

    received_total_dec = Decimal(0)
    cases_with_payments: Dict[str, Decimal] = {}
    period_totals: Dict[str, Decimal] = {p: Decimal(0) for p in periods}
    dept_totals: Dict[str, Dict[str, Any]] = {}
    mt_totals: Dict[str, Dict[str, Any]] = {}
    mt_cases: Dict[str, Dict[str, Decimal]] = {}

    for row in rows:
        amt = Decimal(str(row["received_amount"]))
        received_total_dec += amt

        cid = str(row["case_id"])
        if cid not in cases_with_payments:
            cases_with_payments[cid] = Decimal(str(row["contract_value"]))

        vn_date: dt.date = row["vn_date"]
        if group_by == "month":
            pkey = f"{vn_date.year:04d}-{vn_date.month:02d}"
        else:
            q = (vn_date.month - 1) // 3 + 1
            pkey = f"{vn_date.year:04d}-Q{q}"

        if pkey in period_totals:
            period_totals[pkey] += amt

        if row["dept_id"] is not None:
            did = str(row["dept_id"])
            dname = str(row["dept_name"])
            if did not in dept_totals:
                dept_totals[did] = {"id": did, "name": dname, "received_total": Decimal(0)}
            dept_totals[did]["received_total"] += amt

        if row["mt_code"] is not None:
            mcode = str(row["mt_code"])
            mname = str(row["mt_name"])
            if mcode not in mt_totals:
                mt_totals[mcode] = {"code": mcode, "name": mname, "received_total": Decimal(0)}
                mt_cases[mcode] = {}
            mt_totals[mcode]["received_total"] += amt
            if cid not in mt_cases[mcode]:
                mt_cases[mcode][cid] = Decimal(str(row["contract_value"]))

    contract_value_total_dec = sum(cases_with_payments.values()) if cases_with_payments else Decimal(0)

    if contract_value_total_dec > 0:
        coll_rate = (received_total_dec / contract_value_total_dec * 100).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        coll_rate_str = f"{coll_rate:.2f}"
    else:
        coll_rate_str = "0.00"

    summary = {
        "received_total": str(int(received_total_dec)),
        "contract_value_total": str(int(contract_value_total_dec)),
        "collection_rate_pct": coll_rate_str,
        "payment_count": len(rows),
    }

    by_period = [
        {"period": p, "received_total": str(int(period_totals[p]))}
        for p in periods
    ]

    dept_list = [d for d in dept_totals.values() if d["received_total"] > 0]
    dept_list.sort(key=lambda x: (-x["received_total"], x["name"]))
    by_department = [
        {
            "department": {"id": d["id"], "name": d["name"]},
            "received_total": str(int(d["received_total"])),
        }
        for d in dept_list
    ]

    mt_list = [m for m in mt_totals.values() if m["received_total"] > 0]
    mt_list.sort(key=lambda x: (-x["received_total"], x["code"]))
    by_matter_type = [
        {
            "matter_type": {"code": m["code"], "name": m["name"]},
            "received_total": str(int(m["received_total"])),
            "contract_value_total": str(int(sum(mt_cases[m["code"]].values()))),
        }
        for m in mt_list
    ]

    return {
        "summary": summary,
        "by_period": by_period,
        "by_department": by_department,
        "by_matter_type": by_matter_type,
    }


def get_commissions_data(
    conn: psycopg.Connection,
    current_user: Dict[str, Any],
    from_date: dt.date,
    to_date: dt.date,
    payout_status: Optional[str],
    scope_ctx: ScopeContext,
) -> Dict[str, Any]:
    """Truy vấn và tính toán báo cáo hoa hồng SCR-18."""
    if scope_ctx.empty_result:
        return {
            "summary": {
                "total_amount": "0",
                "accumulated_amount": "0",
                "disbursed_amount": "0",
            },
            "by_user": [],
        }

    where_clauses = [
        "(ct.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= %(from_date)s",
        "(ct.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= %(to_date)s",
    ]
    query_params: Dict[str, Any] = {
        "from_date": from_date,
        "to_date": to_date,
    }

    if payout_status:
        where_clauses.append("ct.payout_status = %(payout_status)s")
        query_params["payout_status"] = payout_status

    if scope_ctx.scope == "SELF":
        where_clauses.append("u.id = %(user_id)s")
        query_params["user_id"] = str(current_user["id"])
    elif scope_ctx.filter_department_ids:
        where_clauses.append("u.department_id = ANY(%(filter_dept_ids)s)")
        query_params["filter_dept_ids"] = scope_ctx.filter_department_ids

    where_sql = " AND ".join(where_clauses)

    query = f"""
        SELECT
            ct.id,
            ct.user_id,
            ct.role_type,
            ct.amount,
            ct.payout_status,
            u.full_name,
            d.name AS department_name
        FROM commission_transactions ct
        JOIN users u ON ct.user_id = u.id
        LEFT JOIN departments d ON u.department_id = d.id
        WHERE {where_sql}
    """

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(query, query_params)
        rows = cur.fetchall()

    total_amount_dec = Decimal(0)
    accumulated_amount_dec = Decimal(0)
    disbursed_amount_dec = Decimal(0)

    users_data: Dict[str, Dict[str, Any]] = {}

    for row in rows:
        amt = Decimal(str(row["amount"]))
        status = row["payout_status"]
        uid = str(row["user_id"])
        fname = str(row["full_name"])
        dname = str(row["department_name"]) if row["department_name"] is not None else None
        role = str(row["role_type"])

        total_amount_dec += amt
        if status == "ACCUMULATED":
            accumulated_amount_dec += amt
        elif status == "DISBURSED":
            disbursed_amount_dec += amt

        if uid not in users_data:
            users_data[uid] = {
                "id": uid,
                "full_name": fname,
                "department_name": dname,
                "total_amount": Decimal(0),
                "accumulated_amount": Decimal(0),
                "disbursed_amount": Decimal(0),
                "by_role": {
                    "ORIGINATOR": Decimal(0),
                    "SUPERVISOR": Decimal(0),
                    "CASE_MANAGER": Decimal(0),
                    "EXECUTOR": Decimal(0),
                    "ASSISTANT": Decimal(0),
                },
            }

        u_entry = users_data[uid]
        u_entry["total_amount"] += amt
        if status == "ACCUMULATED":
            u_entry["accumulated_amount"] += amt
        elif status == "DISBURSED":
            u_entry["disbursed_amount"] += amt

        if role in u_entry["by_role"]:
            u_entry["by_role"][role] += amt

    summary = {
        "total_amount": str(int(total_amount_dec)),
        "accumulated_amount": str(int(accumulated_amount_dec)),
        "disbursed_amount": str(int(disbursed_amount_dec)),
    }

    user_list = [u for u in users_data.values() if u["total_amount"] > 0]
    user_list.sort(key=lambda x: (-x["total_amount"], x["full_name"], x["id"]))

    by_user = [
        {
            "user": {
                "id": u["id"],
                "full_name": u["full_name"],
                "department_name": u["department_name"],
            },
            "total_amount": str(int(u["total_amount"])),
            "accumulated_amount": str(int(u["accumulated_amount"])),
            "disbursed_amount": str(int(u["disbursed_amount"])),
            "by_role": {
                r: str(int(amt)) for r, amt in u["by_role"].items()
            },
        }
        for u in user_list
    ]

    return {
        "summary": summary,
        "by_user": by_user,
    }


def get_operations_data(
    conn: psycopg.Connection,
    current_user: Dict[str, Any],
    from_date: dt.date,
    to_date: dt.date,
    scope_ctx: ScopeContext,
) -> Dict[str, Any]:
    """Truy vấn và tính toán báo cáo vận hành SCR-18."""
    today_vn = dt.datetime.now(VN_TZ).date()

    if scope_ctx.empty_result:
        return {
            "cases_by_status": {
                "INITIALIZING": 0,
                "ACTIVE": 0,
                "PAUSED": 0,
                "CLOSED": 0,
                "TERMINATED": 0,
            },
            "overdue_tasks": {"count": 0, "items": []},
            "stage_durations": [],
            "opportunity_conversion": {
                "created_count": 0,
                "won_count": 0,
                "converted_count": 0,
                "conversion_rate_pct": "0.00",
            },
        }

    case_where: List[str] = []
    case_params: Dict[str, Any] = {}
    if scope_ctx.scope == "SELF":
        case_where.append(
            """c.id IN (
                SELECT case_id FROM case_assignments
                WHERE user_id = %(user_id)s AND unassigned_at IS NULL
            )"""
        )
        case_params["user_id"] = str(current_user["id"])
    elif scope_ctx.filter_department_ids:
        case_where.append("c.department_id = ANY(%(filter_dept_ids)s)")
        case_params["filter_dept_ids"] = scope_ctx.filter_department_ids

    case_filter_sql = ("WHERE " + " AND ".join(case_where)) if case_where else ""

    opp_where: List[str] = [
        "(opp.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= %(from_date)s",
        "(opp.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= %(to_date)s",
    ]
    opp_params: Dict[str, Any] = {
        "from_date": from_date,
        "to_date": to_date,
    }
    if scope_ctx.scope == "SELF":
        opp_where.append("opp.originator_id = %(user_id)s")
        opp_params["user_id"] = str(current_user["id"])
    elif scope_ctx.filter_department_ids:
        opp_where.append(
            "opp.originator_id IN (SELECT id FROM users WHERE department_id = ANY(%(filter_dept_ids)s))"
        )
        opp_params["filter_dept_ids"] = scope_ctx.filter_department_ids
    opp_filter_sql = "WHERE " + " AND ".join(opp_where)

    with conn.cursor(row_factory=dict_row) as cur:
        # 1. cases_by_status (ảnh chụp hiện tại)
        cur.execute(
            f"""SELECT c.status, count(*) AS cnt
                FROM cases c
                {case_filter_sql}
                GROUP BY c.status""",
            case_params,
        )
        status_counts = {r["status"]: int(r["cnt"]) for r in cur.fetchall()}
        cases_by_status = {
            s: status_counts.get(s, 0)
            for s in ("INITIALIZING", "ACTIVE", "PAUSED", "CLOSED", "TERMINATED")
        }

        # 2. overdue_tasks
        task_where = [
            "ctk.status <> 'COMPLETED'",
            "ctk.due_at IS NOT NULL",
            "(ctk.due_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date < %(today_vn)s",
        ]
        task_params: Dict[str, Any] = {
            "today_vn": today_vn,
            **case_params,
        }
        if case_where:
            task_where.extend(case_where)
        task_filter_sql = "WHERE " + " AND ".join(task_where)

        cur.execute(
            f"""SELECT count(*) AS total_count
                FROM case_tasks ctk
                JOIN cases c ON ctk.case_id = c.id
                {task_filter_sql}""",
            task_params,
        )
        total_overdue = int(cur.fetchone()["total_count"])

        cur.execute(
            f"""SELECT
                    ctk.id AS task_id,
                    ctk.title,
                    c.id AS case_id,
                    c.case_code,
                    u.full_name AS assignee_full_name,
                    (ctk.due_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS due_date,
                    (%(today_vn)s - (ctk.due_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS days_overdue
                FROM case_tasks ctk
                JOIN cases c ON ctk.case_id = c.id
                LEFT JOIN users u ON ctk.assigned_to = u.id
                {task_filter_sql}
                ORDER BY days_overdue DESC, ctk.id ASC
                LIMIT 50""",
            task_params,
        )
        overdue_rows = cur.fetchall()

        overdue_items = [
            {
                "task_id": str(r["task_id"]),
                "title": str(r["title"]),
                "case": {"id": str(r["case_id"]), "case_code": str(r["case_code"])},
                "assignee": {"full_name": str(r["assignee_full_name"])} if r["assignee_full_name"] else None,
                "due_date": r["due_date"].isoformat(),
                "days_overdue": int(r["days_overdue"]),
            }
            for r in overdue_rows
        ]

        overdue_tasks = {
            "count": total_overdue,
            "items": overdue_items,
        }

        # 3. stage_durations
        stage_where = [
            "cs.started_at IS NOT NULL",
            "cs.completed_at IS NOT NULL",
            "(cs.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= %(from_date)s",
            "(cs.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= %(to_date)s",
        ]
        stage_params: Dict[str, Any] = {
            "from_date": from_date,
            "to_date": to_date,
            **case_params,
        }
        if case_where:
            stage_where.extend(case_where)
        stage_filter_sql = "WHERE " + " AND ".join(stage_where)

        cur.execute(
            f"""SELECT
                    cs.name AS stage_name,
                    cs.started_at,
                    cs.completed_at
                FROM case_stages cs
                JOIN cases c ON cs.case_id = c.id
                {stage_filter_sql}""",
            stage_params,
        )
        stage_records = cur.fetchall()

        stage_groups: Dict[str, List[Decimal]] = {}
        for r in stage_records:
            s_name = str(r["stage_name"])
            started = r["started_at"]
            completed = r["completed_at"]
            secs = Decimal(str((completed - started).total_seconds()))
            days = secs / Decimal(86400)
            if s_name not in stage_groups:
                stage_groups[s_name] = []
            stage_groups[s_name].append(days)

        stage_durations = []
        for s_name in sorted(stage_groups.keys()):
            d_list = stage_groups[s_name]
            cnt = len(d_list)
            avg_d = (sum(d_list) / Decimal(cnt)).quantize(
                Decimal("0.1"), rounding=ROUND_HALF_UP
            )
            stage_durations.append({
                "stage_name": s_name,
                "completed_count": cnt,
                "avg_days": f"{avg_d:.1f}",
            })

        # 4. opportunity_conversion
        cur.execute(
            f"""SELECT
                    opp.id,
                    opp.stage,
                    opp.converted_case_id
                FROM opportunities opp
                {opp_filter_sql}""",
            opp_params,
        )
        opp_rows = cur.fetchall()

        created_cnt = len(opp_rows)
        won_cnt = sum(1 for r in opp_rows if r["stage"] == "WON")
        conv_cnt = sum(1 for r in opp_rows if r["converted_case_id"] is not None)

        if created_cnt > 0:
            rate_dec = (Decimal(conv_cnt) / Decimal(created_cnt) * 100).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
            rate_str = f"{rate_dec:.2f}"
        else:
            rate_str = "0.00"

        opportunity_conversion = {
            "created_count": created_cnt,
            "won_count": won_cnt,
            "converted_count": conv_cnt,
            "conversion_rate_pct": rate_str,
        }

    return {
        "cases_by_status": cases_by_status,
        "overdue_tasks": overdue_tasks,
        "stage_durations": stage_durations,
        "opportunity_conversion": opportunity_conversion,
    }


def execute_revenue_report(
    current_user: Dict[str, Any],
    from_date: dt.date,
    to_date: dt.date,
    group_by: str,
    department_id: Optional[str],
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Hàm đồng bộ thực thi báo cáo doanh thu và đóng gói meta."""
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
        scope_ctx = resolve_scope(conn, current_user, "revenue", department_id)
        data = get_revenue_data(conn, current_user, from_date, to_date, group_by, scope_ctx)
        meta = {
            "scope": scope_ctx.scope,
            "departments": scope_ctx.meta_departments,
            "from": from_date.isoformat(),
            "to": to_date.isoformat(),
        }
        return data, meta


def execute_commissions_report(
    current_user: Dict[str, Any],
    from_date: dt.date,
    to_date: dt.date,
    payout_status: Optional[str],
    department_id: Optional[str],
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Hàm đồng bộ thực thi báo cáo hoa hồng và đóng gói meta."""
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
        scope_ctx = resolve_scope(conn, current_user, "commissions", department_id)
        data = get_commissions_data(conn, current_user, from_date, to_date, payout_status, scope_ctx)
        meta = {
            "scope": scope_ctx.scope,
            "departments": scope_ctx.meta_departments,
            "from": from_date.isoformat(),
            "to": to_date.isoformat(),
        }
        return data, meta


def execute_operations_report(
    current_user: Dict[str, Any],
    from_date: dt.date,
    to_date: dt.date,
    department_id: Optional[str],
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Hàm đồng bộ thực thi báo cáo vận hành và đóng gói meta."""
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
        scope_ctx = resolve_scope(conn, current_user, "operations", department_id)
        data = get_operations_data(conn, current_user, from_date, to_date, scope_ctx)
        meta = {
            "scope": scope_ctx.scope,
            "departments": scope_ctx.meta_departments,
            "from": from_date.isoformat(),
            "to": to_date.isoformat(),
        }
        return data, meta


def execute_export_report(
    name: str,
    current_user: Dict[str, Any],
    from_date: dt.date,
    to_date: dt.date,
    department_id: Optional[str],
    group_by: str,
    payout_status: Optional[str],
) -> Tuple[bytes, str, str, Optional[str], str]:
    """Hàm đồng bộ sinh tệp Excel và ghi nhật ký kiểm toán."""
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
        scope_ctx = resolve_scope(conn, current_user, name, department_id)

        if name == "revenue":
            data = get_revenue_data(conn, current_user, from_date, to_date, group_by, scope_ctx)
        elif name == "commissions":
            data = get_commissions_data(conn, current_user, from_date, to_date, payout_status, scope_ctx)
        elif name == "operations":
            data = get_operations_data(conn, current_user, from_date, to_date, scope_ctx)
        else:
            raise AppException(404, "NOT_FOUND", f"Báo cáo '{name}' không tồn tại")

        from_str = from_date.isoformat()
        to_str = to_date.isoformat()

        meta_for_export = {
            "scope": scope_ctx.scope,
            "departments": scope_ctx.applied_departments,
            "from": from_str,
            "to": to_str,
        }

        xlsx_bytes = build_report_xlsx(name, data, meta_for_export)

        # Xác định department_id cho after_state trong audit_logs
        if scope_ctx.scope == "SELF":
            audit_dept_id = None
        elif department_id and scope_ctx.filter_department_ids and len(scope_ctx.filter_department_ids) == 1 and department_id in scope_ctx.filter_department_ids:
            audit_dept_id = department_id
        else:
            audit_dept_id = None

        after_state = {
            "name": name,
            "from": from_str,
            "to": to_str,
            "department_id": audit_dept_id,
            "scope": scope_ctx.scope,
        }

        log_audit_event(
            conn=conn,
            actor_type="USER",
            action="REPORT_EXPORTED",
            entity_name="reports",
            entity_id=name,
            actor_id=str(current_user["id"]),
            after_state=after_state,
        )

        return xlsx_bytes, from_str, to_str, audit_dept_id, scope_ctx.scope
