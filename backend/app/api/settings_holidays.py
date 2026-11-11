"""API Cài đặt Ngày nghỉ lễ (Holidays) - Tuân thủ §3.3a."""
from typing import Optional
from fastapi import APIRouter, Depends, Query

from backend.app.core.errors import AppException
from backend.app.core.security import get_current_user, verify_csrf
from backend.app.schemas.workflows import HolidaysUpdateRequest
from backend.app.services.workflows import get_holidays, update_holidays

router = APIRouter(prefix="/settings/holidays", tags=["Settings Holidays"])

def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("system_role") != "ADMIN":
        raise AppException(403, "FORBIDDEN_ROLE", "Chức năng chỉ dành cho Quản trị viên (ADMIN)")
    return user

def require_admin_or_manager(user: dict = Depends(get_current_user)) -> dict:
    if user.get("system_role") not in ("ADMIN", "MANAGER"):
        raise AppException(403, "FORBIDDEN_ROLE", "Chức năng chỉ dành cho Quản trị viên hoặc Quản lý")
    return user

@router.get("")
async def list_holidays(
    year: int = Query(..., description="Năm cần lấy danh sách ngày nghỉ"),
    user: dict = Depends(require_admin_or_manager)
):
    data = get_holidays(year)
    return {"success": True, "data": data}

@router.put("", dependencies=[Depends(verify_csrf)])
async def put_holidays(
    payload: HolidaysUpdateRequest,
    user: dict = Depends(require_admin)
):
    data = update_holidays(payload)
    return {"success": True, "data": data, "message": "Đã cập nhật danh sách ngày nghỉ lễ"}
