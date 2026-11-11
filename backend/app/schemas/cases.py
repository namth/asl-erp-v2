from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field

class AssignmentItem(BaseModel):
    user_id: UUID
    role_in_case: str

class CaseAssignmentsUpdateRequest(BaseModel):
    assignments: List[AssignmentItem]

class CaseStatusUpdateRequest(BaseModel):
    status: str
    reason: Optional[str] = None

class TaskPatchRequest(BaseModel):
    assigned_to: Optional[UUID] = None
    due_at: Optional[datetime] = None
    description: Optional[str] = None

class TaskStatusUpdateRequest(BaseModel):
    status: str
    note: Optional[str] = None

class TaskCommentCreateRequest(BaseModel):
    body: str

class ChangeRequestCreateRequest(BaseModel):
    kind: str
    reason: str
    proposal: Dict[str, Any]

class ApprovalDecideRequest(BaseModel):
    action: str
    comment: Optional[str] = None
