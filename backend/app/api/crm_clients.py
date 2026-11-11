from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Request, Depends, Query, status

from backend.app.core.errors import AppException
from backend.app.core.security import get_current_user, verify_csrf
from backend.app.schemas.crm import (
    ClientCreate,
    ClientUpdate,
    InteractionCreate,
    ConflictCheckRequest
)
from backend.app.services.clients import (
    create_client,
    get_client,
    update_client,
    list_clients,
    check_conflicts_standalone,
    add_interaction,
    list_interactions
)

router = APIRouter(tags=["CRM - Clients"])


def require_crm_read_role(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    role = current_user.get("system_role")
    if role == "ADMIN":
        raise AppException(403, "FORBIDDEN_ROLE", "Quản trị viên không có quyền truy cập hồ sơ thân chủ")
    if role not in ("MANAGER", "ATTORNEY", "ACCOUNTANT"):
        raise AppException(403, "FORBIDDEN_ROLE", "Không có quyền truy cập hồ sơ thân chủ")
    return current_user


def require_crm_write_role(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    role = current_user.get("system_role")
    if role == "ADMIN":
        raise AppException(403, "FORBIDDEN_ROLE", "Quản trị viên không có quyền truy cập hồ sơ thân chủ")
    if role == "ACCOUNTANT":
        raise AppException(403, "FORBIDDEN_ROLE", "Kế toán viên không có quyền thao tác ghi trên hồ sơ thân chủ")
    if role not in ("MANAGER", "ATTORNEY"):
        raise AppException(403, "FORBIDDEN_ROLE", "Không có quyền thao tác ghi hồ sơ thân chủ")
    return current_user


def require_crm_interactions_role(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    role = current_user.get("system_role")
    if role == "ADMIN":
        raise AppException(403, "FORBIDDEN_ROLE", "Quản trị viên không có quyền truy cập")
    if role == "ACCOUNTANT":
        raise AppException(403, "FORBIDDEN_ROLE", "Kế toán viên không được xem hoặc ghi dòng thời gian tương tác")
    if role not in ("MANAGER", "ATTORNEY"):
        raise AppException(403, "FORBIDDEN_ROLE", "Không có quyền truy cập tương tác khách hàng")
    return current_user


@router.post(
    "/crm/clients",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_csrf)]
)
async def api_create_client(
    payload: ClientCreate,
    request: Request,
    current_user: Dict[str, Any] = Depends(require_crm_write_role)
):
    """Tạo khách hàng mới (doanh nghiệp, cá nhân, nước ngoài)."""
    data, warnings = await create_client(payload, current_user, request)
    return {
        "success": True,
        "data": data,
        "warnings": warnings
    }


@router.get("/crm/clients")
async def api_list_clients(
    q: Optional[str] = Query(None, description="Tìm theo tên không dấu hoặc MST"),
    category_group: Optional[str] = Query(None, description="Lọc theo nhóm khách hàng"),
    page: int = Query(1, ge=1, description="Trang hiện tại"),
    limit: int = Query(20, ge=1, le=100, description="Số lượng mỗi trang"),
    current_user: Dict[str, Any] = Depends(require_crm_read_role)
):
    """Tìm kiếm và phân trang danh sách khách hàng."""
    result = await list_clients(q=q, category_group=category_group, page=page, limit=limit)
    return {
        "success": True,
        "data": result,
        "meta": result["meta"]
    }


@router.get("/crm/clients/{id}")
async def api_get_client(
    id: str,
    current_user: Dict[str, Any] = Depends(require_crm_read_role)
):
    """Xem thông tin chi tiết khách hàng và các vụ việc theo Need-to-Know."""
    client_data = await get_client(id, current_user)
    return {
        "success": True,
        "data": client_data
    }


@router.patch(
    "/crm/clients/{id}",
    dependencies=[Depends(verify_csrf)]
)
async def api_update_client(
    id: str,
    payload: ClientUpdate,
    request: Request,
    current_user: Dict[str, Any] = Depends(require_crm_write_role)
):
    """Cập nhật thông tin khách hàng."""
    updated = await update_client(id, payload, current_user, request)
    return {
        "success": True,
        "data": updated
    }


@router.get("/crm/clients/{id}/interactions")
async def api_list_interactions(
    id: str,
    current_user: Dict[str, Any] = Depends(require_crm_interactions_role)
):
    """Lấy dòng thời gian tương tác của khách hàng (mới nhất trước)."""
    items = await list_interactions(id)
    return {
        "success": True,
        "data": items
    }


@router.post(
    "/crm/clients/{id}/interactions",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(verify_csrf)]
)
async def api_add_interaction(
    id: str,
    payload: InteractionCreate,
    current_user: Dict[str, Any] = Depends(require_crm_interactions_role)
):
    """Thêm một tương tác vào hồ sơ khách hàng."""
    item = await add_interaction(id, payload, current_user)
    return {
        "success": True,
        "data": item
    }


@router.post(
    "/crm/conflict-check",
    dependencies=[Depends(verify_csrf)]
)
async def api_conflict_check(
    payload: ConflictCheckRequest,
    current_user: Dict[str, Any] = Depends(require_crm_write_role)
):
    """Kiểm tra xung đột lợi ích độc lập mà không tạo dữ liệu."""
    conflicts = await check_conflicts_standalone(
        name=payload.name,
        tax_code=payload.tax_code,
        identity_no=payload.identity_no
    )
    return {
        "success": True,
        "data": {
            "conflicts": conflicts
        }
    }
