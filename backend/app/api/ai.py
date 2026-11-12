from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

import psycopg
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text

from backend.app.core.config import settings
from backend.app.core.security import get_current_user
from backend.app.db.postgres import engine
from backend.app.services.ai.agent import run_ai_agent
from backend.app.core.errors import AppException
from backend.app.services.ai.llm import LLMClient, UnavailableLLMClient, get_llm_client
from backend.app.services.ai.pii_redactor import PiiRedactor
from backend.app.services.audit import log_audit_event
from backend.app.services.cases import get_accessible_case_ids

router = APIRouter(prefix="/ai", tags=["AI Assistant"])


class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    session_id: Optional[str] = None


class SuggestedAction(BaseModel):
    label: str
    action_url: str


class AIChatResponseData(BaseModel):
    response_text: str
    suggested_actions: List[SuggestedAction]


class AIChatResponse(BaseModel):
    success: bool = True
    data: AIChatResponseData


@router.post("/chat", response_model=AIChatResponse)
async def ai_chat(
    req: AIChatRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    llm: LLMClient = Depends(get_llm_client),
) -> Dict[str, Any]:
    if isinstance(llm, UnavailableLLMClient):
        # Đầu vào đã hợp lệ (422 báo trước); không tra dữ liệu hay ghi audit khi chưa có LLM.
        raise AppException(503, "AI_UNAVAILABLE", "Trợ lý AI chưa cấu hình khoá LLM")
    redactor = PiiRedactor()

    # Pre-register in-scope client names and PII details into redactor
    accessible_case_ids = await get_accessible_case_ids(current_user)
    async with engine.connect() as conn:
        if accessible_case_ids is None:
            # Executive or Accountant: access to all clients
            sql = text("""
                SELECT DISTINCT cl.name, cl.representative_name,
                       cl.tax_code, cl.phone, cl.email, cl.address
                FROM clients cl
            """)
            res = await conn.execute(sql)
            rows = res.fetchall()
        elif len(accessible_case_ids) > 0:
            sql = text("""
                SELECT DISTINCT cl.name, cl.representative_name,
                       cl.tax_code, cl.phone, cl.email, cl.address
                FROM cases c
                JOIN clients cl ON c.client_id = cl.id
                WHERE c.id = ANY(:cids)
            """)
            res = await conn.execute(sql, {"cids": [uuid.UUID(x) for x in accessible_case_ids]})
            rows = res.fetchall()
        else:
            rows = []

        for row in rows:
            if row.name:
                redactor.register_name(row.name)
            if row.representative_name:
                redactor.register_name(row.representative_name)
            if row.tax_code:
                redactor.register_hidden(row.tax_code)
            if row.phone:
                redactor.register_hidden(row.phone)
            if row.email:
                redactor.register_hidden(row.email)
            if row.address:
                redactor.register_hidden(row.address)

    # Redact user question before sending to LLM and audit
    redacted_question = redactor.redact(req.message)

    # Record AI_QUERY audit event with redacted question
    chat_session_id = req.session_id or str(uuid.uuid4())
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as sync_conn:
        log_audit_event(
            conn=sync_conn,
            actor_type="USER",
            action="AI_QUERY",
            entity_name="ai_chat",
            entity_id=chat_session_id,
            actor_id=str(current_user["id"]),
            after_state={"question": redacted_question},
        )

    # Run AI agent loop
    response_text, suggested_actions = await run_ai_agent(
        user=current_user,
        redacted_message=redacted_question,
        llm=llm,
        redactor=redactor,
    )

    return {
        "success": True,
        "data": {
            "response_text": response_text,
            "suggested_actions": suggested_actions,
        },
    }
