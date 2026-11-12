# Báo cáo TASK-051

## Đã làm
- Tạo tiện ích `apiStream(path, init, onEvent)` trong `frontend/src/lib/api-stream.ts` sử dụng `fetch` và `ReadableStream` reader (không dùng `EventSource`), tự động gắn base URL, `credentials: 'include'`, `Accept: text/event-stream`, CSRF token từ cookie, đọc và ghép các mảnh byte UTF-8 theo stream kể cả khi bị cắt ngang hoặc dùng CRLF.
- Xử lý 401 unauthenticated bằng cách tự động refresh token qua `/auth/refresh` một lần và thử lại stream như `apiFetch`.
- Cập nhật `frontend/src/lib/api-client.ts` để export các hàm dùng chung: `buildApiUrl`, `getCsrfTokenFromCookie`, `parseErrorResponse` mà không làm thay đổi hành vi của `apiFetch`.
- Chuyển hook `useAiChat` sang stream SSE tại `/ai/chat/stream`, nối chữ dần vào đúng MỘT tin assistant duy nhất theo `delta`, gắn `suggested_actions` khi nhận `done`, xử lý lỗi 429 ("Bạn đã hỏi quá nhiều, thử lại sau ít phút"), lỗi máy chủ và mất kết nối ("Kết nối bị gián đoạn, vui lòng thử lại."), hỗ trợ `retryLastMessage` cùng luồng.
- Cập nhật `AiChatDrawer` trong `frontend/src/components/ai/ai-chat-drawer.tsx`: bong bóng "Đang soạn câu trả lời…" chỉ hiển thị khi tin assistant cuối chưa có chữ; khi đã bắt đầu stream chữ thì hiển thị nội dung trực tiếp dạng văn bản thuần với `pre-wrap` (không dùng `dangerouslySetInnerHTML`), khoá nút gửi trong suốt quá trình stream.
- Chạy toàn bộ verify tự động thành công 100% (typecheck, lint, 82/82 vitest test files với 739/739 tests pass).

## File đã tạo/sửa
- `frontend/src/lib/api-stream.ts`: Hàm gọi SSE stream bằng `fetch`, phân giải event SSE theo chuẩn RFC và xử lý refresh token 401.
- `frontend/src/lib/api-client.ts`: Export thêm `buildApiUrl`, `getCsrfTokenFromCookie`, `parseErrorResponse` dùng chung.
- `frontend/src/types/ai.ts`: Bổ sung các kiểu dữ liệu sự kiện stream AI (`AiStreamDeltaEvent`, `AiStreamDoneEvent`, `AiStreamErrorEvent`).
- `frontend/src/hooks/use-ai-chat.ts`: Cập nhật hook `useAiChat` tương thích endpoint SSE `/ai/chat/stream` và cập nhật state store phản hồi từng `delta`.
- `frontend/src/components/ai/ai-chat-drawer.tsx`: Điều chỉnh điều kiện hiển thị bong bóng "Đang soạn câu trả lời…" và tin nhắn stream theo brief mục 4.

## Kết quả tự kiểm
```text
$ bash handoff/tasks/TASK-051-fe-ai-chat-stream/verify.sh

> frontend@1.0.0 typecheck
> tsc --noEmit -p tsconfig.json


> frontend@1.0.0 lint
> next lint

✔ No ESLint warnings or errors

> frontend@1.0.0 test
> vitest run

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.5 /Users/namtran/Local Sites/agy-worktrees/TASK-051/frontend

 ✓ tests/ai/ai-chat-drawer.test.tsx (14)
 ✓ tests/ai/ai-drawer-store.test.ts (4)
 ✓ tests/ai/ai-links.test.ts (8)
 ✓ tests/ai/conventions.test.ts (5)
 ✓ tests/ai/use-ai-chat.test.tsx (10)

 Test Files  82 passed (82)
      Tests  739 passed (739)
   Start at  23:49:28
   Duration  53.76s (transform 12.97s, setup 0ms, collect 62.84s, tests 90.29s, environment 138.07s, prepare 27.63s)

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
