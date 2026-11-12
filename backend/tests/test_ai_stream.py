"""Nghiệm thu: trợ lý AI trả lời dạng stream SSE — `POST /api/v1/ai/chat/stream` (TASK-050).

Hợp đồng: docs/07-api-contracts.md mục `POST /api/v1/ai/chat/stream`. Quyết định giao diện:
- `LLMClient` có thêm `chat_stream(messages, tools)` — async iterator các `LLMReply` từng mảnh (text là phần chữ
  mới, tool_calls là lời gọi công cụ xuất hiện trong mảnh đó). LLM chỉ có `chat` (không có `chat_stream`) vẫn dùng
  được: coi cả câu trả lời là một mảnh.
- Sự kiện SSE: `event: delta` data `{"text"}` · `event: done` data `{"session_id","suggested_actions"}` ·
  `event: error` data `{"code","message"}` (lỗi sau khi đã bắt đầu stream; không có `done`).
- Ghép mọi `delta` = câu trả lời đã khôi phục tên thật; không mảnh nào chứa mã giả `KH-xxx`, kể cả khi LLM cắt mã
  giả ra nhiều mảnh.
- `GeminiClient(api_key, model_name, transport=None)`: `transport` (httpx) chỉ để test; stream qua
  `:streamGenerateContent?alt=sse`.
"""
import json
import os

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/12")

import httpx
import pytest

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.main import app
from backend.app.services.ai.llm import GeminiClient, LLMReply, ToolCall, get_llm_client
from backend.tests.test_ai_assistant import PSEUDO, FakeLLM, graph, last_tool_content, pii_of
from backend.tests.test_task_flow import db_conn, make_auth_client

URL = "/api/v1/ai/chat/stream"


class FakeStreamLLM:
    """`script(messages, tools, call_no) -> list[LLMReply | Exception]` — các mảnh lần lượt được yield."""

    def __init__(self, script):
        self.script = script
        self.requests: list[str] = []
        self.calls = 0

    async def chat(self, messages, tools):  # pragma: no cover - không được dùng khi đã có chat_stream
        raise AssertionError("endpoint stream phải gọi chat_stream khi LLM có hàm này")

    async def chat_stream(self, messages, tools):
        self.calls += 1
        self.requests.append(json.dumps({"messages": messages, "tools": tools}, ensure_ascii=False, default=str))
        for piece in self.script(messages, tools, self.calls):
            if isinstance(piece, Exception):
                raise piece
            yield piece


@pytest.fixture
def install_llm():
    def install(llm):
        app.dependency_overrides[get_llm_client] = lambda: llm
        return llm

    yield install
    app.dependency_overrides.pop(get_llm_client, None)


def parse_sse(body: str) -> list[tuple[str, dict]]:
    out = []
    for block in body.replace("\r\n", "\n").split("\n\n"):
        if not block.strip():
            continue
        ev, data = "message", []
        for line in block.split("\n"):
            if line.startswith("event:"):
                ev = line[6:].strip()
            elif line.startswith("data:"):
                data.append(line[5:].lstrip())
        out.append((ev, json.loads("\n".join(data))))
    return out


async def stream(user, message, session_id=None):
    body = {"message": message}
    if session_id:
        body["session_id"] = session_id
    async with make_auth_client(user["id"]) as c:
        r = await c.post(URL, json=body)
    return r


def sse_ok(r) -> list[tuple[str, dict]]:
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/event-stream"), r.headers["content-type"]
    assert "no-cache" in r.headers.get("cache-control", "")
    return parse_sse(r.text)


def deltas(events) -> list[str]:
    return [d["text"] for e, d in events if e == "delta"]


# ------------------------------------------------------------------ luồng chính


