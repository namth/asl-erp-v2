# TASK-047 — Backend trợ lý AI tra cứu (TSK-13, SCR-14)

> Người giao: Claude (Trưởng phòng) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (dữ liệu khách hàng ra dịch vụ ngoài — DEC-03; phạm vi need-to-know)

## 1. Mục tiêu
Khung chat AI (`frontend/src/hooks/use-ai-chat.ts`, kiểu `frontend/src/types/ai.ts`) đã có, backend chưa có. Viết `POST /api/v1/ai/chat` (bản không stream) theo `docs/07-api-contracts.md` mục `POST /api/v1/ai/chat` và `docs/08-integrations.md` §4.1–4.3: LLM gọi công cụ, công cụ chạy với quyền người hỏi, mọi thứ gửi lên LLM đã che PII, câu trả lời được khôi phục tên thật.

## 2. Tài liệu bắt buộc đọc
- `docs/08-integrations.md` §4 (đặc biệt §4.2 — 6 quy tắc tối thiểu hoá dữ liệu); `docs/07-api-contracts.md` mục `/ai/chat` + mã lỗi `AI_UNAVAILABLE`
- Test hợp đồng `backend/tests/test_ai_assistant.py` — docstring đầu file có các quyết định giao diện
- Mẫu: `backend/app/api/me.py` (`/me/tasks` — lọc task của tôi), `backend/app/services/cases.py` (chi tiết vụ việc, stage hiện tại), `backend/app/guards/need_to_know.py`, `backend/app/services/audit.py`

## 3. Phạm vi file
**Được tạo/sửa:**
- `backend/app/services/ai/__init__.py`, `backend/app/services/ai/llm.py` (giao diện + client Gemini), `backend/app/services/ai/pii_redactor.py`, `backend/app/services/ai/tools.py`, `backend/app/services/ai/agent.py` (vòng lặp)
- `backend/app/api/ai.py` (router `prefix="/ai"`)
- `backend/app/core/config.py` — chỉ thêm `GEMINI_API_KEY` (mặc định `""`), `AI_MODEL_NAME` (mặc định `"gemini-2.5-flash"`)
- `backend/app/main.py` — chỉ thêm import + `include_router`

**Test (đã viết, đã khoá):** `backend/tests/test_ai_assistant.py`, `verify.sh`.
**Không được sửa:** file trong `tests.lock`, `docs/`, `frontend/`, migration, `backend/app/guards/`.

## 4. Blueprint
- **`llm.py`:** `@dataclass ToolCall(id: str, name: str, arguments: dict)`; `@dataclass LLMReply(text: str | None, tool_calls: list[ToolCall])`; `class LLMClient(Protocol): async def chat(self, messages: list[dict], tools: list[dict]) -> LLMReply`. `get_llm_client()` (dependency FastAPI): đọc `settings.GEMINI_API_KEY` **lúc gọi**; rỗng → `AppException(503, "AI_UNAVAILABLE", …)`; có → `GeminiClient` gọi REST `generateContent` (httpx, timeout 30s, header `x-goog-api-key`, chuyển messages/tools sang `contents`/`functionDeclarations`; lỗi mạng/HTTP → 503 `AI_UNAVAILABLE`). Không ghi log nội dung gửi đi.
- **`tools.py`:** khai báo đúng 2 schema ở `08` §4.3 (dạng `{"name","description","parameters"}`), thực thi với `user`:
  - `get_urgent_tasks(days_ahead=3)`: task `assigned_to = user`, chưa `COMPLETED`, `due_at <= now + days_ahead ngày` (gồm cả quá hạn); trả `case_code`, `case_id`, tiêu đề task, trạng thái, hạn, `is_overdue`.
  - `lookup_case_status(keyword)`: tìm theo `case_code` (không phân biệt hoa thường) hoặc mã giả `KH-xxx` (đổi về khách thật qua redactor rồi lấy các vụ của khách đó); **mỗi vụ** kiểm `verify_need_to_know(user, case, "progress")`, không đạt → bỏ qua như không tồn tại. Trả `case_code`, `case_id`, tiêu đề, tên khách, trạng thái, giai đoạn hiện tại (stage `ACTIVE`/chưa xong có `order_index` nhỏ nhất), tên nhân sự được giao. **Không** trả số tiền, ghi chú, nội dung tài liệu.
  - Tên công cụ lạ / tham số sai → kết quả `{"error": "..."}`, không ném lỗi.
- **`pii_redactor.py`:** `class PiiRedactor`: `register_name(name)` → gán mã `KH-001`, `KH-002`… (ổn định trong một request, khớp không phân biệt hoa thường, ưu tiên tên dài trước); `redact(text)` thay tên đã đăng ký → mã, và theo regex: email, số điện thoại VN (`0`/`+84`, cho phép dấu cách/chấm), MST/CCCD/hộ chiếu (dãy 9–13 chữ số, MST dạng `0123456789-001`) → `[ẨN]`; **không** đụng mã vụ việc `ASL-YYYY-XXX-NNNN` và ngày `dd/mm/yyyy`. `restore(text)` đổi mã → tên thật. Đăng ký tên khách hàng + người đại diện của mọi vụ trong phạm vi người hỏi (vụ được giao/phòng mình lead/mọi vụ nếu Giám đốc — có thể tra thẳng PG theo cùng quy tắc), cùng mọi tên khách xuất hiện trong kết quả công cụ, **trước** khi che câu hỏi. Địa chỉ, SĐT, email, MST của khách trong kết quả công cụ cũng đăng ký như chuỗi cần thay `[ẨN]`.
- **`agent.py`:** messages = `[system (tiếng Việt, yêu cầu dùng công cụ, không bịa), user (đã che)]`; lặp tối đa 5 lượt: gọi LLM → có `tool_calls` thì thêm tin `assistant` (kèm `tool_calls`) + mỗi call một tin `{"role":"tool","tool_call_id","content": redact(json kết quả)}`; có `text` và không tool call → dừng. Hết lượt → câu xin lỗi cố định. `response_text = restore(text)`. `suggested_actions` = mỗi vụ việc xuất hiện trong kết quả công cụ (đã qua guard): `{"label": "Mở <case_code>", "action_url": "/cases/<case_id>"}`, không trùng.
- **API:** body `{message: 1–2000, session_id?}` (422 `VALIDATION_ERROR`); cần đăng nhập; audit `AI_QUERY` (`entity_name='ai_chat'`, `entity_id` = `session_id` hoặc uuid mới, `actor_id` = người hỏi, `after_state = {"question": <câu hỏi đã che>}`). Phản hồi `{"success": true, "data": {"response_text", "suggested_actions"}}`.

## 5. Tiêu chí nghiệm thu (đo được)
- `bash handoff/tasks/TASK-047-ai-assistant-backend/verify.sh` xanh.
- Không chuỗi PII nào (tên khách, người đại diện, MST, SĐT, email, địa chỉ) có trong bất kỳ request gửi LLM hay trong audit.

## 6. Bẫy cần tránh
- Không gửi dữ liệu ngoài phạm vi người hỏi lên LLM rồi "dặn" LLM đừng nói — phải lọc trước khi gửi.
- Không đọc biến môi trường lúc import để chọn client (test đổi `settings` lúc chạy); không gán đè hàm/biến môi trường; không nhận biết đang chạy test.
- Không UPDATE/DELETE `audit_logs`; không ghép giá trị vào chuỗi SQL.
- Không sửa test; không `python3 -c` nhiều dòng; không `rm`/`&&`/`git`/`sed`/`cat`/`grep`. File tạm ở `handoff/tasks/TASK-047-ai-assistant-backend/scratch/`.
