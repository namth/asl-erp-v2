from __future__ import annotations

import json
from typing import Any, Dict, List, Tuple

from backend.app.services.ai.llm import LLMClient, LLMReply
from backend.app.services.ai.pii_redactor import PiiRedactor
from backend.app.services.ai.tools import AI_TOOLS_SCHEMA, execute_tool

SYSTEM_PROMPT = (
    "Bạn là trợ lý AI thông minh của hãng luật ASL LAW. "
    "Nhiệm vụ của bạn là hỗ trợ tra cứu tiến độ vụ việc và nhiệm vụ công việc. "
    "Hãy luôn sử dụng các công cụ được cung cấp để tra cứu thông tin chính xác. "
    "Tuyệt đối không tự suy diễn hoặc bịa đặt thông tin. Trả lời ngắn gọn, lịch sự, chuyên nghiệp bằng tiếng Việt."
)

FALLBACK_APOLOGY = "Xin lỗi, tôi chưa thể hoàn thành yêu cầu này sau các bước xử lý. Vui lòng thử lại với câu hỏi cụ thể hơn."


async def run_ai_agent(
    user: Dict[str, Any],
    redacted_message: str,
    llm: LLMClient,
    redactor: PiiRedactor,
) -> Tuple[str, List[Dict[str, str]]]:
    """Runs the AI agent loop (up to 5 turns)."""
    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": redacted_message},
    ]

    discovered_cases: List[Tuple[str, str]] = []
    response_text: str | None = None

    for _ in range(5):
        reply: LLMReply = await llm.chat(messages, AI_TOOLS_SCHEMA)

        if reply.tool_calls:
            messages.append({
                "role": "assistant",
                "content": reply.text,
                "tool_calls": [
                    {"id": tc.id, "name": tc.name, "arguments": tc.arguments}
                    for tc in reply.tool_calls
                ],
            })

            for tc in reply.tool_calls:
                res = await execute_tool(
                    user=user,
                    tool_name=tc.name,
                    arguments=tc.arguments,
                    redactor=redactor,
                    discovered_cases=discovered_cases,
                )
                res_json = json.dumps(res, ensure_ascii=False)
                redacted_tool_content = redactor.redact(res_json)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": redacted_tool_content,
                })
        else:
            if reply.text is not None:
                response_text = reply.text
                break

    if response_text is None:
        response_text = FALLBACK_APOLOGY

    final_response_text = redactor.restore(response_text)

    # Build suggested actions from discovered cases (deduplicated)
    seen_case_ids = set()
    suggested_actions: List[Dict[str, str]] = []
    for cid, ccode in discovered_cases:
        if cid not in seen_case_ids:
            seen_case_ids.add(cid)
            suggested_actions.append({
                "label": f"Mở {ccode}",
                "action_url": f"/cases/{cid}",
            })

    return final_response_text, suggested_actions
