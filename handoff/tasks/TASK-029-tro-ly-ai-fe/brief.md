# TASK-029 — Trợ lý AI dạng ngăn kéo (SCR-14)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không (giao diện; phạm vi dữ liệu và che dữ liệu do backend làm)

## 1. Mục tiêu
Mọi nhân sự mở Trợ lý AI từ nút Sparkle trên thanh đầu trang ở bất kỳ trang nào. Ngăn kéo bên phải hiện hội thoại; câu trả lời kèm nút gợi ý điều hướng nội bộ. Backend làm sau → test dùng `fetch` giả lập.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` **§3.6** (`POST /ai/chat`, bản không stream), §1.3
- `docs/02-modules-and-features.md` Phân hệ 7 và dòng "Trợ lý AI" trong ma trận phân quyền; `docs/14-decisions.md` DEC-03
- `docs/03-screens-and-ui.md` dòng SCR-14, mục 3 (Master Shell) và 4 trạng thái UI
- Giao diện mẫu: `prototype/ai-assistant/index.html`
- Code có sẵn: `frontend/src/lib/api-client.ts`, `frontend/src/components/ui/`, `frontend/src/app/(dashboard)/layout.tsx`

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `frontend/src/components/ai/` (gồm `ai-chat-drawer.tsx`, nút mở)
- `frontend/src/hooks/use-ai-chat.ts`, `frontend/src/stores/ai-drawer-store.ts`, `frontend/src/types/ai.ts`, `frontend/src/lib/ai-links.ts`
- `frontend/src/app/(dashboard)/layout.tsx` — **chỉ** thêm nút mở và gắn `<AiChatDrawer />`, không đổi gì khác

**Người viết test:** `frontend/tests/ai/` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; các file khác của `frontend/src`; `backend/`, `docs/`, `prototype/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- Gọi bản **không stream**: `POST /ai/chat` với header `Accept: application/json`, body `{ message, session_id }`. `session_id` sinh một lần khi mở ngăn kéo lần đầu trong phiên trang (`crypto.randomUUID()`), giữ trong bộ nhớ (Zustand), **không** `localStorage`; nút "Cuộc trò chuyện mới" xoá lịch sử và sinh `session_id` mới.
- Trạng thái mở/đóng ngăn kéo và lịch sử tin nhắn trong Zustand (UI state); gọi API bằng TanStack Query `useMutation`.
- `lib/ai-links.ts` (hàm thuần): `isSafeInternalUrl(url)` chỉ nhận đường dẫn tương đối bắt đầu bằng `/` và không bắt đầu bằng `//`, từ chối `http:`, `https:`, `javascript:`, `data:` và mọi scheme khác. `suggested_actions` không an toàn → bỏ qua, không hiện.
- Nút gợi ý điều hướng bằng router Next.js (`router.push`) rồi đóng ngăn kéo.
- `response_text` hiện dạng văn bản thuần, giữ xuống dòng (`white-space: pre-wrap`); **không** dùng `dangerouslySetInnerHTML`.
- Ô nhập: Enter gửi, Shift+Enter xuống dòng; rỗng hoặc chỉ khoảng trắng → không gửi; tối đa 2000 ký tự (đếm ký tự, chặn gửi khi vượt); khi đang chờ trả lời → khoá nút gửi, hiện bong bóng "Đang soạn câu trả lời…".
- Lỗi: `429` → "Bạn đã hỏi quá nhiều, thử lại sau ít phút"; lỗi khác/mạng → bong bóng lỗi kèm nút "Thử lại" gửi lại đúng tin nhắn đó (cùng `session_id`); tin nhắn của người dùng vẫn giữ trong lịch sử.
- Empty: lời chào và 3 câu hỏi gợi ý (bấm vào → gửi luôn). Esc đóng ngăn kéo; ngăn kéo có `role="dialog"`, `aria-label`, focus vào ô nhập khi mở.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test)
- [ ] `verify.sh`: `npm --prefix frontend install`, `lint`, `typecheck`, `test`, `build` exit 0; test cũ vẫn xanh.
- [ ] `isSafeInternalUrl` đúng mọi nhánh (`/cases/c1` nhận; `//evil.com`, `https://…`, `javascript:alert(1)`, `data:…`, chuỗi rỗng từ chối).
- [ ] Mở/đóng bằng nút và Esc; focus vào ô nhập; gửi đúng body và header; cùng `session_id` qua nhiều lượt; "Cuộc trò chuyện mới" đổi `session_id` và xoá lịch sử.
- [ ] Rỗng/khoảng trắng/vượt 2000 ký tự không gửi; Shift+Enter không gửi; đang chờ thì khoá nút gửi.
- [ ] Câu trả lời giữ xuống dòng, chuỗi `<script>` hiện dạng chữ; nút gợi ý an toàn điều hướng và đóng ngăn kéo, URL không an toàn không hiện.
- [ ] `429` đúng thông điệp; lỗi 500 có "Thử lại" gửi lại đúng tin nhắn.
- [ ] Không `localStorage`/`sessionStorage`; không `dangerouslySetInnerHTML` trong `components/ai`; không chuỗi `SCR-`/`TSK-`; không emoji trong nút.

## 6. Ràng buộc & bẫy cần tránh
- Không thêm thư viện markdown/chat. Không đổi gì khác trong `layout.tsx` (TASK-028 làm song song ở trang khác).
- Chạy test qua `python3 scripts/handoff.py verify TASK-029` hoặc `npm --prefix frontend run test`. Ghi file bằng công cụ ghi file (tự tạo thư mục cha); `mkdir`, `;`, `||`, `|`, `xargs` bị từ chối.
