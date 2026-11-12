from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple

import psycopg
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.core.security import get_current_user
from backend.app.db.postgres import engine
from backend.app.services.ai.agent import run_ai_agent, run_ai_agent_stream
from backend.app.services.ai.llm import LLMClient, UnavailableLLMClient, get_llm_client
from backend.app.services.ai.pii_redactor import PiiRedactor
from backend.app.services.audit import log_audit_event
from backend.app.services.cases import get_accessible_case_ids

logger = logging.getLogger(__name__)

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


async def _prepare_ai_chat_session(
    current_user: Dict[str, Any],
    message: str,
    session_id: Optional[str],
) -> Tuple[PiiRedactor, str, str]:
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
    redacted_question = redactor.redact(message)

    # Record AI_QUERY audit event with redacted question
    chat_session_id = session_id or str(uuid.uuid4())
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

    return redactor, redacted_question, chat_session_id


def _sse_event(event_name: str, data: dict[str, Any]) -> str:
    data_json = json.dumps(data, ensure_ascii=False)
    return f"event: {event_name}\ndata: {data_json}\n\n"


@router.post("/chat", response_model=AIChatResponse)
async def ai_chat(
    req: AIChatRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    llm: LLMClient = Depends(get_llm_client),
) -> Dict[str, Any]:
    if isinstance(llm, UnavailableLLMClient):
        # Đầu vào đã hợp lệ (422 báo trước); không tra dữ liệu hay ghi audit khi chưa có LLM.
        raise AppException(503, "AI_UNAVAILABLE", "Trợ lý AI chưa cấu hình khoá LLM")

    redactor, redacted_question, _ = await _prepare_ai_chat_session(
        current_user, req.message, req.session_id
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


@router.post("/chat/stream")
async def ai_chat_stream(
    req: AIChatRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    llm: LLMClient = Depends(get_llm_client),
):
    if isinstance(llm, UnavailableLLMClient):
        # Đầu vào đã hợp lệ (422 báo trước); không tra dữ liệu hay ghi audit khi chưa có LLM.
        raise AppException(503, "AI_UNAVAILABLE", "Trợ lý AI chưa cấu hình khoá LLM")

    redactor, redacted_question, chat_session_id = await _prepare_ai_chat_session(
        current_user, req.message, req.session_id
    )

    async def event_generator():
        try:
            async for item in run_ai_agent_stream(
                user=current_user,
                redacted_message=redacted_question,
                llm=llm,
                redactor=redactor,
            ):
                if item["type"] == "delta":
                    yield _sse_event("delta", {"text": item["text"]})
                elif item["type"] == "done":
                    yield _sse_event("done", {
                        "session_id": chat_session_id,
                        "suggested_actions": item.get("suggested_actions", []),
                    })
        except AppException as ae:
            yield _sse_event("error", {"code": ae.code, "message": ae.message})
        except Exception:
            logger.exception("AI chat stream unexpected error")
            yield _sse_event("error", {"code": "INTERNAL_ERROR", "message": "Đã có lỗi xảy ra"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
