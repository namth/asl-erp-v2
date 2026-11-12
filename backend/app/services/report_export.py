"""Dựng tệp Excel cho 3 báo cáo SCR-18 (TSK-15).

Module hàm thuần (không DB, không web framework).
"""
from __future__ import annotations

import io
import re
import urllib.parse
from decimal import Decimal
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Font

VALID_REPORT_NAMES = {"revenue", "commissions", "operations"}
_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def export_filename(name: str, date_from: str, date_to: str) -> str:
    """Tạo tên tệp xuất báo cáo: bao-cao-{name}-{from}-{to}.xlsx."""
    if name not in VALID_REPORT_NAMES:
        raise ValueError(f"Tên báo cáo không hợp lệ: {name}")
    return f"bao-cao-{name}-{date_from}-{date_to}.xlsx"


def content_disposition(filename: str) -> str:
    """Tạo header Content-Disposition percent-encode theo RFC 5987."""
    encoded = urllib.parse.quote(filename, safe="")
    return f"attachment; filename*=UTF-8''{encoded}"


def _format_date(d: str | None) -> str | None:
    if not d or not isinstance(d, str):
        return None
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", d)
    if m:
        return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
    return d


def _format_period_range(meta: dict[str, Any]) -> str:
    from_d = _format_date(meta.get("from")) or ""
    to_d = _format_date(meta.get("to")) or ""
    return f"{from_d} – {to_d}"


def _format_scope(meta: dict[str, Any]) -> str:
    scope = meta.get("scope")
    if scope == "FIRM":
        return "Toàn hãng"
    if scope == "SELF":
        return "Cá nhân"
    if scope == "DEPARTMENT":
        depts = meta.get("departments", [])
        names: list[str] = []
        for d in depts:
            if isinstance(d, dict) and d.get("name"):
                names.append(str(d["name"]))
            elif isinstance(d, str):
                names.append(d)
        return f"Phòng ban: {', '.join(names)}"
    return str(scope) if scope is not None else ""


def _sanitize_string(val: str) -> str:
    if val.startswith(_FORMULA_PREFIXES):
        return "'" + val
    return val


def _set_cell(cell: Any, val: Any, number_format: str | None = None, bold: bool = False) -> None:
    if bold:
        cell.font = Font(bold=True)
    if val is None:
        cell.value = None
        return
    if isinstance(val, str):
        cell.value = _sanitize_string(val)
        cell.data_type = "s"
    elif isinstance(val, int):
        cell.value = val
        if number_format:
            cell.number_format = number_format
    elif isinstance(val, Decimal):
        cell.value = val
        if number_format:
            cell.number_format = number_format
    else:
        cell.value = val
        if number_format:
            cell.number_format = number_format


def _to_money(val: Any) -> int | None:
    if val is None or val == "":
        return None
    return int(Decimal(str(val)))


def _to_decimal(val: Any) -> Decimal | None:
    if val is None or val == "":
        return None
    return Decimal(str(val))


def _to_int(val: Any) -> int | None:
    if val is None or val == "":
        return None
    return int(val)


def _write_kv_sheet(ws: Any, items: list[tuple[str, Any, str | None]]) -> None:
    for row_idx, item in enumerate(items, start=1):
        label, val, num_fmt = item[0], item[1], item[2] if len(item) > 2 else None
        _set_cell(ws.cell(row=row_idx, column=1), label)
        _set_cell(ws.cell(row=row_idx, column=2), val, number_format=num_fmt)


def _write_table_sheet(
    ws: Any,
    headers: list[str],
    rows_data: list[list[Any]],
    col_formats: list[str | None] | None = None,
) -> None:
    # Row 1: Headers (bold)
    for col_idx, h in enumerate(headers, start=1):
        _set_cell(ws.cell(row=1, column=col_idx), h, bold=True)

    # Rows 2..: Data
    for row_idx, row_values in enumerate(rows_data, start=2):
        for col_idx, val in enumerate(row_values, start=1):
            num_fmt = col_formats[col_idx - 1] if col_formats and col_idx - 1 < len(col_formats) else None
            _set_cell(ws.cell(row=row_idx, column=col_idx), val, number_format=num_fmt)


