# Báo cáo TASK-032

## Đã làm
- Hiện thực toàn bộ thư viện hàm thuần trong `frontend/src/lib/notifications.ts`:
  - `badgeText`: trả về `''` khi `n <= 0`, `'1'`..'99', và `'99+'` khi `n >= 100`.
  - `relativeTime`: tính thời gian tương đối hiển thị chính xác các khoảng `< 1 phút` ('Vừa xong'), `1..59 phút` ('N phút trước'), trong ngày ('N giờ trước'), ngày hôm trước ('Hôm qua'), và ngày cũ ('dd/mm/yyyy').
  - `isSafeInternalLink`: bảo vệ điều hướng, chỉ chấp nhận đường dẫn nội bộ bắt đầu bằng `/`, chặn các biến thể nguy hiểm như `//`, `/\`, protocol ngoại vi (`http`, `https`, `javascript:`...).
  - `mergeIncoming`: ghép thông báo mới vào đầu danh sách, bảo đảm tính bất biến (immutability) và loại trừ trùng lặp ID.
- Xây dựng kiểu dữ liệu TypeScript trong `frontend/src/types/notifications.ts` (`NotificationItem`, `NotificationsResponse`, `NotificationsMeta`, `NotificationLiveEvent`) kèm module augmentation cho TanStack Query.
- Hiện thực hook `useNotifications` trong `frontend/src/hooks/use-notifications.ts`:
  - Gọi `GET /notifications?page=1&page_size=20` khởi tạo qua TanStack Query (query key `['notifications']`), không polling.
  - Hỗ trợ tải trang kế tiếp ("Xem thêm") với `page * page_size < total`.
  - Đánh dấu đã đọc `markAsRead` cập nhật lạc quan (optimistic update) giảm `unread_count` ngay lập tức và tự động hoàn tác khi xảy ra lỗi.
  - "Đánh dấu tất cả đã đọc" `markAllAsRead` gọi `POST /notifications/read-all`.
- Hiện thực hook thời gian thực `useNotificationsLive` trong `frontend/src/hooks/use-notifications-live.ts`:
  - Kết nối WebSocket `/ws/notifications` theo giao thức và máy chủ hiện tại (`ws:`/`wss:`).
  - Lắng nghe sự kiện `NOTIFICATION_CREATED`, cập nhật trực tiếp query cache bằng `mergeIncoming` và tăng `unread_count` mà không gọi lại fetch API.
  - Tự động kết nối lại sau 5 giây (tối đa 5 lần) và dọn dẹp kết nối/timer khi unmount.
- Xây dựng component `NotificationBell` trong `frontend/src/components/notifications/notification-bell.tsx`:
  - Nút chuông hiển thị huy hiệu số thông báo chưa đọc thật, ẩn khi `unread_count = 0`, loại bỏ hoàn toàn chấm cam tĩnh cũ.
  - Bảng thả xuống (`role="dialog"`, `aria-label="Thông báo"`) hỗ trợ mở/đóng bằng nút, phím `Escape`, bấm bên ngoài; hoàn trả focus về nút chuông khi đóng.
  - Hiển thị đầy đủ 4 trạng thái giao diện: Loading (`LoadingSkeleton`), Error (`ErrorState` + Thử lại), Empty (`EmptyState`), và danh sách thông báo.
  - Nội dung thông báo hiển thị text thuần, an toàn chống XSS. Bấm dòng chưa đọc: đánh dấu đã đọc, điều hướng an toàn và đóng bảng.
- Tích hợp `NotificationBell` vào thanh điều hướng đầu trang tại `frontend/src/app/(dashboard)/layout.tsx` đúng phạm vi cho phép.
- Đảm bảo tuân thủ đầy đủ quy chuẩn: kebab-case, không dùng `localStorage`/`sessionStorage`, không dùng `dangerouslySetInnerHTML`, không chứa mã định danh đặc tả, không có emoji trong nút bấm.

## File đã tạo/sửa
- `frontend/src/types/notifications.ts`: Định nghĩa kiểu dữ liệu thông báo và module augmentation cho `QueryOptions`.
- `frontend/src/lib/notifications.ts`: Thư viện các hàm thuần tiện ích xử lý huy hiệu, thời gian, kiểm tra link an toàn và trộn danh sách.
- `frontend/src/hooks/use-notifications.ts`: Hook quản lý truy vấn dữ liệu thông báo, phân trang, đánh dấu đã đọc lạc quan.
- `frontend/src/hooks/use-notifications-live.ts`: Hook kết nối WebSocket `/ws/notifications` nhận thông báo theo thời gian thực.
- `frontend/src/components/notifications/notification-bell.tsx`: Component nút chuông và dropdown bảng thông báo trên header.
- `frontend/src/app/(dashboard)/layout.tsx`: Thay thế khối nút thông báo tĩnh có chấm cam bằng `<NotificationBell />`.

## Kết quả tự kiểm
```
=== [1/5] Cài đặt dependencies frontend ===

up to date, audited 495 packages in 3s

170 packages are looking for funding
  run `npm fund` for details

18 vulnerabilities (2 low, 10 moderate, 3 high, 3 critical)

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

 Test Files  70 passed (70)
      Tests  575 passed (575)
   Start at  01:14:53
   Duration  9.15s (transform 2.39s, setup 0ms, collect 11.18s, tests 14.61s, environment 21.26s, prepare 4.94s)

=== [5/5] Build thử nghiệm dự án frontend (Next.js) ===

> frontend@1.0.0 build
> next build

   ▲ Next.js 15.0.4

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types     ✓ Linting and checking validity of types 
   Collecting page data     ✓ Collecting page data 
 ✓ Generating static pages (19/19)
   Collecting build traces     ✓ Collecting build traces 
   Finalizing page optimization     ✓ Finalizing page optimization 

Route (app)                              Size     First Load JS
┌ ○ /                                    9.37 kB         130 kB
├ ○ /_not-found                          896 B           101 kB
├ ○ /account/security                    2.96 kB         124 kB
├ ○ /accounting                          8.46 kB         116 kB
├ ○ /admin/audit-logs                    7.07 kB         115 kB
├ ○ /admin/departments                   5.36 kB         117 kB
├ ○ /admin/holidays                      5.17 kB         116 kB
├ ○ /admin/users                         7.41 kB         128 kB
├ ƒ /admin/users/[id]                    6 kB            126 kB
├ ○ /admin/workflows                     5.4 kB          126 kB
├ ƒ /admin/workflows/[id]                10.3 kB         122 kB
├ ○ /approvals                           5.15 kB         126 kB
├ ○ /cases                               3.39 kB         125 kB
├ ƒ /cases/[id]                          6.92 kB         119 kB
├ ƒ /cases/[id]/finance                  3.12 kB         115 kB
├ ƒ /cases/[id]/tasks                    9.85 kB         121 kB
├ ○ /crm/clients                         6.44 kB         118 kB
├ ƒ /crm/clients/[id]                    4.51 kB         116 kB
├ ○ /crm/opportunities                   6.94 kB         118 kB
├ ○ /finance                             2.59 kB         114 kB
├ ○ /login                               5.66 kB         119 kB
├ ○ /operations/floorplan                8.86 kB         120 kB
└ ○ /settings                            7.13 kB         124 kB
+ First Load JS shared by all            99.9 kB
  ├ chunks/4bd1b696-fd245cfcf7b1c808.js  52.5 kB
  ├ chunks/517-ddaefe06d704aaf8.js       45.5 kB
  └ other shared chunks (total)          1.91 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

=== TẤT CẢ KIỂM TRA ĐÃ ĐẠT CHO TASK-032 ===

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
