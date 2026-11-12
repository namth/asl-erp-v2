from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from backend.app.core.config import settings
from backend.app.core.errors import AppException


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict


@dataclass
class LLMReply:
    text: str | None
    tool_calls: list[ToolCall]


class LLMClient(Protocol):
    async def chat(self, messages: list[dict], tools: list[dict]) -> LLMReply:
        ...


class GeminiClient:
    def __init__(self, api_key: str, model_name: str = "gemini-2.5-flash") -> None:
        self.api_key = api_key
        self.model_name = model_name

    async def chat(self, messages: list[dict], tools: list[dict]) -> LLMReply:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent"
        headers = {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json",
        }

        system_instruction = None
        contents: list[dict[str, Any]] = []

        for msg in messages:
            role = msg.get("role")
            content = msg.get("content")

            if role == "system":
                if content:
                    system_instruction = {"parts": [{"text": str(content)}]}
            elif role == "user":
                contents.append({"role": "user", "parts": [{"text": str(content or "")}]})
            elif role == "assistant":
                parts: list[dict[str, Any]] = []
                if content:
                    parts.append({"text": str(content)})
                tool_calls = msg.get("tool_calls") or []
                for tc in tool_calls:
                    tc_name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "")
                    tc_args = tc.get("arguments", {}) if isinstance(tc, dict) else getattr(tc, "arguments", {})
                    parts.append({"functionCall": {"name": tc_name, "args": tc_args}})
                if parts:
                    contents.append({"role": "model", "parts": parts})
            elif role == "tool":
                call_id = msg.get("tool_call_id", "")
                contents.append({
                    "role": "user",
                    "parts": [{
                        "functionResponse": {
                            "name": call_id,
                            "response": {"result": str(content or "")},
                        }
                    }],
                })

        body: dict[str, Any] = {"contents": contents}
        if system_instruction:
            body["system_instruction"] = system_instruction

        if tools:
            declarations = []
            for t in tools:
                fd: dict[str, Any] = {
                    "name": t.get("name", ""),
                    "description": t.get("description", ""),
                }
                if "parameters" in t:
                    fd["parameters"] = t["parameters"]
                declarations.append(fd)
            body["tools"] = [{"function_declarations": declarations}]

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(url, headers=headers, json=body)
                if res.status_code != 200:
                    raise AppException(503, "AI_UNAVAILABLE", "Nhà cung cấp LLM không phản hồi")
                data = res.json()
        except AppException:
            raise
        except Exception as e:
            raise AppException(503, "AI_UNAVAILABLE", f"Lỗi kết nối tới LLM: {e}") from e

        candidates = data.get("candidates") or []
        if not candidates:
            return LLMReply(text=None, tool_calls=[])

        first_cand = candidates[0]
        content_obj = first_cand.get("content") or {}
        parts = content_obj.get("parts") or []

        text_parts = [p["text"] for p in parts if "text" in p]
        text_reply = "".join(text_parts) if text_parts else None

        tool_calls_reply: list[ToolCall] = []
        for i, p in enumerate(parts):
            if "functionCall" in p:
                fc = p["functionCall"]
                tool_calls_reply.append(
                    ToolCall(
                        id=f"call_{i}_{uuid.uuid4().hex[:6]}",
                        name=fc.get("name", ""),
                        arguments=fc.get("args") or {},
                    )
                )

        return LLMReply(text=text_reply, tool_calls=tool_calls_reply)


class UnavailableLLMClient:
    """Dùng khi chưa cấu hình khoá LLM: chỉ báo 503 lúc thực sự gọi, để lỗi đầu vào (422) vẫn được báo trước."""

    async def chat(self, messages: list[dict], tools: list[dict]) -> LLMReply:
        raise AppException(503, "AI_UNAVAILABLE", "Trợ lý AI chưa cấu hình khoá LLM")


def get_llm_client() -> LLMClient:
    api_key = getattr(settings, "GEMINI_API_KEY", "")
    if not api_key:
        return UnavailableLLMClient()
    model_name = getattr(settings, "AI_MODEL_NAME", "gemini-2.5-flash")
    return GeminiClient(api_key=api_key, model_name=model_name)
