import re
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, model_validator, field_validator
from backend.app.services.text_normalize import normalize_identity_no

ClientType = Literal["ENTERPRISE", "INDIVIDUAL", "FOREIGN"]
CategoryGroup = Literal["NEW", "POTENTIAL", "RETURNING", "STRATEGIC", "VIP"]
InteractionKind = Literal["CALL", "MEETING", "EMAIL", "NOTE"]

TAX_CODE_REGEX = re.compile(r"^\d{10}(-\d{3})?$")

class ClientCaseSummary(BaseModel):
    id: str
    case_code: str
    title: str
    status: Optional[str] = None

class ClientWarning(BaseModel):
    code: str
    case_codes: Optional[List[str]] = None
    message: Optional[str] = None

class ClientCreate(BaseModel):
    client_type: ClientType
    name: str = Field(..., min_length=1)
    tax_code: Optional[str] = None
    identity_no: Optional[str] = None
    representative_name: Optional[str] = None
    phone: str = Field(..., min_length=1)
    email: Optional[str] = None
    address: str = Field(..., min_length=1)
    category_group: Optional[str] = "NEW"

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Tên khách hàng không được để trống")
        return s

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Số điện thoại không được để trống")
        return s

    @field_validator("address")
    @classmethod
    def validate_address(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Địa chỉ không được để trống")
        return s

    @model_validator(mode="after")
    def validate_client_type_fields(self):
        c_type = self.client_type
        if c_type == "ENTERPRISE":
            if not self.tax_code or not TAX_CODE_REGEX.match(self.tax_code.strip()):
                raise ValueError("Mã số thuế (tax_code) là bắt buộc với doanh nghiệp và phải có định dạng 10 hoặc 13 số (ví dụ: 0109988776 hoặc 0109988776-001)")
            self.tax_code = self.tax_code.strip()
        elif c_type == "INDIVIDUAL":
            if not self.identity_no:
                raise ValueError("Số định danh cá nhân (identity_no) là bắt buộc với khách hàng cá nhân")
            cleaned_id = normalize_identity_no(self.identity_no)
            if not cleaned_id.isdigit() or len(cleaned_id) not in (9, 12):
                raise ValueError("Số CCCD/CMND phải bao gồm đúng 9 số (CMND) hoặc 12 số (CCCD)")
        return self

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    tax_code: Optional[str] = None
    identity_no: Optional[str] = None
    representative_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    category_group: Optional[str] = None

    @field_validator("tax_code")
    @classmethod
    def validate_tax_code(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            s = v.strip()
            if s and not TAX_CODE_REGEX.match(s):
                raise ValueError("Mã số thuế phải có định dạng 10 hoặc 13 số (ví dụ: 0109988776 hoặc 0109988776-001)")
            return s or None
        return None

    @field_validator("identity_no")
    @classmethod
    def validate_identity_no(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            cleaned = normalize_identity_no(v)
            if cleaned and (not cleaned.isdigit() or len(cleaned) not in (9, 12)):
                raise ValueError("Số CCCD/CMND phải bao gồm đúng 9 hoặc 12 chữ số")
            return cleaned or None
        return None

class ClientResponse(BaseModel):
    id: str
    client_type: str
    name: str
    tax_code: Optional[str] = None
    identity_no: Optional[str] = None
    identity_no_masked: Optional[str] = None
    representative_name: Optional[str] = None
    phone: str
    email: Optional[str] = None
    address: str
    category_group: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    cases: Optional[List[Dict[str, Any]]] = None
    warnings: Optional[List[Dict[str, Any]]] = None

class InteractionCreate(BaseModel):
    kind: Optional[str] = None
    interaction_type: Optional[str] = None
    summary: str = Field(..., min_length=1)
    occurred_at: str

    @model_validator(mode="after")
    def resolve_kind(self):
        k = self.kind or self.interaction_type
        if not k:
            raise ValueError("Loại tương tác (kind/interaction_type) là bắt buộc")
        k_upper = k.strip().upper()
        if k_upper not in ("CALL", "MEETING", "EMAIL", "NOTE"):
            raise ValueError(f"Loại tương tác không hợp lệ: {k}. Phải là CALL, MEETING, EMAIL hoặc NOTE")
        self.kind = k_upper
        return self

class InteractionResponse(BaseModel):
    id: str
    client_id: str
    kind: str
    summary: str
    occurred_at: str
    created_by: Optional[str] = None
    created_at: Optional[str] = None

class ConflictCheckRequest(BaseModel):
    name: str = Field(..., min_length=1)
    tax_code: Optional[str] = None
    identity_no: Optional[str] = None

class PaginationMeta(BaseModel):
    page: int
    limit: int
    total_records: int
    total_pages: int
