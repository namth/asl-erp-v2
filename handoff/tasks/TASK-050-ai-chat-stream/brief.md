# TASK-050 — Trợ lý AI trả lời dạng stream SSE (POST /ai/chat/stream)

> Người giao: Claude (Trưởng phòng) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (dữ liệu khách hàng ra dịch vụ ngoài — DEC-03)

## 1. Mục tiêu
`POST /api/v1/ai/chat` (TASK-047) đã chạy nhưng người dùng phải chờ hết câu trả lời. Thêm `POST /api/v1/ai/chat/stream` trả từng mảnh chữ qua SSE, giữ nguyên mọi bảo đảm của bản thường: phạm vi need-to-know, che PII trước khi gửi LLM, khôi phục tên thật cho người dùng, tối đa 5 lượt, audit `AI_QUERY`. `/ai/chat` giữ nguyên hành vi.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` mục `POST /api/v1/ai/chat/stream` (định dạng sự kiện `delta`/`done`/`error`)
- Test hợp đồng `backend/tests/test_ai_stream.py` — docstring đầu file chốt giao diện
- Code hiện có: `backend/app/api/ai.py`, `backend/app/services/ai/{llm,agent,pii_redactor}.py`

## 3. Phạm vi file
**Được tạo/sửa:**
- `backend/app/services/ai/llm.py`, `backend/app/services/ai/agent.py`, `backend/app/services/ai/streaming.py` (mới, tuỳ chọn)
- `backend/app/api/ai.py`

**Test (đã viết, đã khoá):** `backend/tests/test_ai_stream.py`, `verify.sh`. `backend/tests/test_ai_assistant.py` phải tiếp tục xanh.
**Không được sửa:** file trong `tests.lock`, `docs/`, `frontend/`, `backend/app/services/ai/tools.py`, `pii_redactor.py`, `config.py`, `main.py`, migration.

## 4. Blueprint
- **`llm.py`:**
  - `LLMClient` thêm `chat_stream(messages, tools) -> AsyncIterator[LLMReply]`; mỗi mảnh là `LLMReply(text=<chữ mới hoặc None>, tool_calls=[...])`.
  - `GeminiClient.__init__(api_key, model_name=..., transport: httpx.AsyncBaseTransport | None = None)`: truyền `transport` cho mọi `httpx.AsyncClient` (cả `chat`).
  - `chat_stream`: POST `…/models/{model}:streamGenerateContent?alt=sse`, dùng chung hàm dựng body với `chat` (tách hàm, không chép). Đọc `aiter_lines()`, mỗi dòng `data: {...}` là một mảnh: lấy text parts và `functionCall` như `chat`.
  - HTTP ≠ 200 hoặc lỗi mạng → `AppException(503, "AI_UNAVAILABLE", ...)`. Không ghi log nội dung gửi/nhận.
  - `UnavailableLLMClient.chat_stream` ném 503 như `chat`.
- **Khôi phục khi stream (`streaming.py` hoặc trong `agent.py`):** lớp `StreamRestorer(redactor)`.
  - `feed(text) -> str`: nối vào bộ đệm, trả phần an toàn đã `redactor.restore`. Giữ lại đuôi có thể là đầu của mã giả: khớp `K`, `KH`, `KH-`, `KH-\d{1,3}` ở cuối. Giữ cả `KH-\d{3}` trọn vẹn ở cuối, vì ký tự sau có thể là chữ số.
  - `flush() -> str`: trả phần còn lại đã restore.
  - Bất biến: ghép mọi đầu ra == `redactor.restore(toàn bộ chữ vào)`.
- **`agent.py`:** `async def run_ai_agent_stream(user, redacted_message, llm, redactor) -> AsyncIterator[dict]`, yield `{"type": "delta", "text"}` rồi cuối cùng `{"type": "done", "suggested_actions": [...]}`.
  - Vòng lặp ≤ 5 lượt như `run_ai_agent`. Mỗi lượt: có `chat_stream` thì dùng, không thì gọi `chat` và coi kết quả là một mảnh.
  - Mỗi mảnh text đưa qua `StreamRestorer.feed`; chỉ yield khi khác rỗng.
  - Gom `tool_calls` cả lượt. Có tool call → thêm tin assistant (content = chữ thô của lượt đó) + tin tool như bản thường, rồi sang lượt kế. Không có → dừng.
  - Hết lượt mà chưa dừng → yield delta là `FALLBACK_APOLOGY`. Cuối cùng `flush`.
  - Dùng chung logic dựng tin tool / `suggested_actions` với `run_ai_agent` (tách hàm). `run_ai_agent` giữ chữ ký và kết quả.
- **API `POST /ai/chat/stream`:**
  - Cùng `AIChatRequest`, cùng `get_current_user`, `get_llm_client`. Kiểm tra `UnavailableLLMClient` → 503 JSON **trước** khi trả `StreamingResponse`.
  - Đăng ký PII + audit `AI_QUERY` dùng chung với `/ai/chat`: tách phần chuẩn bị thành hàm, không chép.
  - Trả `StreamingResponse(media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})`.
  - Mỗi sự kiện: `event: <tên>\ndata: <json một dòng, ensure_ascii=False>\n\n`. `done` kèm `session_id`.
  - Bọc generator: `AppException` → `event: error` `{"code", "message"}`. Exception khác → `{"code": "INTERNAL_ERROR", "message": "Đã có lỗi xảy ra"}` (không đưa `str(e)` ra), ghi log bằng `logger.exception` nhưng không log nội dung câu hỏi. Sau `error` thì dừng, không `done`.

## 5. Tiêu chí nghiệm thu (đo được)
- `bash handoff/tasks/TASK-050-ai-chat-stream/verify.sh` xanh (gồm cả `test_ai_assistant.py` cũ).
- Không delta nào chứa `KH-`; ghép delta == câu trả lời đã khôi phục.
- Không chép lại khối đăng ký PII/audit giữa hai endpoint.

## 6. Bẫy cần tránh
- Không gom cả câu trả lời rồi mới gửi một delta: test yêu cầu nhiều mảnh.
- Không nhận biết đang chạy test, không gán đè hàm; không đọc khoá LLM lúc import.
- Không UPDATE/DELETE `audit_logs`; không ghép giá trị vào chuỗi SQL.
- Không sửa test; không `python3 -c` nhiều dòng; không `rm`/`&&`/`git`/`sed`/`cat`/`grep`. File tạm ở `handoff/tasks/TASK-050-ai-chat-stream/scratch/`.
- `verify.sh` chạy DB dùng chung mất 15–30 phút. Chạy ở **tiền cảnh** và chờ kết quả, không bỏ dở.