def _build_revenue_wb(wb: Workbook, data: dict[str, Any], meta: dict[str, Any]) -> None:
    summary = data.get("summary") or {}

    # Sheet 1: Tổng quan
    ws_summary = wb.active
    ws_summary.title = "Tổng quan"
    kv_items = [
        ("Báo cáo", "Doanh thu thực thu", None),
        ("Kỳ", _format_period_range(meta), None),
        ("Phạm vi", _format_scope(meta), None),
        ("Tổng thực thu", _to_money(summary.get("received_total", "0")), "#,##0"),
        ("Tổng giá trị hợp đồng", _to_money(summary.get("contract_value_total", "0")), "#,##0"),
        ("Tỷ lệ thu (%)", _to_decimal(summary.get("collection_rate_pct", "0")), None),
        ("Số lần thu", _to_int(summary.get("payment_count", 0)), None),
    ]
    _write_kv_sheet(ws_summary, kv_items)

    # Sheet 2: Theo kỳ
    ws_period = wb.create_sheet(title="Theo kỳ")
    period_rows: list[list[Any]] = []
    for item in data.get("by_period", []):
        period_rows.append([
            item.get("period"),
            _to_money(item.get("received_total", "0")),
        ])
    _write_table_sheet(ws_period, ["Kỳ", "Thực thu"], period_rows, [None, "#,##0"])

    # Sheet 3: Theo phòng ban
    ws_dept = wb.create_sheet(title="Theo phòng ban")
    dept_rows: list[list[Any]] = []
    for item in data.get("by_department", []):
        dept = item.get("department")
        dept_name = dept.get("name") if isinstance(dept, dict) else (dept or "")
        dept_rows.append([
            dept_name,
            _to_money(item.get("received_total", "0")),
        ])
    _write_table_sheet(ws_dept, ["Phòng ban", "Thực thu"], dept_rows, [None, "#,##0"])

    # Sheet 4: Theo loại vụ việc
    ws_matter = wb.create_sheet(title="Theo loại vụ việc")
    matter_rows: list[list[Any]] = []
    for item in data.get("by_matter_type", []):
        mt = item.get("matter_type") or {}
        code = mt.get("code") if isinstance(mt, dict) else ""
        name = mt.get("name") if isinstance(mt, dict) else ""
        matter_rows.append([
            code,
            name,
            _to_money(item.get("received_total", "0")),
            _to_money(item.get("contract_value_total", "0")),
        ])
    _write_table_sheet(
        ws_matter,
        ["Mã", "Loại vụ việc", "Thực thu", "Giá trị hợp đồng"],
        matter_rows,
        [None, None, "#,##0", "#,##0"],
    )


def _build_commissions_wb(wb: Workbook, data: dict[str, Any], meta: dict[str, Any]) -> None:
    summary = data.get("summary") or {}

    # Sheet 1: Tổng quan
    ws_summary = wb.active
    ws_summary.title = "Tổng quan"
    kv_items = [
        ("Báo cáo", "Hoa hồng", None),
        ("Kỳ", _format_period_range(meta), None),
        ("Phạm vi", _format_scope(meta), None),
        ("Tổng hoa hồng", _to_money(summary.get("total_amount", "0")), "#,##0"),
        ("Tích luỹ", _to_money(summary.get("accumulated_amount", "0")), "#,##0"),
        ("Đã chi", _to_money(summary.get("disbursed_amount", "0")), "#,##0"),
    ]
    _write_kv_sheet(ws_summary, kv_items)

    # Sheet 2: Theo nhân sự
    ws_user = wb.create_sheet(title="Theo nhân sự")
    headers = [
        "Nhân sự",
        "Phòng ban",
        "Tổng hoa hồng",
        "Tích luỹ",
        "Đã chi",
        "Mang khách về",
        "Giám sát",
        "Quản lý vụ việc",
        "Thực hiện",
        "Hỗ trợ",
    ]
    col_formats = [None, None, "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0", "#,##0"]

    # Row 1: Headers (bold)
    for col_idx, h in enumerate(headers, start=1):
        _set_cell(ws_user.cell(row=1, column=col_idx), h, bold=True)

    by_user = data.get("by_user", [])
    current_row = 2

    # Totals in Decimal
    dec_total = Decimal(0)
    dec_acc = Decimal(0)
    dec_disb = Decimal(0)
    dec_orig = Decimal(0)
    dec_sup = Decimal(0)
    dec_mgr = Decimal(0)
    dec_exec = Decimal(0)
    dec_asst = Decimal(0)

    for item in by_user:
        user = item.get("user") or {}
        full_name = user.get("full_name") if isinstance(user, dict) else None
        dept_name = user.get("department_name") if isinstance(user, dict) else None

        raw_total = item.get("total_amount", "0") or "0"
        raw_acc = item.get("accumulated_amount", "0") or "0"
        raw_disb = item.get("disbursed_amount", "0") or "0"

        by_role = item.get("by_role") or {}
        raw_orig = by_role.get("ORIGINATOR", "0") or "0"
        raw_sup = by_role.get("SUPERVISOR", "0") or "0"
        raw_mgr = by_role.get("CASE_MANAGER", "0") or "0"
        raw_exec = by_role.get("EXECUTOR", "0") or "0"
        raw_asst = by_role.get("ASSISTANT", "0") or "0"

        dec_total += Decimal(str(raw_total))
        dec_acc += Decimal(str(raw_acc))
        dec_disb += Decimal(str(raw_disb))
        dec_orig += Decimal(str(raw_orig))
        dec_sup += Decimal(str(raw_sup))
        dec_mgr += Decimal(str(raw_mgr))
        dec_exec += Decimal(str(raw_exec))
        dec_asst += Decimal(str(raw_asst))

        row_vals = [
            full_name,
            dept_name,
            _to_money(raw_total),
            _to_money(raw_acc),
            _to_money(raw_disb),
            _to_money(raw_orig),
            _to_money(raw_sup),
            _to_money(raw_mgr),
            _to_money(raw_exec),
            _to_money(raw_asst),
        ]
        for col_idx, val in enumerate(row_vals, start=1):
            _set_cell(ws_user.cell(row=current_row, column=col_idx), val, number_format=col_formats[col_idx - 1])
        current_row += 1

    # Dòng cuối Tổng cộng (in đậm, cột Phòng ban trống)
    if by_user:
        total_vals = [
            "Tổng cộng",
            None,
            int(dec_total),
            int(dec_acc),
            int(dec_disb),
            int(dec_orig),
            int(dec_sup),
            int(dec_mgr),
            int(dec_exec),
            int(dec_asst),
        ]
        for col_idx, val in enumerate(total_vals, start=1):
            _set_cell(
                ws_user.cell(row=current_row, column=col_idx),
                val,
                number_format=col_formats[col_idx - 1],
                bold=True,
            )


