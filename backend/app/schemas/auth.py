import re
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator

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

class TwoFactorSetupData(BaseModel):
    secret: str
    otpauth_uri: str

class TwoFactorSetupResponse(BaseModel):
    success: bool = True
    data: TwoFactorSetupData

class TwoFactorEnableRequest(BaseModel):
    code: str

class TwoFactorEnableData(BaseModel):
    recovery_codes: List[str]

class TwoFactorEnableResponse(BaseModel):
    success: bool = True
    data: TwoFactorEnableData

class TwoFactorVerifyRequest(BaseModel):
    challenge_id: str
    code: str

class Reset2FARequest(BaseModel):
    reason: str = Field(..., min_length=10)
