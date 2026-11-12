# TASK-051 — Khung chat AI hiện chữ dần theo stream SSE

> Người giao: Claude (Trưởng phòng) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không

## 1. Mục tiêu
Hiện khung chat AI (SCR-14) phải chờ hết câu trả lời mới hiện. Backend thêm `POST /api/v1/ai/chat/stream` (SSE, TASK-050). Chuyển hook `useAiChat` sang endpoint stream để chữ hiện dần.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` mục `POST /api/v1/ai/chat/stream` (sự kiện `delta` / `done` / `error`; lỗi trước stream là JSON thường)
- Test hợp đồng `frontend/tests/ai/use-ai-chat.test.tsx` (docstring đầu file)
- Code hiện có: `frontend/src/hooks/use-ai-chat.ts`, `frontend/src/lib/api-client.ts`, `frontend/src/components/ai/ai-chat-drawer.tsx`, `frontend/src/types/ai.ts`

## 3. Phạm vi file
**Được tạo/sửa:**
- `frontend/src/lib/api-stream.ts` (mới)
- `frontend/src/lib/api-client.ts`: chỉ export lại phần cần dùng chung (dựng URL, header CSRF, `ApiError`, đọc lỗi JSON). Không đổi hành vi `apiFetch`.
- `frontend/src/hooks/use-ai-chat.ts`, `frontend/src/components/ai/ai-chat-drawer.tsx`, `frontend/src/types/ai.ts`

**Test (đã viết, đã khoá):** `frontend/tests/ai/use-ai-chat.test.tsx`, `verify.sh`. Mọi test FE khác phải tiếp tục xanh.
**Không được sửa:** file trong `tests.lock`, `docs/`, `backend/`.

## 4. Thiết kế
- **`apiStream(path, init, onEvent: (event: string, data: unknown) => void): Promise<void>`**
  - Gọi `fetch` với cùng base URL, `credentials: 'include'`, header `X-CSRF-Token` như `apiFetch`, header `Accept: text/event-stream`.
  - Khi phản hồi `!ok`: đọc JSON lỗi → ném `ApiError(status, code, message)`.
  - Khi gặp 401 `UNAUTHENTICATED`/`TOKEN_REVOKED`: gọi `/auth/refresh` một lần rồi thử lại, giống `apiFetch`.
  - Đọc `response.body.getReader()` + `TextDecoder` (`stream: true`). Tách sự kiện theo dòng trống, chấp nhận `\r\n`. Ghép nhiều dòng `data:`, `JSON.parse`. Mảnh bị cắt giữa chừng phải được giữ lại tới mảnh sau.
- **`useAiChat`:** giữ nguyên `UseAiChatResult`.
  - `sendMessage`: thêm tin user, rồi thêm **một** tin assistant `{isPending: true, content: ''}`.
  - Mỗi `delta`: nối vào `content`/`text`/`response_text` của đúng tin đó, theo id.
  - `done`: gắn `suggested_actions`, `isPending: false`; trả `{response_text, suggested_actions}`.
  - `error` event, lỗi HTTP, hoặc stream đóng mà không có `done`/`error`: tin đó thành `isError: true`, `isPending: false`, content là thông điệp lỗi. 429 → "Bạn đã hỏi quá nhiều, thử lại sau ít phút". Mất kết nối → "Kết nối bị gián đoạn, vui lòng thử lại.".
  - `isPending` của hook = true từ lúc gửi tới khi kết thúc (vẫn dùng `useMutation`).
  - `retryLastMessage` làm cùng luồng.
- **Drawer:** bong bóng "Đang soạn câu trả lời…" chỉ hiện khi tin assistant cuối chưa có chữ. Đã có chữ thì hiện chính tin đang stream (giữ `pre-wrap`, hiện dạng text thuần như hiện tại). Nút gửi vẫn khoá khi đang chạy.

## 5. Tiêu chí nghiệm thu (đo được)
- `bash handoff/tasks/TASK-051-fe-ai-chat-stream/verify.sh` xanh: typecheck, lint, toàn bộ vitest.
- Không dùng `EventSource` (chỉ GET, không gửi body/CSRF được).
- Không dùng `dangerouslySetInnerHTML`.

## 6. Bẫy cần tránh
- Không sửa test; không chép lại logic CSRF/refresh mà phải dùng chung với `api-client.ts`.
- Không lưu tin nhắn vào localStorage.
- Không `python3 -c` nhiều dòng; không `rm`/`&&`/`git`/`sed`/`cat`/`grep`. File tạm ở `handoff/tasks/TASK-051-fe-ai-chat-stream/scratch/`.
