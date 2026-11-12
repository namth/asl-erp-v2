import re
import uuid
from decimal import Decimal
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator


RATE_REGEX = re.compile(r"^\d+(\.\d{1,2})?$")


def validate_money_amount(v: Any) -> Decimal:
    if isinstance(v, (int, float)):
        v = str(v)
    if not isinstance(v, str):
        raise ValueError("Số tiền phải là chuỗi số thập phân")
    v = v.strip()
    if not RATE_REGEX.match(v):
        raise ValueError("Số tiền không hợp lệ (tối đa 2 chữ số thập phân)")
    try:
        dec = Decimal(v)
    except Exception:
        raise ValueError("Số tiền không hợp lệ")
    if dec <= Decimal("0"):
        raise ValueError("Số tiền phải lớn hơn 0")
    return dec


def validate_rate(v: Any) -> Decimal:
    if isinstance(v, (int, float)):
        v = str(v)
    if not isinstance(v, str):
        raise ValueError("Tỷ lệ hoa hồng phải là chuỗi số")
    v = v.strip()
    if not RATE_REGEX.match(v):
        raise ValueError("Tỷ lệ hoa hồng không hợp lệ (tối đa 2 chữ số thập phân)")
    try:
        dec = Decimal(v)
    except Exception:
        raise ValueError("Tỷ lệ hoa hồng không hợp lệ")
    if dec < Decimal("0") or dec > Decimal("100"):
        raise ValueError("Tỷ lệ hoa hồng phải nằm trong khoảng [0, 100]")
    return dec


class PaymentConfirmRequest(BaseModel):
    milestone_id: uuid.UUID
    misa_invoice_no: str
    bank_ref_code: str
    received_amount: str
    notes: Optional[str] = None

    @field_validator("misa_invoice_no")
    @classmethod
    def validate_invoice(cls, v: str) -> str:
        s = v.strip() if isinstance(v, str) else ""
        if not s:
            raise ValueError("Số hoá đơn MISA không được để trống")
        return s

    @field_validator("bank_ref_code")
    @classmethod
    def validate_bank_ref(cls, v: str) -> str:
        s = v.strip() if isinstance(v, str) else ""
        if not s:
            raise ValueError("Mã tham chiếu ngân hàng không được để trống")
        return s

    @field_validator("received_amount")
    @classmethod
    def validate_amount(cls, v: str) -> str:
        dec = validate_money_amount(v)
        return str(dec)


class CommissionItem(BaseModel):
    user_id: str
    role_type: str
    amount: str
    task_id: Optional[str] = None


class WarningItem(BaseModel):
    code: str
    amount: Optional[str] = None
    message: str


class CommissionPolicyUpdateRequest(BaseModel):
    originator_rate: str
    management_rate: str
    supervisor_share_pct: str
    execution_rate: str

    @field_validator("originator_rate", "management_rate", "supervisor_share_pct", "execution_rate")
    @classmethod
    def check_rate(cls, v: str) -> str:
        dec = validate_rate(v)
        return str(dec)
