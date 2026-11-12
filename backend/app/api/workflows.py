"""API Trình thiết kế quy trình (Workflow Builder) - Tuân thủ §3.3a."""
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Request, Depends

from backend.app.core.errors import AppException
from backend.app.core.security import get_current_user, verify_csrf
from backend.app.schemas.workflows import (
    WorkflowTemplateCreate,
    WorkflowTemplatePatch,
    WorkflowVersionTreePayload,
    CustomFieldsUpdateRequest
)
from backend.app.services.workflows import (
    list_templates,
    create_template,
    patch_template,
    list_template_versions,
    create_new_version,
    get_version_tree,
    save_version_tree,
    publish_version,
    update_matter_type_custom_fields
)

router = APIRouter(prefix="/workflows", tags=["Workflows"])

def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("system_role") != "ADMIN":
        raise AppException(403, "FORBIDDEN_ROLE", "Chức năng chỉ dành cho Quản trị viên (ADMIN)")
    return user

def require_admin_or_manager(user: dict = Depends(get_current_user)) -> dict:
    if user.get("system_role") not in ("ADMIN", "MANAGER"):
        raise AppException(403, "FORBIDDEN_ROLE", "Chức năng chỉ dành cho Quản trị viên hoặc Quản lý")
    return user

def _get_client_ip(request: Request) -> str:
    client = request.client
    return client.host if client else "127.0.0.1"

# ---------- 1. Templates ----------

@router.get("/templates")
async def get_templates(
    matter_type_id: Optional[str] = None,
    user: dict = Depends(require_admin_or_manager)
):
    templates = list_templates(matter_type_id=matter_type_id)
    return {"success": True, "data": templates}

@router.post("/templates", status_code=201, dependencies=[Depends(verify_csrf)])
async def create_new_template(
    payload: WorkflowTemplateCreate,
    user: dict = Depends(require_admin)
):
    data = create_template(payload)
    return {"success": True, "data": data, "message": "Đã tạo template quy trình"}

@router.patch("/templates/{id}", dependencies=[Depends(verify_csrf)])
async def update_template(
    id: str,
    payload: WorkflowTemplatePatch,
    user: dict = Depends(require_admin)
):
    data = patch_template(id, payload)
    return {"success": True, "data": data, "message": "Đã cập nhật template quy trình"}

# ---------- 2. Template Versions ----------

@router.get("/templates/{id}/versions")
async def get_template_versions(
    id: str,
    user: dict = Depends(require_admin_or_manager)
):
    versions = list_template_versions(id)
    return {"success": True, "data": versions}

@router.post("/templates/{id}/versions", status_code=201, dependencies=[Depends(verify_csrf)])
async def create_template_version(
    id: str,
    user: dict = Depends(require_admin)
):
    data = create_new_version(id)
    return {"success": True, "data": data, "message": "Đã tạo phiên bản nháp mới"}

# ---------- 3. Version Tree ----------

@router.get("/versions/{id}")
async def get_version_detail(
    id: str,
    user: dict = Depends(require_admin_or_manager)
):
    data = get_version_tree(id)
    return {"success": True, "data": data}

@router.put("/versions/{id}", dependencies=[Depends(verify_csrf)])
async def put_version_tree(
    id: str,
    payload: WorkflowVersionTreePayload,
    user: dict = Depends(require_admin)
):
    data = save_version_tree(id, payload)
    return {"success": True, "data": data, "message": "Đã lưu cây quy trình"}

@router.post("/versions/{id}/publish", dependencies=[Depends(verify_csrf)])
async def publish_workflow_version(
    id: str,
    request: Request,
    user: dict = Depends(require_admin)
):
    ip = _get_client_ip(request)
    ua = request.headers.get("user-agent", "ASL-Internal/2.0")
    data = publish_version(id, user_id=user["id"], ip_address=ip, user_agent=ua)
    return {"success": True, "data": data, "message": "Đã phát hành phiên bản quy trình"}

# ---------- 4. Matter Type Custom Fields ----------

@router.put("/matter-types/{id}/custom-fields", dependencies=[Depends(verify_csrf)])
async def update_custom_fields(
    id: str,
    payload: CustomFieldsUpdateRequest,
    request: Request,
    user: dict = Depends(require_admin)
):
    ip = _get_client_ip(request)
    ua = request.headers.get("user-agent", "ASL-Internal/2.0")
    data = update_matter_type_custom_fields(id, payload, user_id=user["id"], ip_address=ip, user_agent=ua)
    return {"success": True, "data": data, "message": "Đã cập nhật trường động"}
