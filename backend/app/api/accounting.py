import asyncio
import uuid
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Header, Query

from backend.app.core.errors import AppException
from backend.app.core.security import get_current_user, verify_csrf
from backend.app.schemas.accounting import PaymentConfirmRequest
from backend.app.services.payments import confirm_payment_sync, get_accounting_inbox_sync

router = APIRouter(prefix="/accounting", tags=["Accounting"])

ALLOWED_MILESTONE_STATUSES = {
    "PENDING",
    "AWAITING_PAYMENT",
    "PARTIALLY_PAID",
    "PAID_CONFIRMED",
    "CANCELLED",
}


@router.post("/confirm-payment", dependencies=[Depends(verify_csrf)])
async def confirm_payment_endpoint(
    payload: PaymentConfirmRequest,
    idempotency_key: str = Header(..., alias="Idempotency-Key"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    if current_user.get("system_role") != "ACCOUNTANT":
        raise AppException(403, "FORBIDDEN_ROLE", "Chỉ Kế toán mới có quyền xác nhận thu tiền")

    try:
        key_uuid = uuid.UUID(idempotency_key.strip())
    except Exception:
        raise AppException(422, "VALIDATION_ERROR", "Idempotency-Key phải là định dạng UUID hợp lệ")

    result = await asyncio.to_thread(
        confirm_payment_sync,
        payload,
        str(key_uuid),
        current_user,
    )
    return result


@router.get("/inbox")
async def get_accounting_inbox_endpoint(
    status: str = Query(default="AWAITING_PAYMENT,PARTIALLY_PAID"),
    q: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    if current_user.get("system_role") != "ACCOUNTANT":
        raise AppException(403, "FORBIDDEN_ROLE", "Chỉ Kế toán mới có quyền truy cập hòm thư Kế toán")

    raw_statuses = [s.strip() for s in status.split(",") if s.strip()]
    if not raw_statuses:
        raise AppException(422, "VALIDATION_ERROR", "Tham số status không được để trống")

    for s in raw_statuses:
        if s not in ALLOWED_MILESTONE_STATUSES:
            raise AppException(422, "VALIDATION_ERROR", f"Trạng thái đợt thu '{s}' không hợp lệ")

    result = await asyncio.to_thread(
        get_accounting_inbox_sync,
        raw_statuses,
        q,
        page,
        limit,
    )
    return result
