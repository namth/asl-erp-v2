from __future__ import annotations

import asyncio
import datetime as dt
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, Query, status

from backend.app.core.errors import AppException
from backend.app.core.security import get_current_user
from backend.app.services.commission_ledger import ROLES, get_commission_ledger_sync

router = APIRouter(prefix="/finance/commissions", tags=["Finance"])

ALLOWED_ROLES = set(ROLES)
ALLOWED_PAYOUT_STATUS = {"ACCUMULATED", "DISBURSED"}


@router.get("", status_code=status.HTTP_200_OK)
async def get_commissions_ledger_endpoint(
    case_id: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    role_type: Optional[str] = Query(None),
    payout_status: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    page: Any = Query(1),
    limit: Any = Query(20),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Sổ hoa hồng (SCR-12 / M4).

    Thứ tự kiểm tra:
    1. Xác thực (401 - qua get_current_user)
    2. Tham số (422 VALIDATION_ERROR kèm details.fields)
    3. Vai trò (403 FORBIDDEN_ROLE)
    """
    fields: List[Dict[str, str]] = []

    # 1. Kiểm tra định dạng from_date
    parsed_from: Optional[dt.date] = None
    if from_date is not None:
        if not isinstance(from_date, str):
            fields.append({"field": "from", "message": "Tham số 'from' phải là chuỗi định dạng YYYY-MM-DD"})
        else:
            try:
                parsed_from = dt.date.fromisoformat(from_date)
            except ValueError:
                fields.append({"field": "from", "message": "Tham số 'from' không đúng định dạng YYYY-MM-DD hoặc ngày không hợp lệ"})

    # 2. Kiểm tra định dạng to_date
    parsed_to: Optional[dt.date] = None
    if to_date is not None:
        if not isinstance(to_date, str):
            fields.append({"field": "to", "message": "Tham số 'to' phải là chuỗi định dạng YYYY-MM-DD"})
        else:
            try:
                parsed_to = dt.date.fromisoformat(to_date)
            except ValueError:
                fields.append({"field": "to", "message": "Tham số 'to' không đúng định dạng YYYY-MM-DD hoặc ngày không hợp lệ"})

    # 3. Kiểm tra logic from <= to
    if parsed_from is not None and parsed_to is not None:
        if parsed_from > parsed_to:
            fields.append({"field": "from", "message": "Ngày bắt đầu (from) không được lớn hơn ngày kết thúc (to)"})

    # 4. Kiểm tra case_id
    parsed_case_id: Optional[str] = None
    if case_id is not None:
        try:
            parsed_case_id = str(uuid.UUID(str(case_id).strip()))
        except Exception:
            fields.append({"field": "case_id", "message": "Tham số 'case_id' phải là UUID hợp lệ"})

    # 5. Kiểm tra user_id
    parsed_user_id: Optional[str] = None
    if user_id is not None:
        try:
            parsed_user_id = str(uuid.UUID(str(user_id).strip()))
        except Exception:
            fields.append({"field": "user_id", "message": "Tham số 'user_id' phải là UUID hợp lệ"})

    # 6. Kiểm tra role_type
    if role_type is not None and role_type not in ALLOWED_ROLES:
        fields.append({"field": "role_type", "message": f"Tham số 'role_type' không hợp lệ, phải thuộc {sorted(ALLOWED_ROLES)}"})

    # 7. Kiểm tra payout_status
    if payout_status is not None and payout_status not in ALLOWED_PAYOUT_STATUS:
        fields.append({"field": "payout_status", "message": "Tham số 'payout_status' phải là 'ACCUMULATED' hoặc 'DISBURSED'"})

    # 8. Kiểm tra page
    page_int = 1
    try:
        page_int = int(page)
        if page_int < 1:
            fields.append({"field": "page", "message": "Tham số 'page' phải lớn hơn hoặc bằng 1"})
    except (ValueError, TypeError):
        fields.append({"field": "page", "message": "Tham số 'page' phải là số nguyên"})

    # 9. Kiểm tra limit
    limit_int = 20
    try:
        limit_int = int(limit)
        if limit_int < 1 or limit_int > 100:
            fields.append({"field": "limit", "message": "Tham số 'limit' phải nằm trong khoảng từ 1 đến 100"})
    except (ValueError, TypeError):
        fields.append({"field": "limit", "message": "Tham số 'limit' phải là số nguyên"})

    # Nếu có lỗi tham số, trả 422 VALIDATION_ERROR
    if fields:
        raise AppException(
            status_code=422,
            code="VALIDATION_ERROR",
            message="Dữ liệu đầu vào không hợp lệ",
            details={"fields": fields},
        )

    # Kiểm tra vai trò
    system_role = current_user.get("system_role")
    if system_role == "ADMIN":
        raise AppException(403, "FORBIDDEN_ROLE", "Quản trị viên không có quyền truy cập sổ hoa hồng")
    if system_role not in ("ACCOUNTANT", "MANAGER", "ATTORNEY"):
        raise AppException(403, "FORBIDDEN_ROLE", "Vai trò không có quyền truy cập sổ hoa hồng")

    return await asyncio.to_thread(
        get_commission_ledger_sync,
        current_user=current_user,
        case_id=parsed_case_id,
        user_id=parsed_user_id,
        role_type=role_type,
        payout_status=payout_status,
        from_date=parsed_from,
        to_date=parsed_to,
        page=page_int,
        limit=limit_int,
    )
