import asyncio
from typing import Dict, Any
from fastapi import APIRouter, Depends

from backend.app.core.errors import AppException
from backend.app.core.security import get_current_user, verify_csrf
from backend.app.guards.need_to_know import verify_need_to_know
from backend.app.schemas.accounting import CommissionPolicyUpdateRequest
from backend.app.services.commission_policies import (
    get_case_milestones_sync,
    get_commission_policy_sync,
    update_commission_policy_sync,
)

router = APIRouter(prefix="/cases", tags=["Case Finance"])


@router.get("/{case_id}/milestones")
async def get_case_milestones_endpoint(
    case_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    await verify_need_to_know(current_user["id"], case_id, "finance")
    items = await asyncio.to_thread(get_case_milestones_sync, case_id)
    return {"success": True, "data": items}


@router.get("/{case_id}/commission-policy")
async def get_commission_policy_endpoint(
    case_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    await verify_need_to_know(current_user["id"], case_id, "finance")
    data = await asyncio.to_thread(get_commission_policy_sync, case_id)
    return {"success": True, "data": data}


@router.put("/{case_id}/commission-policy", dependencies=[Depends(verify_csrf)])
async def update_commission_policy_endpoint(
    case_id: str,
    payload: CommissionPolicyUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    if current_user.get("system_role") != "MANAGER":
        raise AppException(403, "FORBIDDEN_ROLE", "Chỉ Quản lý mới có quyền chỉnh sửa chính sách hoa hồng")

    await verify_need_to_know(current_user["id"], case_id, "finance")
    data = await asyncio.to_thread(update_commission_policy_sync, case_id, payload, current_user)
    return {"success": True, "data": data}
