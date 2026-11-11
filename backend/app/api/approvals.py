from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Query

from backend.app.core.security import get_current_user, verify_csrf
from backend.app.schemas.cases import ApprovalDecideRequest
from backend.app.services.approvals import list_approvals, decide_approval

router = APIRouter(prefix="/approvals", tags=["Approvals"])

@router.get("")
async def get_approvals(
    status: Optional[str] = Query(default="PENDING"),
    type: Optional[str] = Query(default=None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    items = await list_approvals(status=status, approval_type=type, current_user=current_user)
    return {"success": True, "data": items}

@router.post("/{approval_id}/decide", dependencies=[Depends(verify_csrf)])
async def post_approval_decision(
    approval_id: str,
    payload: ApprovalDecideRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    result = await decide_approval(
        approval_id=approval_id,
        action=payload.action,
        comment=payload.comment,
        current_user=current_user
    )
    return {"success": True, "data": result}
