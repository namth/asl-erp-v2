from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Request, Depends, Query, status
from fastapi.responses import JSONResponse

from backend.app.core.errors import AppException
from backend.app.core.security import get_current_user, verify_csrf
from backend.app.schemas.users import (
    UserCreateRequest,
    UserUpdateRequest,
    UserDeactivateRequest
)
from backend.app.services.users import (
    create_user,
    update_user,
    deactivate_user,
    activate_user,
    list_users,
    get_user_by_id
)

router = APIRouter(prefix="/users", tags=["Users"])

def _get_client_info(request: Request) -> tuple[str, str]:
    ip = request.client.host if request.client else "127.0.0.1"
    ua = request.headers.get("user-agent", "ASL-Client/2.0")
    return ip, ua

def _require_admin(current_user: Dict[str, Any]) -> None:
    if current_user.get("system_role") != "ADMIN":
        raise AppException(403, "FORBIDDEN_ROLE", "Chỉ Quản trị viên mới có quyền thực hiện thao tác này")

def _require_admin_or_manager(current_user: Dict[str, Any]) -> None:
    if current_user.get("system_role") not in ("ADMIN", "MANAGER"):
        raise AppException(403, "FORBIDDEN_ROLE", "Chỉ Quản trị viên và Quản lý mới có quyền xem thông tin này")

@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(verify_csrf)])
async def create_user_endpoint(
    payload: UserCreateRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    _require_admin(current_user)
    ip, ua = _get_client_info(request)
    data = await create_user(payload, current_user, ip=ip, user_agent=ua)
    return {
        "success": True,
        "data": data,
        "message": "Tạo người dùng thành công"
    }

@router.get("", status_code=status.HTTP_200_OK)
async def list_users_endpoint(
    q: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    department_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    _require_admin_or_manager(current_user)
    items, meta = await list_users(q=q, role=role, department_id=department_id, page=page, limit=limit)
    return {
        "success": True,
        "data": items,
        "meta": meta
    }

@router.get("/{id}", status_code=status.HTTP_200_OK)
async def get_user_endpoint(
    id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    _require_admin_or_manager(current_user)
    data = await get_user_by_id(id)
    return {
        "success": True,
        "data": data
    }

@router.patch("/{id}", status_code=status.HTTP_200_OK, dependencies=[Depends(verify_csrf)])
async def update_user_endpoint(
    id: str,
    payload: UserUpdateRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    _require_admin(current_user)
    ip, ua = _get_client_info(request)
    data = await update_user(id, payload, current_user, ip=ip, user_agent=ua)
    return {
        "success": True,
        "data": data,
        "message": "Cập nhật người dùng thành công"
    }

@router.post("/{id}/deactivate", status_code=status.HTTP_200_OK, dependencies=[Depends(verify_csrf)])
async def deactivate_user_endpoint(
    id: str,
    payload: UserDeactivateRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    _require_admin(current_user)
    ip, ua = _get_client_info(request)
    await deactivate_user(id, payload.reason, current_user, ip=ip, user_agent=ua)
    return {
        "success": True,
        "message": "Vô hiệu hóa tài khoản thành công"
    }

@router.post("/{id}/activate", status_code=status.HTTP_200_OK, dependencies=[Depends(verify_csrf)])
async def activate_user_endpoint(
    id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    _require_admin(current_user)
    ip, ua = _get_client_info(request)
    await activate_user(id, current_user, ip=ip, user_agent=ua)
    return {
        "success": True,
        "message": "Kích hoạt tài khoản thành công"
    }
