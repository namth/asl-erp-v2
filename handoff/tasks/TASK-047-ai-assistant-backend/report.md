# Báo cáo TASK-047

## Đã làm
- Hiện thực hoá trọn vẹn endpoint `POST /api/v1/ai/chat` (phiên bản không stream) theo hợp đồng `docs/07-api-contracts.md` mục `/ai/chat` và `docs/08-integrations.md` §4.1–4.3.
- Xây dựng tầng LLM Client (`backend/app/services/ai/llm.py`) với các dataclass `ToolCall`, `LLMReply`, giao thức `LLMClient` và dependency `get_llm_client()`; hỗ trợ gọi Gemini REST API `generateContent` (httpx timeout 30s, header `x-goog-api-key`, xử lý lỗi 503 `AI_UNAVAILABLE`, không log nội dung chat).
- Xây dựng bộ lọc khử nhận dạng dữ liệu `PiiRedactor` (`backend/app/services/ai/pii_redactor.py`) tự động gán mã giả `KH-001`, `KH-002`... cho tên khách hàng và người đại diện, che số điện thoại, email, MST/CCCD/hộ chiếu thành `[ẨN]` trước khi gửi lên LLM hoặc lưu vào audit log; giữ nguyên mã vụ việc `ASL-YYYY-XXX-NNNN` và ngày tháng; khôi phục tên thật khi trả về cho người dùng.
- Định nghĩa 2 công cụ AI chuẩn (`backend/app/services/ai/tools.py`): `get_urgent_tasks` (quét deadline task cá nhân sắp tới hạn/quá hạn) và `lookup_case_status` (tra cứu thông tin tiến độ vụ việc qua mã vụ việc hoặc mã giả khách hàng). Từng vụ việc đều được kiểm tra nghiêm ngặt qua cổng `verify_need_to_know(user, case, "progress")`, loại bỏ các vụ ngoài phạm vi quyền hạn và không tiết lộ thông tin tài chính/tài liệu mật.
- Cài đặt vòng lặp tác tử `run_ai_agent` (`backend/app/services/ai/agent.py`) lặp tối đa 5 lượt gọi LLM, xử lý đa cuộc gọi công cụ, sinh danh sách hành động đề xuất `suggested_actions` mở các vụ việc được đề cập.
- Ghi nhật ký kiểm toán bất biến `AI_QUERY` với câu hỏi đã che PII.
- Khai báo route `ai_router` tại `backend/app/api/ai.py`, đăng ký vào FastAPI app tại `backend/app/main.py`.
- Tự kiểm tra `verify.sh` đạt 100% (8/8 test cases passed, khoá test nguyên vẹn).

## File đã tạo/sửa
- `backend/app/services/ai/__init__.py`: Khởi tạo package AI Assistant services.
- `backend/app/services/ai/llm.py`: Khai báo ToolCall, LLMReply, LLMClient protocol, GeminiClient REST và FastAPI dependency `get_llm_client()`.
- `backend/app/services/ai/pii_redactor.py`: Lớp `PiiRedactor` mã hoá và khôi phục PII (tên khách hàng, MST, SĐT, email, CCCD, địa chỉ).
- `backend/app/services/ai/tools.py`: Khai báo 2 tool schemas và hàm thực thi kiểm tra quyền Need-to-Know `get_urgent_tasks` và `lookup_case_status`.
- `backend/app/services/ai/agent.py`: Vòng lặp tác tử (Agent loop) tối đa 5 lượt, tích hợp công cụ và gợi ý `suggested_actions`.
- `backend/app/api/ai.py`: Router `POST /api/v1/ai/chat` xác thực người dùng, che PII, ghi audit `AI_QUERY` và gọi agent.
- `backend/app/core/config.py`: Thêm cấu hình `GEMINI_API_KEY` và `AI_MODEL_NAME`.
- `backend/app/main.py`: Include `ai_router` vào ứng dụng FastAPI với prefix `/api/v1`.

## Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-047-ai-assistant-backend/verify.sh
........                                                                 [100%]
8 passed in 108.58s (0:01:48)

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không.
