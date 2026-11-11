from decimal import Decimal
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator


class OpportunityPatchRequest(BaseModel):
    stage: Optional[str] = None
    lost_reason: Optional[str] = None
    expected_value: Optional[Decimal] = None
    probability_pct: Optional[int] = None

    @field_validator("probability_pct")
    @classmethod
    def validate_probability_pct(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and (v < 0 or v > 100):
            raise ValueError("Xác suất thành công phải từ 0 đến 100%")
        return v

    @field_validator("expected_value")
    @classmethod
    def validate_expected_value(cls, v: Optional[Decimal]) -> Optional[Decimal]:
        if v is not None and v < 0:
            raise ValueError("Giá trị dự kiến không được âm")
        return v


class MilestoneCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    amount: Decimal

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Số tiền đợt thu phải lớn hơn 0")
        return v


class OpportunityConvertRequest(BaseModel):
    matter_type_id: str
    title: str = Field(..., min_length=1, max_length=255)
    contract_value: Decimal
    milestones: List[MilestoneCreate] = Field(..., min_length=1)
    originator_id: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("contract_value")
    @classmethod
    def validate_contract_value(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("Giá trị hợp đồng phải lớn hơn 0")
        return v


class OpportunityData(BaseModel):
    id: str
    client_id: str
    title: str
    lead_source: str
    expected_value: Decimal
    probability_pct: Optional[int]
    stage: str
    lost_reason: Optional[str] = None
    originator_id: str
    converted_case_id: Optional[str] = None


class OpportunityResponse(BaseModel):
    success: bool = True
    data: OpportunityData


class CaseConvertData(BaseModel):
    case_id: str
    case_code: str
    status: str
    workflow_mode: str
    template_version: int
    total_stages: int
    total_tasks_created: int


class CaseConvertResponse(BaseModel):
    success: bool = True
    data: CaseConvertData
    message: str = "Đã tạo vụ việc. Cần phân công nhân sự để bắt đầu."