def _build_operations_wb(wb: Workbook, data: dict[str, Any], _meta: dict[str, Any]) -> None:
    # Sheet 1: Vụ việc theo trạng thái
    ws_status = wb.active
    ws_status.title = "Vụ việc theo trạng thái"
    status_order = [
        ("Khởi tạo", "INITIALIZING"),
        ("Đang thụ lý", "ACTIVE"),
        ("Tạm dừng", "PAUSED"),
        ("Đã đóng", "CLOSED"),
        ("Đã huỷ", "TERMINATED"),
    ]
    cases_by_status = data.get("cases_by_status") or {}
    status_rows: list[list[Any]] = []
    for label, key in status_order:
        status_rows.append([label, _to_int(cases_by_status.get(key, 0))])
    _write_table_sheet(ws_status, ["Trạng thái", "Số vụ việc"], status_rows)

    # Sheet 2: Task quá hạn
    ws_overdue = wb.create_sheet(title="Task quá hạn")
    overdue_tasks = data.get("overdue_tasks") or {}
    overdue_rows: list[list[Any]] = []
    for item in overdue_tasks.get("items", []):
        task_title = item.get("title")
        case_code = item.get("case", {}).get("case_code") if isinstance(item.get("case"), dict) else None
        assignee = item.get("assignee")
        assignee_name = assignee.get("full_name") if isinstance(assignee, dict) and assignee.get("full_name") else None
        due_date = _format_date(item.get("due_date"))
        days_overdue = _to_int(item.get("days_overdue", 0))
        overdue_rows.append([task_title, case_code, assignee_name, due_date, days_overdue])
    _write_table_sheet(
        ws_overdue,
        ["Task", "Mã vụ việc", "Người thực hiện", "Hạn", "Số ngày quá hạn"],
        overdue_rows,
    )

    # Sheet 3: Thời gian giai đoạn
    ws_stages = wb.create_sheet(title="Thời gian giai đoạn")
    stage_rows: list[list[Any]] = []
    for item in data.get("stage_durations", []):
        stage_name = item.get("stage_name")
        completed_count = _to_int(item.get("completed_count", 0))
        avg_days = _to_decimal(item.get("avg_days", "0"))
        stage_rows.append([stage_name, completed_count, avg_days])
    _write_table_sheet(
        ws_stages,
        ["Giai đoạn", "Số lần hoàn thành", "Số ngày trung bình"],
        stage_rows,
    )

    # Sheet 4: Chuyển đổi cơ hội
    ws_conv = wb.create_sheet(title="Chuyển đổi cơ hội")
    opp = data.get("opportunity_conversion") or {}
    kv_items = [
        ("Cơ hội tạo mới", _to_int(opp.get("created_count", 0)), None),
        ("Thắng", _to_int(opp.get("won_count", 0)), None),
        ("Đã chuyển vụ việc", _to_int(opp.get("converted_count", 0)), None),
        ("Tỷ lệ chuyển đổi (%)", _to_decimal(opp.get("conversion_rate_pct", "0")), None),
    ]
    _write_kv_sheet(ws_conv, kv_items)


def build_report_xlsx(name: str, data: dict[str, Any], meta: dict[str, Any]) -> bytes:
    """Tạo nội dung tệp .xlsx từ data và meta của báo cáo name."""
    if name not in VALID_REPORT_NAMES:
        raise ValueError(f"Tên báo cáo không hợp lệ: {name}")

    wb = Workbook()

    if name == "revenue":
        _build_revenue_wb(wb, data, meta)
    elif name == "commissions":
        _build_commissions_wb(wb, data, meta)
    elif name == "operations":
        _build_operations_wb(wb, data, meta)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