@pytest.mark.asyncio
async def test_stream_tung_manh_che_pii_va_khoi_phuc_ma_gia_bi_cat(install_llm):
    W = await graph()
    code = W["c1"]["case_code"]
    seen = {}

    def script(messages, tools, n):
        if n == 1:
            return [LLMReply(text=None, tool_calls=[ToolCall(id="t1", name="lookup_case_status",
                                                             arguments={"keyword": code})])]
        p = PSEUDO.findall(last_tool_content(messages))[0]
        seen["p"] = p
        parts = [f"Vụ {code} của ", p[:2], p[2:5], " đang xử lý; liên hệ ", p[:5], p[5:]]
        return [LLMReply(text=s, tool_calls=[]) for s in parts]

    llm = install_llm(FakeStreamLLM(script))
    r = await stream(W["a1"], f"Tiến độ vụ {code} của {W['cname']}? Gọi {W['phone']}", session_id="sess-stream-01")
    events = sse_ok(r)
    assert llm.calls == 2
    names = [e for e, _ in events]
    assert names[-1] == "done" and names.count("done") == 1 and "error" not in names
    assert all(e in ("delta", "done") for e in names)
    ds = deltas(events)
    assert len(ds) >= 2, "phải gửi nhiều mảnh, không gom cả câu thành một delta"
    for d in ds:
        assert not PSEUDO.search(d) and "KH-" not in d, f"lọt mã giả ra người dùng: {d!r}"
    assert "".join(ds) == f"Vụ {code} của {W['cname']} đang xử lý; liên hệ {W['cname']}"
    done = events[-1][1]
    assert done["session_id"] == "sess-stream-01"
    assert {"label": f"Mở {code}", "action_url": f"/cases/{W['c1']['id']}"} in done["suggested_actions"]
    for req in llm.requests:
        for p in pii_of(W):
            assert p not in req, f"gửi PII lên LLM: {p}"
    with db_conn() as conn:
        rows = conn.execute("""SELECT entity_name, after_state::text FROM audit_logs
                               WHERE action = 'AI_QUERY' AND entity_id = %s""", ("sess-stream-01",)).fetchall()
    assert rows and rows[-1][0] == "ai_chat", "phải ghi audit AI_QUERY với entity_id = session_id"
    for p in pii_of(W):
        assert p not in rows[-1][1], f"audit lưu câu hỏi chưa che: {p}"


@pytest.mark.asyncio
async def test_stream_khong_lo_vu_viec_ngoai_pham_vi(install_llm):
    W = await graph()

    def script(messages, tools, n):
        if n == 1:
            return [LLMReply(text=None, tool_calls=[ToolCall(id="x", name="lookup_case_status",
                                                            arguments={"keyword": W["c2"]["case_code"]})])]
        return [LLMReply(text="Kết quả: ", tool_calls=[]), LLMReply(text=last_tool_content(messages), tool_calls=[])]

    llm = install_llm(FakeStreamLLM(script))
    events = sse_ok(await stream(W["a1"], f"Vụ {W['c2']['case_code']}?"))
    text = "".join(deltas(events))
    for req in llm.requests:
        assert f"Vụ riêng của Bình {W['tag']}" not in req
    assert f"Vụ riêng của Bình {W['tag']}" not in text
    assert all(a["action_url"] != f"/cases/{W['c2']['id']}" for a in events[-1][1]["suggested_actions"])


@pytest.mark.asyncio
async def test_stream_dung_duoc_llm_chi_co_chat(install_llm):
    W = await graph()
    llm = install_llm(FakeLLM(lambda m, t, n: LLMReply(text="Chào bạn, tôi giúp gì được?", tool_calls=[])))
    events = sse_ok(await stream(W["a1"], "xin chào"))
    assert llm.calls == 1
    assert "".join(deltas(events)) == "Chào bạn, tôi giúp gì được?"
    assert events[-1][0] == "done" and events[-1][1]["suggested_actions"] == []
    assert isinstance(events[-1][1]["session_id"], str) and events[-1][1]["session_id"]


@pytest.mark.asyncio
async def test_stream_loi_llm_giua_chung_tra_su_kien_error(install_llm):
    W = await graph()

    def script(messages, tools, n):
        if n == 1:
            return [LLMReply(text="Đang tra cứu… ", tool_calls=[]),
                    LLMReply(text=None, tool_calls=[ToolCall(id="g", name="get_urgent_tasks", arguments={})])]
        return [AppException(503, "AI_UNAVAILABLE", "Nhà cung cấp LLM không phản hồi")]

    install_llm(FakeStreamLLM(script))
    events = sse_ok(await stream(W["a1"], "Việc gấp?"))
    names = [e for e, _ in events]
    assert "Đang tra cứu… " in deltas(events), "chữ đi kèm lượt gọi công cụ vẫn được stream"
    assert names[-1] == "error" and "done" not in names
    assert events[-1][1]["code"] == "AI_UNAVAILABLE" and events[-1][1]["message"]


