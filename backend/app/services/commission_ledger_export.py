"""Dịch vụ xuất Excel sổ hoa hồng (SCR-12 / TASK-048)."""
from __future__ import annotations

import datetime as dt
import io
from decimal import Decimal
from typing import Any, Dict, List, Optional

from openpyxl import Workbook
from openpyxl.styles import Font
import psycopg
from psycopg.rows import dict_row

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.services.audit import log_audit_event
from backend.app.services.commission_ledger import build_commission_ledger_where
from backend.app.services.report_export import _set_cell

VN_TZ = dt.timezone(dt.timedelta(hours=7))

EXPECTED_HEADERS = [
    "Ngày ghi nhận",
    "Mã vụ việc",
    "Đợt thu",
    "Nhân sự",
    "Vai trò",
    "Task",
    "Cơ sở tính",
    "Tỷ lệ (%)",
    "Hoa hồng",
]

ROLE_VIETNAMESE = {
    "ORIGINATOR": "Mang khách về",
    "SUPERVISOR": "Giám sát",
    "CASE_MANAGER": "Quản lý vụ việc",
    "EXECUTOR": "Thực hiện",
    "ASSISTANT": "Hỗ trợ",
}


def build_commissions_ledger_workbook(rows: List[Dict[str, Any]]) -> bytes:
    """Dựng workbook Excel cho sổ hoa hồng (sheet 'Sổ hoa hồng', 9 cột, dòng tổng cộng)."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Sổ hoa hồng"

    # Dòng 1: Tiêu đề các cột
    for col_idx, header in enumerate(EXPECTED_HEADERS, start=1):
        _set_cell(ws.cell(row=1, column=col_idx), header, bold=True)

    # Dòng 2..: Các dòng dữ liệu
    for row_idx, r in enumerate(rows, start=2):
        # 1. Ngày ghi nhận (dd/mm/yyyy HH:MM giờ VN)
        c_at = r.get("created_at")
        if isinstance(c_at, dt.datetime):
            if c_at.tzinfo is None:
                c_at = c_at.replace(tzinfo=dt.timezone.utc).astimezone(VN_TZ)
            else:
                c_at = c_at.astimezone(VN_TZ)
            date_str = c_at.strftime("%d/%m/%Y %H:%M")
        elif isinstance(c_at, dt.date):
            date_str = c_at.strftime("%d/%m/%Y 00:00")
        else:
            date_str = str(c_at or "")
        _set_cell(ws.cell(row=row_idx, column=1), date_str)

        # 2. Mã vụ việc
        _set_cell(ws.cell(row=row_idx, column=2), r.get("case_code"))

        # 3. Đợt thu
        _set_cell(ws.cell(row=row_idx, column=3), r.get("milestone_name"))

        # 4. Nhân sự
        _set_cell(ws.cell(row=row_idx, column=4), r.get("user_full_name"))

        # 5. Vai trò (Tiếng Việt)
        role_type = r.get("role_type")
        role_vn = ROLE_VIETNAMESE.get(str(role_type), str(role_type) if role_type else None)
        _set_cell(ws.cell(row=row_idx, column=5), role_vn)

        # 6. Task
        _set_cell(ws.cell(row=row_idx, column=6), r.get("task_title"))

        # 7. Cơ sở tính (int)
        base_amt = int(Decimal(str(r.get("base_amount") or 0)))
        _set_cell(ws.cell(row=row_idx, column=7), base_amt, number_format="#,##0")

        # 8. Tỷ lệ (%)
        rate_dec = Decimal(str(r.get("rate_pct") or 0))
        if rate_dec == int(rate_dec):
            rate_val: Any = int(rate_dec)
        else:
            rate_val = float(rate_dec)
        _set_cell(ws.cell(row=row_idx, column=8), rate_val)

        # 9. Hoa hồng (int)
        amt = int(Decimal(str(r.get("amount") or 0)))
        _set_cell(ws.cell(row=row_idx, column=9), amt, number_format="#,##0")

    # Dòng cuối: Dòng Tổng cộng
    total_row_idx = len(rows) + 2
    for c in range(1, 10):
        ws.cell(row=total_row_idx, column=c).font = Font(bold=True)

    _set_cell(ws.cell(row=total_row_idx, column=1), "Tổng cộng", bold=True)

    # Tính tổng cộng bằng Decimal trên toàn bộ kết quả để không lệch từng đồng
    total_amount_dec = sum((Decimal(str(r.get("amount") or 0)) for r in rows), Decimal("0"))
    total_amount_int = int(total_amount_dec)
    _set_cell(ws.cell(row=total_row_idx, column=9), total_amount_int, number_format="#,##0", bold=True)

    output = io.BytesIO()
    wb.save(output)
    return output.getvalue()


def export_commission_ledger_sync(
    current_user: Dict[str, Any],
    case_id: Optional[str],
    user_id: Optional[str],
    role_type: Optional[str],
    from_date: Optional[dt.date],
    to_date: Optional[dt.date],
) -> bytes:
    """Truy vấn dữ liệu sổ hoa hồng theo phạm vi và xuất tệp Excel, ghi nhật ký kiểm toán."""
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
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
                rows: List[Dict[str, Any]] = []
                total_records = 0
            else:
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

                if total_records > 50000:
                    raise AppException(
                        status_code=422,
                        code="VALIDATION_ERROR",
                        message="Dữ liệu xuất vượt quá 50.000 dòng, vui lòng thu hẹp bộ lọc",
                    )

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
                """
                cur.execute(data_query, params)
                rows = cur.fetchall()

            xlsx_bytes = build_commissions_ledger_workbook(rows)

            # Ghi nhật ký kiểm toán COMMISSIONS_EXPORTED
            after_state: Dict[str, Any] = {
                "row_count": total_records,
            }
            if case_id is not None:
                after_state["case_id"] = str(case_id)
            if user_id is not None:
                after_state["user_id"] = str(user_id)
            if role_type is not None:
                after_state["role_type"] = role_type
            if from_date is not None:
                after_state["from"] = from_date.isoformat()
            if to_date is not None:
                after_state["to"] = to_date.isoformat()

            log_audit_event(
                conn=conn,
                actor_type="USER",
                action="COMMISSIONS_EXPORTED",
                entity_name="commission_transactions",
                entity_id="export",
                actor_id=str(current_user["id"]),
                after_state=after_state,
            )

            return xlsx_bytes
