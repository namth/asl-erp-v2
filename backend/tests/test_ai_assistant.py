"""Nghiệm thu: trợ lý AI tra cứu SCR-14 (TSK-13) — TC-AI-01, TC-AI-02.

Hợp đồng: docs/07-api-contracts.md `POST /api/v1/ai/chat` (bản không stream), docs/08-integrations.md §4.
Quyết định bổ sung trong brief TASK-047:
- LLM đi qua dependency `backend.app.services.ai.llm.get_llm_client`; test thay bằng LLM giả qua
  `app.dependency_overrides` và ghi lại MỌI thứ gửi lên LLM (messages + tools).
- Định dạng messages kiểu OpenAI: dict có `role` ∈ system/user/assistant/tool, `content`; tin `tool` có `tool_call_id`.
- `LLMReply(text, tool_calls)`, `ToolCall(id, name, arguments)`; tối đa 5 lượt gọi LLM mỗi câu hỏi.
- Không cấu hình `GEMINI_API_KEY` → `503 AI_UNAVAILABLE`.
"""
import json
import os
import random
import re
import uuid
from datetime import datetime, timedelta, timezone

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/9")

import pytest

from backend.app.core.config import settings
from backend.app.main import app
from backend.app.services.ai.llm import LLMReply, ToolCall, get_llm_client
from backend.tests.test_task_flow import (
    create_test_case,
    create_test_department,
    create_test_matter_type,
    create_test_user,
    db_conn,
    make_auth_client,
    sync_neo4j_graph,
)
from backend.tests.test_reports_api import _task

URL = "/api/v1/ai/chat"
PSEUDO = re.compile(r"KH-\d{3}")


class FakeLLM:
    """LLM giả: `script(messages, tools, call_no) -> LLMReply`; ghi lại toàn bộ request."""

    def __init__(self, script):
        self.script = script
        self.requests: list[str] = []
        self.calls = 0

    async def chat(self, messages, tools):
        self.calls += 1
        self.requests.append(json.dumps({"messages": messages, "tools": tools}, ensure_ascii=False, default=str))
        return self.script(messages, tools, self.calls)


def last_tool_content(messages) -> str:
    tools = [m for m in messages if m.get("role") == "tool"]
    return tools[-1]["content"] if tools else ""


def user_text(messages) -> str:
    return next(m["content"] for m in reversed(messages) if m.get("role") == "user")


_W: dict = {}