@pytest.mark.asyncio
async def test_stream_loi_bat_ngo_khong_lo_chi_tiet(install_llm):
    W = await graph()
    install_llm(FakeStreamLLM(lambda m, t, n: [RuntimeError(f"secret-trace {W['cname']}")]))
    events = sse_ok(await stream(W["a1"], "xin chào"))
    assert events[-1][0] == "error" and "done" not in [e for e, _ in events]
    assert events[-1][1]["code"] == "INTERNAL_ERROR"
    assert "secret-trace" not in json.dumps(events, ensure_ascii=False)


@pytest.mark.asyncio
async def test_stream_gioi_han_5_luot(install_llm):
    W = await graph()
    llm = install_llm(FakeStreamLLM(lambda m, t, n: [
        LLMReply(text=None, tool_calls=[ToolCall(id=f"k{n}", name="get_urgent_tasks", arguments={})])]))
    events = sse_ok(await stream(W["a1"], "Lặp mãi"))
    assert llm.calls == 5
    assert "".join(deltas(events)).strip(), "hết lượt vẫn phải có câu trả lời (xin lỗi)"
    assert events[-1][0] == "done"


@pytest.mark.asyncio
async def test_stream_dau_vao_xac_thuc_va_chua_cau_hinh_llm():
    W = await graph()
    async with make_auth_client(W["a1"]["id"]) as c:
        for body in ({}, {"message": ""}, {"message": "x" * 2001}):
            r = await c.post(URL, json=body)
            assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR", body
        c.headers.pop("Authorization", None)
        c.cookies.clear()
        r = await c.post(URL, json={"message": "xin chào"})
        assert r.status_code == 401
    saved = getattr(settings, "GEMINI_API_KEY", None)
    settings.GEMINI_API_KEY = ""
    try:
        r = await stream(W["a1"], "xin chào")
        assert r.status_code == 503 and r.json()["error"]["code"] == "AI_UNAVAILABLE", r.text
    finally:
        settings.GEMINI_API_KEY = saved


# ------------------------------------------------------------------ client Gemini (không cần DB)


def _sse(*objs) -> bytes:
    return "".join(f"data: {json.dumps(o, ensure_ascii=False)}\r\n\r\n" for o in objs).encode()


@pytest.mark.asyncio
async def test_gemini_chat_stream_doc_tung_manh_sse():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["alt"] = request.url.params.get("alt")
        seen["key"] = request.headers.get("x-goog-api-key")
        seen["body"] = json.loads(request.content)
        body = _sse(
            {"candidates": [{"content": {"role": "model", "parts": [{"text": "Xin "}]}}]},
            {"candidates": [{"content": {"role": "model", "parts": [{"text": "chào"}]}}]},
            {"candidates": [{"content": {"role": "model", "parts": [
                {"functionCall": {"name": "get_urgent_tasks", "args": {"days_ahead": 2}}}]}}]},
        )
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, content=body)

    client = GeminiClient(api_key="khoa-gia-test", model_name="mo-hinh-test", transport=httpx.MockTransport(handler))
    chunks = [c async for c in client.chat_stream(
        [{"role": "system", "content": "sys"}, {"role": "user", "content": "hỏi"}],
        [{"name": "get_urgent_tasks", "description": "d", "parameters": {"type": "object", "properties": {}}}])]
    assert seen["path"].endswith("/models/mo-hinh-test:streamGenerateContent") and seen["alt"] == "sse"
    assert seen["key"] == "khoa-gia-test"
    assert seen["body"]["contents"][0]["parts"][0]["text"] == "hỏi"
    assert "".join(c.text or "" for c in chunks) == "Xin chào"
    assert len([c for c in chunks if c.text]) == 2, "mỗi sự kiện SSE của Gemini là một mảnh"
    calls = [tc for c in chunks for tc in c.tool_calls]
    assert len(calls) == 1 and calls[0].name == "get_urgent_tasks" and calls[0].arguments == {"days_ahead": 2}
    assert calls[0].id


@pytest.mark.asyncio
async def test_gemini_chat_stream_loi_http_bao_503():
    client = GeminiClient(api_key="k", model_name="m",
                          transport=httpx.MockTransport(lambda req: httpx.Response(500, content=b"boom")))
    with pytest.raises(AppException) as ei:
        async for _ in client.chat_stream([{"role": "user", "content": "x"}], []):
            pass
    assert ei.value.status_code == 503 and ei.value.code == "AI_UNAVAILABLE"
