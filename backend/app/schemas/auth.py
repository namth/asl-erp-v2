import re
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, field_validator

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")

class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        if not EMAIL_REGEX.match(v):
            raise ValueError("Email không đúng định dạng")
        return v

class PasswordChangeRequest(BaseModel):
    current_password: Optional[str] = None
    new_password: str

class UserProfile(BaseModel):
    id: str
    email: str
    full_name: str
    title: Optional[str] = None
    system_role: str
    is_executive: bool = False
    led_department_ids: List[str] = []
    totp_enabled: bool = False

class LoginData(BaseModel):
    expires_in: int = 1800
    user: UserProfile

class LoginResponse(BaseModel):
    success: bool = True
    data: LoginData

class MeData(BaseModel):
    user: UserProfile

class MeResponse(BaseModel):
    success: bool = True
    data: MeData
