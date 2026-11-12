import re
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, field_validator, model_validator

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
SYSTEM_ROLES = {"ADMIN", "MANAGER", "ATTORNEY", "ACCOUNTANT"}

class UserCreateRequest(BaseModel):
    email: str
    full_name: str
    title: Optional[str] = None
    phone_number: Optional[str] = None
    system_role: str
    is_executive: bool = False
    department_id: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not EMAIL_REGEX.match(v):
            raise ValueError("Email không đúng định dạng")
        if not v.lower().endswith("@asllaw.vn"):
            raise ValueError("Email phải thuộc tên miền @asllaw.vn")
        return v

    @field_validator("system_role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in SYSTEM_ROLES:
            raise ValueError(f"Vai trò không hợp lệ: {v}")
        return v

    @model_validator(mode="after")
    def validate_executive(self) -> "UserCreateRequest":
        if self.is_executive and self.system_role != "MANAGER":
            raise ValueError("Chỉ vai trò MANAGER mới có thể là Giám đốc điều hành (is_executive)")
        return self

class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    title: Optional[str] = None
    phone_number: Optional[str] = None
    system_role: Optional[str] = None
    is_executive: Optional[bool] = None
    department_id: Optional[str] = None

    @field_validator("system_role")
    @classmethod
    def validate_role(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in SYSTEM_ROLES:
            raise ValueError(f"Vai trò không hợp lệ: {v}")
        return v

class UserDeactivateRequest(BaseModel):
    reason: Optional[str] = None

class DepartmentCreateRequest(BaseModel):
    code: str
    name: str

class DepartmentLeadersRequest(BaseModel):
    leader_user_ids: List[str] = []
