"""Schemas Pydantic cho Trình thiết kế quy trình (Workflow Builder) & Ngày nghỉ lễ."""
import re
from datetime import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field, field_validator, model_validator
from backend.app.core.errors import AppException

# ---------- 1. Custom Fields ----------

class CustomFieldItem(BaseModel):
    key: str
    label: str
    type: str  # text, number, date, select, boolean
    required: bool = False
    options: Optional[List[str]] = None

    @field_validator("key")
    @classmethod
    def validate_key(cls, v: str) -> str:
        if not re.match(r"^[a-z][a-z0-9_]*$", v):
            raise ValueError("Key must be in snake_case format")
        return v

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        allowed = {"text", "number", "date", "select", "boolean"}
        if v not in allowed:
            raise ValueError(f"Type must be one of {allowed}")
        return v

    @model_validator(mode="after")
    def validate_select_options(self) -> "CustomFieldItem":
        if self.type == "select":
            if not self.options or len(self.options) < 1:
                raise ValueError("Type 'select' requires at least 1 option")
        return self

class CustomFieldsUpdateRequest(BaseModel):
    fields: List[CustomFieldItem]

    @field_validator("fields")
    @classmethod
    def validate_unique_keys(cls, v: List[CustomFieldItem]) -> List[CustomFieldItem]:
        keys = [f.key for f in v]
        if len(keys) != len(set(keys)):
            raise ValueError("Duplicate field keys are not allowed")
        return v

# ---------- 2. Holidays ----------

class HolidayItem(BaseModel):
    date: str
    name: str

class HolidaysUpdateRequest(BaseModel):
    year: int
    days: List[HolidayItem]

    @model_validator(mode="after")
    def validate_holidays(self) -> "HolidaysUpdateRequest":
        year = self.year
        seen_dates = set()
        fields = []
        for idx, day in enumerate(self.days):
            try:
                dt = datetime.strptime(day.date, "%Y-%m-%d")
                if dt.year != year:
                    fields.append({
                        "field": f"days[{idx}].date",
                        "message": f"Ngày {day.date} không thuộc năm {year}"
                    })
            except ValueError:
                fields.append({
                    "field": f"days[{idx}].date",
                    "message": f"Định dạng ngày không hợp lệ: {day.date}"
                })

            if day.date in seen_dates:
                fields.append({
                    "field": f"days[{idx}].date",
                    "message": f"Ngày {day.date} bị trùng lặp"
                })
            seen_dates.add(day.date)

        if fields:
            raise AppException(422, "VALIDATION_ERROR", "Dữ liệu ngày nghỉ không hợp lệ", details={"fields": fields})
        return self

# ---------- 3. Workflow Template CRUD ----------

class WorkflowTemplateCreate(BaseModel):
    matter_type_id: str
    name: str
    mode: str = "STRICT"

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v: str) -> str:
        if v not in ("STRICT", "FLEXIBLE"):
            raise ValueError("Mode must be STRICT or FLEXIBLE")
        return v

class WorkflowTemplatePatch(BaseModel):
    name: Optional[str] = None
    mode: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("STRICT", "FLEXIBLE"):
            raise ValueError("Mode must be STRICT or FLEXIBLE")
        return v

# ---------- 4. Workflow Version Tree (PUT) ----------

class WorkflowTaskPayload(BaseModel):
    key: str
    title: str
    description: Optional[str] = None
    default_case_role: Optional[str] = "EXECUTOR"
    sla_business_days: Optional[int] = None
    complexity_weight: int = 1
    requires_approval: bool = True
    triggers_milestone_order: Optional[int] = None
    depends_on: List[str] = []

class WorkflowStagePayload(BaseModel):
    key: str
    name: str
    order_index: int
    requires_approval: bool = False
    tasks: List[WorkflowTaskPayload] = []

class WorkflowVersionTreePayload(BaseModel):
    stages: List[WorkflowStagePayload]

    def validate_tree_constraints(self) -> None:
        """Kiểm tra toàn diện mọi ràng buộc §3.3a:
        - order_index liên tục từ 1
        - key stage duy nhất
        - key task duy nhất
        - sla_business_days > 0
        - complexity_weight 1..4
        - depends_on chỉ trỏ tới key có trong bản
        - không tự phụ thuộc
        - triggers_milestone_order >= 1 và không trùng
        """
        fields: List[Dict[str, str]] = []

        stage_keys = set()
        task_keys = set()
        milestone_orders = set()

        # Kiểm tra order_index liên tục từ 1
        expected_orders = list(range(1, len(self.stages) + 1))
        actual_orders = [s.order_index for s in self.stages]
        if actual_orders != expected_orders:
            fields.append({
                "field": "stages.order_index",
                "message": f"order_index phải liên tục bắt đầu từ 1. Kỳ vọng: {expected_orders}, thực tế: {actual_orders}"
            })

        for s_idx, stage in enumerate(self.stages):
            if stage.key in stage_keys:
                fields.append({
                    "field": f"stages[{s_idx}].key",
                    "message": f"Key stage '{stage.key}' bị trùng lặp"
                })
            stage_keys.add(stage.key)

            for t_idx, task in enumerate(stage.tasks):
                if task.key in task_keys:
                    fields.append({
                        "field": f"stages[{s_idx}].tasks[{t_idx}].key",
                        "message": f"Key task '{task.key}' bị trùng lặp"
                    })
                task_keys.add(task.key)

                if task.sla_business_days is not None and task.sla_business_days <= 0:
                    fields.append({
                        "field": f"stages[{s_idx}].tasks[{t_idx}].sla_business_days",
                        "message": f"sla_business_days phải lớn hơn 0 (nhận {task.sla_business_days})"
                    })

                if not (1 <= task.complexity_weight <= 4):
                    fields.append({
                        "field": f"stages[{s_idx}].tasks[{t_idx}].complexity_weight",
                        "message": f"complexity_weight phải nằm trong khoảng 1..4 (nhận {task.complexity_weight})"
                    })

                if task.triggers_milestone_order is not None:
                    if task.triggers_milestone_order < 1:
                        fields.append({
                            "field": f"stages[{s_idx}].tasks[{t_idx}].triggers_milestone_order",
                            "message": f"triggers_milestone_order phải >= 1 (nhận {task.triggers_milestone_order})"
                        })
                    elif task.triggers_milestone_order in milestone_orders:
                        fields.append({
                            "field": f"stages[{s_idx}].tasks[{t_idx}].triggers_milestone_order",
                            "message": f"triggers_milestone_order {task.triggers_milestone_order} bị trùng lặp"
                        })
                    else:
                        milestone_orders.add(task.triggers_milestone_order)

        # Kiểm tra depends_on trỏ tới key có trong bản và không tự phụ thuộc
        for s_idx, stage in enumerate(self.stages):
            for t_idx, task in enumerate(stage.tasks):
                for dep in task.depends_on:
                    if dep == task.key:
                        fields.append({
                            "field": f"stages[{s_idx}].tasks[{t_idx}].depends_on",
                            "message": f"Task '{task.key}' không được tự phụ thuộc chính nó"
                        })
                    elif dep not in task_keys:
                        fields.append({
                            "field": f"stages[{s_idx}].tasks[{t_idx}].depends_on",
                            "message": f"Phụ thuộc '{dep}' không tồn tại trong danh sách task"
                        })

        if fields:
            raise AppException(422, "VALIDATION_ERROR", "Dữ liệu cây quy trình không hợp lệ", details={"fields": fields})
