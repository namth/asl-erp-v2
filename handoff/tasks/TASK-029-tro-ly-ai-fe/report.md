# Báo cáo TASK-029

## Đã làm
- Hiện thực hàm `isSafeInternalUrl` trong `frontend/src/lib/ai-links.ts`: nhận các đường dẫn tương đối bắt đầu bằng `/` đơn lẻ, từ chối toàn bộ protocol-relative `//`, các scheme nguy hiểm (`http:`, `https:`, `javascript:`, `data:`, `vbscript:`, `blob:`, `mailto:`, `tel:`...) và các nỗ lực bypass bằng backslash.
- Quản lý trạng thái ngăn kéo và phiên hỏi đáp qua Zustand store (`frontend/src/stores/ai-drawer-store.ts`): lưu `isOpen`, `sessionId` (tạo bằng `crypto.randomUUID()`), danh sách `messages` hoàn toàn trong bộ nhớ; tuyệt đối không dùng `localStorage`/`sessionStorage`. Hỗ trợ nút "Cuộc trò chuyện mới" dọn sạch hội thoại và sinh `sessionId` mới.
- Xây dựng hook `useAiChat` (`frontend/src/hooks/use-ai-chat.ts`) tích hợp API `POST /ai/chat` (hoặc `/api/v1/ai/chat`) bằng TanStack Query: gửi header `Accept: application/json`, body `{ message, session_id }`, giữ nguyên `session_id` qua các lượt hỏi đáp; xử lý mã lỗi 429 ("Bạn đã hỏi quá nhiều, thử lại sau ít phút") và hỗ trợ hàm `retryLastMessage` khi gặp lỗi kết nối/500 mà vẫn bảo toàn tin nhắn người dùng.
- Hiện thực giao diện Ngăn kéo Trợ lý AI (`frontend/src/components/ai/ai-chat-drawer.tsx`):
  - Khả năng tiếp cận chuẩn mực: `role="dialog"`, `aria-label="Trợ lý AI"`, tự động focus vào ô nhập khi mở ngăn kéo, hỗ trợ đóng ngăn kéo bằng phím Escape và nút đóng.
  - Trạng thái khởi tạo (Empty state): hiển thị lời chào và 4 câu hỏi gợi ý nghiệp vụ pháp lý, người dùng bấm vào sẽ gửi câu hỏi ngay lập tức.
  - Quy tắc nhập liệu & đếm ký tự: chặn gửi khi ô nhập rỗng hoặc chỉ có khoảng trắng, chặn gửi và vô hiệu hóa nút gửi khi vượt 2000 ký tự (có hiển thị bộ đếm ký tự `length/2000`); nhấn Enter để gửi, Shift+Enter xuống dòng; khi đang chờ phản hồi thì vô hiệu hóa nút gửi và hiển thị bong bóng "Đang soạn câu trả lời…".
  - Bảo mật & hiển thị: câu trả lời giữ nguyên định dạng xuống dòng (`whitespace-pre-wrap`), không sử dụng `dangerouslySetInnerHTML` để phòng chống XSS triệt để; các nút gợi ý điều hướng (`suggested_actions`) được kiểm tra qua `isSafeInternalUrl`, click chuyển trang qua Next.js router (`router.push`) rồi tự động đóng ngăn kéo, URL không an toàn bị loại bỏ hoàn toàn.
  - Xử lý lỗi: hiển thị thông điệp khi gặp 429 và nút "Thử lại" khi gặp lỗi mạng/500.
  - Tuân thủ quy chuẩn: không emoji trong nút bấm, không chuỗi mã đặc tả kỹ thuật, không dùng client storage.
- Tích hợp nút bấm mở Trợ lý AI (`AiChatButton` với biểu tượng Sparkles) vào header của Master Layout và gắn component `<AiChatDrawer />` trong `frontend/src/app/(dashboard)/layout.tsx`.
- Chạy toàn bộ bộ kiểm thử tự động `verify.sh`: cài đặt dependencies, typecheck, lint, vitest (60/60 test files, 480/480 tests xanh, trong đó 34/34 tests AI) và build Next.js thành công 100%.

## File đã tạo/sửa
- `frontend/src/types/ai.ts`: Định nghĩa TypeScript interfaces cho tin nhắn chat, suggested actions, request/response API.
- `frontend/src/lib/ai-links.ts`: Hàm thuần `isSafeInternalUrl` kiểm tra an toàn URL nội bộ.
- `frontend/src/stores/ai-drawer-store.ts`: Store Zustand quản lý trạng thái ngăn kéo, session ID và lịch sử tin nhắn trong bộ nhớ.
- `frontend/src/hooks/use-ai-chat.ts`: Hook gọi API chat bằng TanStack Query, xử lý retry và chuẩn hóa thông báo lỗi.
- `frontend/src/components/ai/ai-chat-button.tsx`: Nút mở Trợ lý AI trên header với icon Sparkles.
- `frontend/src/components/ai/ai-chat-drawer.tsx`: Component ngăn kéo Trợ lý AI hoàn chỉnh (panel, messages, actions, input form).
- `frontend/src/components/ai/index.ts`: Export các component AI.
- `frontend/src/app/(dashboard)/layout.tsx`: Gắn `AiChatButton` vào header và gắn component `<AiChatDrawer />`.

## Kết quả tự kiểm
```text
=== [1/5] Cài đặt dependencies frontend ===
up to date, audited 495 packages in 4s

=== [2/5] Type-check toàn bộ dự án frontend ===
> frontend@1.0.0 typecheck
> tsc --noEmit -p tsconfig.json

=== [3/5] Lint toàn bộ mã nguồn frontend ===
> frontend@1.0.0 lint
> next lint
✔ No ESLint warnings or errors

=== [4/5] Chạy toàn bộ test suite frontend (vitest) ===
> frontend@1.0.0 test
> vitest run
 ✓ tests/ai/ai-chat-drawer.test.tsx (14)
 ✓ tests/ai/ai-drawer-store.test.ts (4)
 ✓ tests/ai/ai-links.test.ts (8)
 ✓ tests/ai/conventions.test.ts (5)
 ✓ tests/ai/use-ai-chat.test.tsx (3)
 ...
 Test Files  60 passed (60)
      Tests  480 passed (480)
   Start at  20:05:18
   Duration  8.18s

=== [5/5] Build thử nghiệm dự án frontend (Next.js) ===
> frontend@1.0.0 build
> next build
   ▲ Next.js 15.0.4
   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types     ✓ Linting and checking validity of types 
   Collecting page data     ✓ Collecting page data 
 ✓ Generating static pages (18/18)
   Collecting build traces     ✓ Collecting build traces 
   Finalizing page optimization     ✓ Finalizing page optimization 

=== TẤT CẢ KIỂM TRA ĐÃ ĐẠT CHO TASK-029 ===

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