def world():
    if _W:
        return _W
    tag = uuid.uuid4().hex[:6]
    now = datetime.now(timezone.utc)
    with db_conn() as conn:
        d = create_test_department(conn, name=f"Phòng AI {tag}")
        mt = create_test_matter_type(conn, d["id"], name=f"Nhãn hiệu AI {tag}")
        cname = f"Công ty TNHH Hoa Sen Vàng {tag}"
        tax = str(random.randint(10**9, 10**10 - 1))
        phone = f"09{random.randint(10**7, 10**8 - 1)}"
        email = f"lienhe.{tag}@hoasenvang.vn"
        address = f"{random.randint(10, 99)} Lý Thái Tổ, Hoàn Kiếm {tag}"
        client_id = str(uuid.uuid4())
        conn.execute("""INSERT INTO clients (id, client_type, name, normalized_name, tax_code, representative_name,
                                             phone, email, address, category_group)
                        VALUES (%s, 'ENTERPRISE', %s, %s, %s, %s, %s, %s, %s, 'VIP')""",
                     (client_id, cname, cname.lower(), tax, f"Nguyễn Đại Diện {tag}", phone, email, address))
        exe = create_test_user(conn, "MANAGER", is_executive=True, full_name=f"Giám đốc AI {tag}")
        a1 = create_test_user(conn, "ATTORNEY", full_name=f"LS An AI {tag}")
        a2 = create_test_user(conn, "ATTORNEY", full_name=f"LS Bình AI {tag}")
        c1 = create_test_case(conn, client_id, mt["id"], d["id"], created_by=exe["id"],
                              title=f"Đăng ký nhãn hiệu cho {cname}")
        c2 = create_test_case(conn, client_id, mt["id"], d["id"], created_by=exe["id"], title=f"Vụ riêng của Bình {tag}")
        s1, s2 = str(uuid.uuid4()), str(uuid.uuid4())
        conn.execute("INSERT INTO case_stages (id, case_id, order_index, name, status) VALUES (%s, %s, 1, %s, 'ACTIVE')",
                     (s1, c1["id"], f"Thẩm định hình thức {tag}"))
        conn.execute("INSERT INTO case_stages (id, case_id, order_index, name, status) VALUES (%s, %s, 1, 'Soạn', 'ACTIVE')",
                     (s2, c2["id"]))
        t = {
            "mine_soon": _task(conn, c1["id"], s1, f"Soạn tờ khai {tag}", "TODO", now + timedelta(days=1), a1["id"]),
            "mine_wip": _task(conn, c1["id"], s1, f"Nộp đơn {tag}", "IN_PROGRESS", now + timedelta(days=2), a1["id"]),
            "mine_overdue": _task(conn, c1["id"], s1, f"Bổ sung uỷ quyền {tag}", "TODO", now - timedelta(days=1), a1["id"]),
            "mine_far": _task(conn, c1["id"], s1, f"Việc xa {tag}", "TODO", now + timedelta(days=10), a1["id"]),
            "mine_done": _task(conn, c1["id"], s1, f"Việc đã xong {tag}", "COMPLETED", now + timedelta(days=1), a1["id"]),
            "other": _task(conn, c2["id"], s2, f"Việc riêng của Bình {tag}", "TODO", now + timedelta(days=1), a2["id"]),
        }
    _W.update(dict(tag=tag, d=d, exe=exe, a1=a1, a2=a2, c1=c1, c2=c2, cname=cname, tax=tax, phone=phone,
                   email=email, address=address, rep=f"Nguyễn Đại Diện {tag}", t=t))
    return _W


async def graph():
    W = world()
    if not W.get("_g"):
        await sync_neo4j_graph(users=[W["exe"], W["a1"], W["a2"]], departments=[W["d"]], cases=[W["c1"], W["c2"]],
                               assignments=[(W["a1"]["id"], W["c1"]["id"], "EXECUTOR"),
                                            (W["a2"]["id"], W["c2"]["id"], "EXECUTOR")])
        W["_g"] = True
    return W


@pytest.fixture
def fake_llm():
    holder = {}

    def install(script):
        holder["llm"] = FakeLLM(script)
        app.dependency_overrides[get_llm_client] = lambda: holder["llm"]
        return holder["llm"]

    yield install
    app.dependency_overrides.pop(get_llm_client, None)


async def ask(user, message, session_id=None):
    body = {"message": message}
    if session_id:
        body["session_id"] = session_id
    async with make_auth_client(user["id"]) as c:
        return await c.post(URL, json=body)


def ok(r) -> dict:
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["success"] is True
    assert isinstance(b["data"]["response_text"], str) and isinstance(b["data"]["suggested_actions"], list)
    return b["data"]


def pii_of(W):
    return [W["cname"], W["tax"], W["phone"], W["email"], W["address"], W["rep"]]


# ---------------------------------------------------------------- TC-AI-01


