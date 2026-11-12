# Báo cáo TASK-050

## Đã làm
- Hiện thực `POST /api/v1/ai/chat/stream` trả lời dạng SSE với các sự kiện `delta`, `done`, `error`.
- Thêm `chat_stream` vào `LLMClient`, `GeminiClient` (kết nối endpoint `:streamGenerateContent?alt=sse`, nhận `transport` httpx để kiểm thử, xử lý lỗi HTTP ≠ 200 báo 503 `AI_UNAVAILABLE`), và `UnavailableLLMClient`.
- Tạo lớp `StreamRestorer` phục hồi PII qua stream: giữ lại phần đuôi mã giả bị cắt vụn (`K`, `KH`, `KH-`, `KH-\d{1,3}`) và chỉ phát ra phần an toàn đã phục hồi tên thật; bảo đảm không mảnh nào lọt mã giả `KH-xxx`, ghép mọi delta bằng câu trả lời đầy đủ đã phục hồi tên thật.
- Hiện thực `run_ai_agent_stream` trong `agent.py` theo đúng vòng lặp tối đa 5 lượt, tích hợp `StreamRestorer`, thu gom tool calls từng lượt, xử lý fallback xin lỗi nếu hết 5 lượt mà chưa hoàn thành.
- Tái sử dụng và dùng chung logic chuẩn bị phiên chat (đăng ký PII theo phạm vi need-to-know + ghi audit log `AI_QUERY`) giữa `/ai/chat` và `/ai/chat/stream`, không trùng lặp mã nguồn.
- Kiểm tra `UnavailableLLMClient` trả JSON lỗi 503 trước khi mở kết nối SSE.

## File đã tạo/sửa
- `backend/app/services/ai/streaming.py`: Tạo mới lớp `StreamRestorer` phục hồi PII và quản lý bộ đệm stream.
- `backend/app/services/ai/llm.py`: Thêm phương thức `chat_stream` cho protocol `LLMClient`, lớp `GeminiClient` và `UnavailableLLMClient`; tách hàm `_build_payload` và `_parse_parts` dùng chung.
- `backend/app/services/ai/agent.py`: Hiện thực `run_ai_agent_stream`; tách hàm `_append_tool_messages` và `_build_suggested_actions` dùng chung với `run_ai_agent`.
- `backend/app/api/ai.py`: Thêm endpoint `POST /chat/stream` SSE; tách hàm chuẩn bị `_prepare_ai_chat_session` dùng chung giữa 2 endpoint.

## Kết quả tự kiểm
```text
$ bash handoff/tasks/TASK-050-ai-chat-stream/verify.sh
.................                                                        [100%]
17 passed in 230.37s (0:03:50)

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không.
