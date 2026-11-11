from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, Query, status

from backend.app.core.security import get_current_user, verify_csrf
from backend.app.schemas.cases import (
    CaseAssignmentsUpdateRequest,
    CaseStatusUpdateRequest,
    TaskPatchRequest,
    TaskStatusUpdateRequest,
    TaskCommentCreateRequest,
    ChangeRequestCreateRequest,
)
from backend.app.services.cases import (
    list_cases,
    get_case_detail,
    update_case_status,
    get_case_assignments,
    update_case_assignments,
    get_case_stages,
)
from backend.app.services.case_tasks import (
    get_case_tasks,
    patch_task,
    update_task_status,
    get_task_comments,
    create_task_comment,
)
from backend.app.services.change_requests import (
    list_change_requests,
    create_change_request,
)

router = APIRouter(prefix="/cases", tags=["Cases"])

@router.get("")
async def get_cases(
    q: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    department_id: Optional[str] = Query(default=None),
    mine: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    result = await list_cases(
        current_user=current_user,
        q=q,
        status=status,
        department_id=department_id,
        mine=mine,
        page=page,
        limit=limit
    )
    return {"success": True, "data": result["data"], "meta": result["meta"]}

@router.get("/{case_id}")
async def get_case(
    case_id: str,
    view: Optional[str] = Query(default=None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    data = await get_case_detail(case_id=case_id, view=view, current_user=current_user)
    return {"success": True, "data": data}

@router.post("/{case_id}/status", dependencies=[Depends(verify_csrf)])
async def post_case_status(
    case_id: str,
    payload: CaseStatusUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    data = await update_case_status(
        case_id=case_id,
        new_status=payload.status,
        reason=payload.reason,
        current_user=current_user
    )
    return {"success": True, "data": data}

@router.get("/{case_id}/stages")
async def get_stages(
    case_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    data = await get_case_stages(case_id=case_id, current_user=current_user)
    return {"success": True, "data": data}

@router.get("/{case_id}/assignments")
async def get_assignments(
    case_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    data = await get_case_assignments(case_id=case_id, current_user=current_user)
    return {"success": True, "data": data}

@router.put("/{case_id}/assignments", dependencies=[Depends(verify_csrf)])
async def put_assignments(
    case_id: str,
    payload: CaseAssignmentsUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    data = await update_case_assignments(
        case_id=case_id,
        assignments=payload.assignments,
        current_user=current_user
    )
    return {"success": True, "data": data}

@router.get("/{case_id}/tasks")
async def get_tasks(
    case_id: str,
    stage_id: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    assigned_to: Optional[str] = Query(default=None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    data = await get_case_tasks(
        case_id=case_id,
        current_user=current_user,
        stage_id=stage_id,
        status=status,
        assigned_to=assigned_to
    )
    return {"success": True, "data": data}

@router.patch("/{case_id}/tasks/{task_id}", dependencies=[Depends(verify_csrf)])
async def patch_case_task(
    case_id: str,
    task_id: str,
    payload: TaskPatchRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    data = await patch_task(
        case_id=case_id,
        task_id=task_id,
        patch_data=payload,
        current_user=current_user
    )
    return {"success": True, "data": data}

@router.patch("/{case_id}/tasks/{task_id}/status", dependencies=[Depends(verify_csrf)])
async def patch_case_task_status(
    case_id: str,
    task_id: str,
    payload: TaskStatusUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    data = await update_task_status(
        case_id=case_id,
        task_id=task_id,
        new_status=payload.status,
        note=payload.note,
        current_user=current_user
    )
    return {"success": True, "data": data}

@router.get("/{case_id}/tasks/{task_id}/comments")
async def get_comments(
    case_id: str,
    task_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    data = await get_task_comments(case_id=case_id, task_id=task_id, current_user=current_user)
    return {"success": True, "data": data}

@router.post("/{case_id}/tasks/{task_id}/comments", status_code=status.HTTP_201_CREATED, dependencies=[Depends(verify_csrf)])
async def post_comment(
    case_id: str,
    task_id: str,
    payload: TaskCommentCreateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    data = await create_task_comment(
        case_id=case_id,
        task_id=task_id,
        body=payload.body,
        current_user=current_user
    )
    return {"success": True, "data": data}

@router.get("/{case_id}/change-requests")
async def get_case_change_requests(
    case_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    data = await list_change_requests(case_id=case_id, current_user=current_user)
    return {"success": True, "data": data}

@router.post("/{case_id}/change-requests", status_code=status.HTTP_201_CREATED, dependencies=[Depends(verify_csrf)])
async def post_case_change_request(
    case_id: str,
    payload: ChangeRequestCreateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    data = await create_change_request(
        case_id=case_id,
        kind=payload.kind,
        reason=payload.reason,
        proposal=payload.proposal,
        current_user=current_user
    )
    return {"success": True, "data": data}