@pytest.mark.asyncio
async def test_tc_ai_01_task_sap_toi_han_chi_cua_nguoi_hoi(fake_llm):
    W = await graph()

    def script(messages, tools, n):
        if n == 1:
            assert any(t.get("name") == "get_urgent_tasks" for t in tools), "phải khai báo công cụ get_urgent_tasks"
            return LLMReply(text=None, tool_calls=[ToolCall(id="c1", name="get_urgent_tasks", arguments={"days_ahead": 3})])
        return LLMReply(text="Danh sách:\n" + last_tool_content(messages), tool_calls=[])

    llm = fake_llm(script)
    data = ok(await ask(W["a1"], "Hôm nay tôi có task nào?"))
    assert llm.calls == 2
    tool_result = json.loads(llm.requests[1])["messages"]
    content = last_tool_content(tool_result)
    tag = W["tag"]
    for title in (f"Soạn tờ khai {tag}", f"Nộp đơn {tag}", f"Bổ sung uỷ quyền {tag}"):
        assert title in content, f"thiếu task {title}"
        assert title in data["response_text"]
    for title in (f"Việc xa {tag}", f"Việc đã xong {tag}", f"Việc riêng của Bình {tag}"):
        assert title not in content and title not in data["response_text"], f"lộ/thừa task {title}"
    assert W["c1"]["case_code"] in content, "kết quả công cụ có mã vụ việc"
    assert {"label": f"Mở {W['c1']['case_code']}", "action_url": f"/cases/{W['c1']['id']}"} in data["suggested_actions"]
    for req in llm.requests:
        for p in pii_of(W):
            assert p not in req, f"gửi PII lên LLM: {p}"


# ---------------------------------------------------------------- TC-AI-02


@pytest.mark.asyncio
async def test_tc_ai_02_che_pii_khi_gui_llm_va_khoi_phuc_khi_tra_loi(fake_llm):
    W = await graph()
    seen = {}

    def script(messages, tools, n):
        if n == 1:
            seen["question"] = user_text(messages)
            return LLMReply(text=None, tool_calls=[
                ToolCall(id="t1", name="lookup_case_status", arguments={"keyword": W["c1"]["case_code"]})])
        content = last_tool_content(messages)
        codes = PSEUDO.findall(content)
        assert codes, "kết quả công cụ phải dùng mã giả cho tên khách"
        seen["pseudo"] = codes[0]
        return LLMReply(text=f"Vụ việc {W['c1']['case_code']} của {codes[0]} đang ở giai đoạn trong kết quả: {content}",
                        tool_calls=[])

    llm = fake_llm(script)
    q = f"Tiến độ vụ {W['c1']['case_code']} của {W['cname']} thế nào? Liên hệ {W['phone']} hoặc {W['email']}"
    data = ok(await ask(W["a1"], q))
    assert llm.calls == 2
    assert PSEUDO.search(seen["question"]), "tên khách trong câu hỏi phải được thay bằng mã giả"
    assert W["c1"]["case_code"] in seen["question"], "giữ nguyên mã vụ việc"
    for req in llm.requests:
        for p in pii_of(W):
            assert p not in req, f"gửi PII lên LLM: {p}"
    tool_content = last_tool_content(json.loads(llm.requests[1])["messages"])
    assert f"Thẩm định hình thức {W['tag']}" in tool_content, "kết quả công cụ có giai đoạn hiện tại"
    text = data["response_text"]
    assert W["cname"] in text, "câu trả lời khôi phục tên thật"
    assert not PSEUDO.search(text), "không để lọt mã giả cho người dùng"
    assert {"label": f"Mở {W['c1']['case_code']}", "action_url": f"/cases/{W['c1']['id']}"} in data["suggested_actions"]

    with db_conn() as conn:
        rows = conn.execute("""SELECT after_state::text FROM audit_logs
                               WHERE action = 'AI_QUERY' AND actor_id = %s ORDER BY id DESC LIMIT 1""",
                            (W["a1"]["id"],)).fetchall()
    assert rows, "phải ghi audit AI_QUERY"
    logged = rows[0][0]
    assert W["c1"]["case_code"] in logged, "audit lưu câu hỏi đã che"
    for p in pii_of(W):
        assert p not in logged, f"audit lưu câu hỏi chưa che: {p}"


