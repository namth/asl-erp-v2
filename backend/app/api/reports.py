"""API Router cho các endpoint Báo cáo & Thống kê SCR-18 (TSK-15)."""
from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query, Response

from backend.app.core.errors import AppException
from backend.app.core.security import get_current_user
from backend.app.services.report_export import (
    content_disposition,
    export_filename,
)
from backend.app.services.reports import (
    ALLOWED_GROUP_BY,
    ALLOWED_PAYOUT_STATUS,
    VALID_REPORT_NAMES,
    execute_commissions_report,
    execute_export_report,
    execute_operations_report,
    execute_revenue_report,
    validate_and_parse_period,
)

router = APIRouter(prefix="/reports", tags=["Reports"])
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/revenue")
async def get_revenue_report_endpoint(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    department_id: Optional[str] = Query(None),
    group_by: Optional[str] = Query("month"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Báo cáo doanh thu thực thu theo kỳ, phòng ban và loại vụ việc."""
    if group_by is not None and group_by not in ALLOWED_GROUP_BY:
        raise AppException(422, "VALIDATION_ERROR", "group_by phải là 'month' hoặc 'quarter'")
    effective_group_by = group_by or "month"

    f_date, t_date = validate_and_parse_period(from_date, to_date)

    data, meta = await asyncio.to_thread(
        execute_revenue_report,
        current_user,
        f_date,
        t_date,
        effective_group_by,
        department_id,
    )

    return {
        "success": True,
        "data": data,
        "message": "Thao tác thành công",
        "warnings": [],
        "meta": meta,
    }


@router.get("/commissions")
async def get_commissions_report_endpoint(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    department_id: Optional[str] = Query(None),
    payout_status: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Báo cáo hoa hồng theo nhân sự, vai trò vụ việc và trạng thái chi trả."""
    if payout_status is not None and payout_status not in ALLOWED_PAYOUT_STATUS:
        raise AppException(422, "VALIDATION_ERROR", "payout_status phải là 'ACCUMULATED' hoặc 'DISBURSED'")

    f_date, t_date = validate_and_parse_period(from_date, to_date)

    data, meta = await asyncio.to_thread(
        execute_commissions_report,
        current_user,
        f_date,
        t_date,
        payout_status,
        department_id,
    )

    return {
        "success": True,
        "data": data,
        "message": "Thao tác thành công",
        "warnings": [],
        "meta": meta,
    }


@router.get("/operations")
async def get_operations_report_endpoint(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    department_id: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Báo cáo vận hành: trạng thái vụ việc, task quá hạn, thời gian giai đoạn và chuyển đổi cơ hội."""
    f_date, t_date = validate_and_parse_period(from_date, to_date)

    data, meta = await asyncio.to_thread(
        execute_operations_report,
        current_user,
        f_date,
        t_date,
        department_id,
    )

    return {
        "success": True,
        "data": data,
        "message": "Thao tác thành công",
        "warnings": [],
        "meta": meta,
    }


@router.get("/{name}/export")
async def export_report_endpoint(
    name: str,
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    department_id: Optional[str] = Query(None),
    group_by: Optional[str] = Query("month"),
    payout_status: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Xuất báo cáo dạng tệp Excel .xlsx và ghi nhật ký kiểm toán."""
    if name not in VALID_REPORT_NAMES:
        raise AppException(404, "NOT_FOUND", f"Báo cáo '{name}' không tồn tại")

    if name == "revenue":
        if group_by is not None and group_by not in ALLOWED_GROUP_BY:
            raise AppException(422, "VALIDATION_ERROR", "group_by phải là 'month' hoặc 'quarter'")
    elif name == "commissions":
        if payout_status is not None and payout_status not in ALLOWED_PAYOUT_STATUS:
            raise AppException(422, "VALIDATION_ERROR", "payout_status phải là 'ACCUMULATED' hoặc 'DISBURSED'")

    f_date, t_date = validate_and_parse_period(from_date, to_date)

    xlsx_bytes, meta_from, meta_to, audit_dept_id, scope = await asyncio.to_thread(
        execute_export_report,
        name,
        current_user,
        f_date,
        t_date,
        department_id,
        group_by or "month",
        payout_status,
    )

    filename = export_filename(name, meta_from, meta_to)
    return Response(
        content=xlsx_bytes,
        media_type=XLSX_MIME,
        headers={
            "Content-Type": XLSX_MIME,
            "Content-Disposition": content_disposition(filename),
        },
    )
