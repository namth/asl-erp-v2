# Báo cáo TASK-016: Màn hình nhật ký kiểm toán (SCR-13)

## Đã làm
- [x] Chạy `python3 scripts/handoff.py verify TASK-016` đạt toàn bộ 5 bước: `install`, `typecheck`, `lint`, `test` (22 files, 151/151 tests pass), `build` (Next.js tạo static pages thành công) exit 0.
- [x] Hook `useAuditLogs` gửi đúng các tham số query (`actor_id`, `actor_type`, `action`, `entity_name`, `entity_id`, `from`, `to`, `page`, `limit`), tự động loại bỏ các tham số rỗng khỏi query string.
- [x] Bộ lọc tìm kiếm đồng bộ 2 chiều với query string của URL; thay đổi bộ lọc tự động quay về trang 1; khôi phục bộ lọc chính xác khi tải lại trang qua URL.
- [x] Bảng dữ liệu hiển thị thời gian định dạng giờ Việt Nam (`dd/MM/yyyy HH:mm:ss`, GMT+7) và hiển thị người thực hiện chính xác theo 3 trường hợp:
  - `actor_type = 'USER'` và có `actor`: hiển thị họ tên `actor.full_name` kèm email.
  - `actor_type = 'SYSTEM'`: hiển thị "Hệ thống".
  - `actor_type = 'USER'` và `actor = null`: hiển thị "Không xác định".
- [x] Ngăn bên xem khác biệt trước-sau (JSON Diff Viewer):
  - Phân loại rõ ràng khoá thêm (xanh), khoá bỏ (đỏ), khoá đổi (vàng, cũ → mới).
  - Hỗ trợ hiển thị JSON lồng nhau theo đường dẫn chấm `a.b.c`.
  - Xử lý an toàn khi `before_state = null` (tạo mới), `after_state = null` (xoá/thu hồi) hoặc cả hai đều null ("Không có dữ liệu thay đổi").
  - Hiển thị mã băm `row_hash` font mono rút gọn 12 ký tự kèm nút sao chép toàn bộ mã băm vào clipboard.
- [x] Huy hiệu toàn vẹn chuỗi băm hỗ trợ đầy đủ 3 trạng thái:
  - `OK`: chuỗi băm toàn vẹn, kèm số dòng đã kiểm (`checked_rows`) và thời gian xác minh (`verified_at`).
  - `BROKEN`: cảnh báo chuỗi băm bị phá vỡ, hiển thị `first_broken_id` kèm nút chuyển tới dòng lỗi.
  - `NEVER_CHECKED`: trạng thái xám chưa kiểm tra.
  - Nút "Kiểm tra ngay" gọi recheck chuỗi băm; xử lý lỗi `429 RATE_LIMITED` hiển thị thông báo "Vừa kiểm tra, thử lại sau ít phút".
- [x] Bảo mật & Bất biến:
  - Không có bất kỳ nút sửa (Edit) hoặc xoá (Delete) nào trong giao diện.
  - Phân quyền RBAC nghiêm ngặt: người dùng không có vai trò `ADMIN` bị chặn và hiển thị `ErrorState` "Không có quyền truy cập".
  - Đáp ứng đầy đủ chuẩn 4 trạng thái giao diện: Loading (Skeleton), Error (ErrorState kèm thử lại), Empty (EmptyState), Success (Bảng dữ liệu).
  - Tuân thủ quy chuẩn: không dùng `localStorage`/`sessionStorage`; không chứa chuỗi mã đặc tả `SCR-` hoặc `TSK-` trong giao diện.

## File đã tạo/sửa
- `frontend/src/types/audit.ts`: Định nghĩa kiểu dữ liệu TypeScript cho nhật ký kiểm toán, bộ lọc, phân trang và trạng thái toàn vẹn chuỗi băm.
- `frontend/src/hooks/use-audit-logs.ts`: Cung cấp các React hook TanStack Query `useAuditLogs`, `useAuditIntegrity`, `useRecheckIntegrity`.
- `frontend/src/components/audit/audit-diff-drawer.tsx`: Ngăn bên/drawer modal xem chi tiết khác biệt dữ liệu (JSON Diff) và sao chép mã băm.
- `frontend/src/components/audit/audit-integrity-badge.tsx`: Huy hiệu hiển thị trạng thái toàn vẹn chuỗi băm và nút kích hoạt kiểm tra lại.
- `frontend/src/components/audit/audit-filters.tsx`: Bộ lọc tìm kiếm theo hành động, loại đối tượng, tên thực thể.
- `frontend/src/components/audit/audit-table.tsx`: Bảng dữ liệu nhật ký kiểm toán, format thời gian GMT+7 và hiển thị người thực hiện.
- `frontend/src/app/(dashboard)/admin/audit-logs/page.tsx`: Màn hình nhật ký kiểm toán hệ thống (SCR-13), kiểm soát truy cập ADMIN, đồng bộ URL và quản lý 4 trạng thái UI.

## Kết quả tự kiểm
```
=== [1/5] Cài đặt dependencies frontend ===

up to date, audited 494 packages in 3s

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

 Test Files  22 passed (22)
      Tests  151 passed (151)
   Start at  13:35:38
   Duration  3.11s (transform 902ms, setup 0ms, collect 3.87s, tests 3.56s, environment 7.37s, prepare 1.60s)

=== [5/5] Build thử nghiệm dự án frontend (Next.js) ===

> frontend@1.0.0 build
> next build

   ▲ Next.js 15.0.4

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types     ✓ Linting and checking validity of types 
   Collecting page data     ✓ Collecting page data 
 ✓ Generating static pages (10/10)
   Collecting build traces     ✓ Collecting build traces 
   Finalizing page optimization     ✓ Finalizing page optimization 

Route (app)                              Size     First Load JS
┌ ○ /                                    1.54 kB         101 kB
├ ○ /_not-found                          896 B           101 kB
├ ○ /admin/audit-logs                    7.07 kB         115 kB
├ ○ /admin/departments                   5.36 kB         117 kB
├ ○ /admin/users                         7.41 kB         128 kB
├ ƒ /admin/users/[id]                    6 kB            126 kB
├ ○ /crm/clients                         6.44 kB         118 kB
├ ƒ /crm/clients/[id]                    4.51 kB         116 kB
├ ○ /crm/opportunities                   6.88 kB         118 kB
└ ○ /login                               3.62 kB         104 kB
+ First Load JS shared by all            99.9 kB
  ├ chunks/4bd1b696-367555c8c7ab8535.js  52.5 kB
  ├ chunks/517-294265c65ddcf286.js       45.5 kB
  └ other shared chunks (total)          1.91 kB

=== TẤT CẢ KIỂM TRA ĐÃ ĐẠT CHO TASK-016 ===

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không.
