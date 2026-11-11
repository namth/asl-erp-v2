# TASK-032 — Trung tâm thông báo trên thanh đầu trang

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không (giao diện; dữ liệu chỉ của chính người dùng do backend lọc)

## 1. Mục tiêu
Nút chuông trên thanh đầu trang hiện số thông báo chưa đọc thật; bấm mở bảng thả xuống liệt kê thông báo, bấm một thông báo → đánh dấu đã đọc và điều hướng; "Đánh dấu tất cả đã đọc"; nhận thông báo mới theo thời gian thực qua WebSocket. Backend làm sau → test dùng `fetch`/`WebSocket` giả lập.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` **§3.10** (toàn bộ), §1.2, §1.3
- `docs/06-database-schema.md` bảng `notifications` (các giá trị `kind`)
- `docs/03-screens-and-ui.md` mục 3 (Master Shell) và 4 trạng thái UI
- Code có sẵn: `frontend/src/lib/api-client.ts`, `frontend/src/lib/format.ts`, `frontend/src/components/ui/`, `frontend/src/app/(dashboard)/layout.tsx` (nút chuông hiện là nút tĩnh có chấm cam cứng), `frontend/src/hooks/use-floorplan-live.ts` (tham khảo cách mở WebSocket theo `window.location`)

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `frontend/src/components/notifications/` (gồm `notification-bell.tsx`)
- `frontend/src/hooks/use-notifications.ts`, `frontend/src/hooks/use-notifications-live.ts`, `frontend/src/types/notifications.ts`, `frontend/src/lib/notifications.ts`
- `frontend/src/app/(dashboard)/layout.tsx` — **chỉ** thay khối `<button … title="Thông báo">…</button>` hiện có bằng `<NotificationBell />` (và import), không đổi gì khác

**Người viết test:** `frontend/tests/notifications/` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; các file khác của `frontend/src` (kể cả `api-client.ts`, `use-floorplan-live.ts`); `backend/`, `docs/`, `prototype/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- `lib/notifications.ts` (hàm thuần):
  - `badgeText(n) → '' | '1'…'99' | '99+'` (0 → rỗng, không hiện huy hiệu).
  - `relativeTime(iso, now: Date) → 'Vừa xong'` (< 1 phút) `| 'N phút trước' | 'N giờ trước'` (< 24 giờ) `| 'Hôm qua' | 'dd/mm/yyyy'`.
  - `isSafeInternalLink(link)` — chỉ nhận đường dẫn bắt đầu bằng `/` và không bắt đầu bằng `//` hay `/\`; từ chối mọi scheme. Link không an toàn → bấm vẫn đánh dấu đã đọc nhưng **không** điều hướng.
  - `mergeIncoming(list, item) → list` mới: thêm lên đầu, bỏ qua nếu trùng `id`, không sửa mảng đầu vào.
- Dữ liệu: TanStack Query `GET /notifications?page=1&page_size=20` (query key `['notifications']`); số chưa đọc lấy từ `meta.unread_count`. Gọi lần đầu khi layout mount (để có số trên huy hiệu), **không** polling định kỳ.
- Bảng thả xuống (`role="dialog"`, `aria-label="Thông báo"`; nút chuông có `aria-label` gồm số chưa đọc, `aria-expanded`): danh sách mới nhất trước; thông báo chưa đọc có nền nhấn + chấm; mỗi dòng: tiêu đề, `body` (tối đa 2 dòng, văn bản thuần — **không** `dangerouslySetInnerHTML`), thời gian `relativeTime`. Bấm dòng chưa đọc → `POST /notifications/{id}/read` (cập nhật lạc quan cache: `read_at`, giảm `unread_count`; lỗi → hoàn tác) rồi `router.push(link)` và đóng bảng; dòng đã đọc → chỉ điều hướng. Nút "Đánh dấu tất cả đã đọc" (ẩn khi `unread_count = 0`) → `POST /notifications/read-all` rồi làm mới. "Xem thêm" khi còn trang (`page * page_size < total`) → tải trang kế, nối vào cuối.
- Esc hoặc bấm ra ngoài → đóng; đóng thì focus trả về nút chuông.
- Thời gian thực: mở `WebSocket` `/ws/notifications` (URL tương đối theo `window.location`, `ws:`/`wss:` theo giao thức trang) khi layout mount; tin nhắn `NOTIFICATION_CREATED` → `mergeIncoming` vào cache (`setQueryData`) và tăng `unread_count` (bỏ qua nếu trùng `id`), **không** gọi lại `fetch`; tin nhắn không phải JSON hoặc `type` khác → bỏ qua, không vỡ. Mất kết nối → thử lại sau 5 giây, tối đa 5 lần rồi dừng (không banner). Unmount → đóng socket, huỷ hẹn giờ thử lại.
- Trạng thái mở/đóng bảng trong component hoặc Zustand; không `localStorage`/`sessionStorage`.
- Đủ Empty ("Bạn chưa có thông báo nào") / Skeleton / Success / ErrorState (lỗi tải → "Không tải được thông báo" + nút "Thử lại") trong bảng thả xuống; Light & Dark.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test)
- [ ] `verify.sh`: `npm --prefix frontend install`, `lint`, `typecheck`, `test`, `build` exit 0; test cũ vẫn xanh.
- [ ] Hàm thuần đúng mọi nhánh: `badgeText` (0, 1, 99, 100), `relativeTime` (dưới 1 phút, phút, giờ, hôm qua, ngày cũ), `isSafeInternalLink` (`/cases/c1` nhận; `//evil.com`, `/\evil.com`, `https://…`, `javascript:…`, rỗng từ chối), `mergeIncoming` (trùng id, không sửa đầu vào).
- [ ] Huy hiệu hiện đúng `unread_count`, ẩn khi 0; không còn chấm cam cứng.
- [ ] Mở/đóng bằng nút, Esc, bấm ra ngoài; focus trả về nút chuông.
- [ ] Bấm thông báo chưa đọc: gọi đúng URL, huy hiệu giảm ngay, điều hướng đúng `link`; link không an toàn không điều hướng; lỗi đánh dấu → hoàn tác.
- [ ] "Đánh dấu tất cả đã đọc" gọi đúng URL và ẩn khi không còn chưa đọc; "Xem thêm" gửi `page=2`.
- [ ] WebSocket: sự kiện mới hiện lên đầu và tăng huy hiệu mà không gọi lại `fetch`; trùng `id` bị bỏ qua; tin nhắn hỏng không vỡ; unmount đóng socket.
- [ ] `body` chứa `<script>` hiện dạng chữ; Empty/Error đúng thông điệp.
- [ ] Không `localStorage`/`sessionStorage`; không `dangerouslySetInnerHTML` trong `components/notifications`; không chuỗi `SCR-`/`TSK-`; không emoji trong nút.

## 6. Ràng buộc & bẫy cần tránh
- Không thêm thư viện. Không đổi gì khác trong `layout.tsx`.
- Chạy test qua `python3 scripts/handoff.py verify TASK-032` hoặc `npm --prefix frontend run test`. Ghi file bằng công cụ ghi file (tự tạo thư mục cha); `mkdir`, `;`, `||`, `|`, `xargs` bị từ chối.
- **Người viết test:** không tạo `declarations.d.ts` khai báo module của code sản phẩm (typecheck đỏ lúc chưa có code là chấp nhận được — kiểm đỏ bằng `vitest`).