@pytest.mark.asyncio
async def test_cong_cu_khong_lo_vu_viec_ngoai_pham_vi(fake_llm):
    W = await graph()

    def script(messages, tools, n):
        if n == 1:
            return LLMReply(text=None, tool_calls=[
                ToolCall(id="x", name="lookup_case_status", arguments={"keyword": W["c2"]["case_code"]})])
        return LLMReply(text="Kết quả: " + last_tool_content(messages), tool_calls=[])

    llm = fake_llm(script)
    data = ok(await ask(W["a1"], f"Vụ {W['c2']['case_code']} đang thế nào?"))
    for req in llm.requests:
        assert f"Vụ riêng của Bình {W['tag']}" not in req
        assert f"Việc riêng của Bình {W['tag']}" not in req
    assert f"Vụ riêng của Bình {W['tag']}" not in data["response_text"]
    assert all(a["action_url"] != f"/cases/{W['c2']['id']}" for a in data["suggested_actions"])


@pytest.mark.asyncio
async def test_giam_doc_tra_cu_duoc_va_cong_cu_la_khong_lam_hong(fake_llm):
    W = await graph()

    def script(messages, tools, n):
        if n == 1:
            return LLMReply(text=None, tool_calls=[
                ToolCall(id="u", name="xoa_du_lieu", arguments={}),
                ToolCall(id="v", name="lookup_case_status", arguments={"keyword": W["c2"]["case_code"]})])
        return LLMReply(text="Kết quả: " + last_tool_content(messages), tool_calls=[])

    llm = fake_llm(script)
    data = ok(await ask(W["exe"], f"Vụ {W['c2']['case_code']}?"))
    msgs = json.loads(llm.requests[1])["messages"]
    tool_msgs = [m for m in msgs if m.get("role") == "tool"]
    assert {m["tool_call_id"] for m in tool_msgs} == {"u", "v"}, "mỗi tool call có một tin trả lời"
    assert f"Vụ riêng của Bình {W['tag']}" in data["response_text"]


@pytest.mark.asyncio
async def test_gioi_han_so_luot_goi_llm(fake_llm):
    W = await graph()
    llm = fake_llm(lambda m, t, n: LLMReply(text=None, tool_calls=[
        ToolCall(id=f"k{n}", name="get_urgent_tasks", arguments={})]))
    data = ok(await ask(W["a1"], "Lặp mãi"))
    assert llm.calls <= 5
    assert data["response_text"].strip()


@pytest.mark.asyncio
async def test_kiem_tra_dau_vao_xac_thuc_va_chua_cau_hinh_llm():
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
        r = await ask(W["a1"], "xin chào")
        assert r.status_code == 503 and r.json()["error"]["code"] == "AI_UNAVAILABLE", r.text
    finally:
        settings.GEMINI_API_KEY = saved


def test_redactor_thuan():
    from backend.app.services.ai.pii_redactor import PiiRedactor

    r = PiiRedactor()
    r.register_name("Công ty Cổ phần Bình Minh")
    r.register_name("Trần Văn Khách")
    s = ("Công ty Cổ phần Bình Minh (MST 0312345678, CCCD 001203004567) gọi 0987654321 / +84 912 345 678, "
         "mail ketoan@binhminh.com.vn; đại diện Trần Văn Khách. Vụ ASL-2026-TM-0012 hạn 29/10/2026, phí 15.000.000 đ")
    out = r.redact(s)
    for p in ("Bình Minh", "Trần Văn Khách", "0312345678", "001203004567", "0987654321", "912 345 678", "ketoan@binhminh"):
        assert p not in out, p
    assert "ASL-2026-TM-0012" in out and "29/10/2026" in out
    codes = PSEUDO.findall(out)
    assert len(set(codes)) == 2, "mỗi tên một mã giả riêng, ổn định trong request"
    assert r.redact("Trần Văn Khách") == r.redact("Trần Văn Khách")
    assert r.restore(f"Gửi {codes[0]} và {codes[1]}") in (
        "Gửi Công ty Cổ phần Bình Minh và Trần Văn Khách", "Gửi Trần Văn Khách và Công ty Cổ phần Bình Minh")
    r2 = PiiRedactor()
    r2.register_name("Công ty Cổ phần Bình Minh")
    assert "Bình Minh" not in r2.redact("công ty cổ phần bình minh"), "khớp không phân biệt hoa thường"
