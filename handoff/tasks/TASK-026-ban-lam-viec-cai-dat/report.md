# Báo cáo TASK-026: Bàn làm việc cá nhân & Cài đặt (SCR-02, SCR-20)

## Đã làm
- [x] `verify.sh`: `npm --prefix frontend install`, `typecheck`, `lint`, `test`, `build` đều exit 0; toàn bộ test cũ và mới đều xanh (55 test files, 446 passed).
- [x] ATTORNEY / MANAGER: Hiển thị 4 thẻ KPI đếm đúng từ `summary` (`GET /me/tasks`), Quá hạn có cảnh báo màu đỏ khi > 0; bộ lọc nhanh gửi đúng `due=` (`overdue`, `today`, `week`); hiển thị danh sách nhiệm vụ liên kết `/cases/{case.id}/tasks`; khối "Chờ tôi duyệt" (tối đa 5 mục, link `/approvals`); khối "Vụ việc của tôi" (5 vụ việc từ `GET /cases?mine=true`).
- [x] ACCOUNTANT: Hiển thị khối "Đợt thu chờ xác nhận" với dữ liệu từ `GET /accounting/inbox`, liên kết `/accounting`; không gọi `/me/tasks`; không có khối duyệt task.
- [x] ADMIN: Hiển thị các lối tắt quản trị (Người dùng, Quy trình, Nhật ký kiểm toán, Cài đặt hệ thống, Lịch nghỉ lễ); không gọi các API nghiệp vụ vụ việc (`/me/tasks`, `/cases`).
- [x] Resilience & UI 4-states: Mỗi khối trên dashboard và trang cài đặt có Skeleton riêng biệt khi đang tải dữ liệu; khi một khối gặp lỗi (ví dụ 500), chỉ khối đó hiển thị ErrorState kèm nút "Thử lại", các khối khác vẫn hiển thị bình thường; hiển thị EmptyState khi dữ liệu trống.
- [x] Cài đặt (SCR-20):
  - Thẻ "Tài khoản của tôi": Hiển thị họ tên, email, vai trò, liên kết tới trang bảo mật mật khẩu / 2FA (`/account/security`), và liên kết quản lý ngày nghỉ lễ (`/admin/holidays`) cho Quản trị viên.
  - Bảng "Tỷ lệ hoa hồng mặc định": ADMIN được chỉnh sửa, MANAGER ở chế độ chỉ đọc; kiểm tra hợp lệ client-side trên từng dòng (tỷ lệ 0–100, tối đa 2 chữ số thập phân, tính toán bằng số nguyên xu/cents, không dùng `parseFloat`/`Number`); chặn lưu và báo lỗi tại đúng dòng khi tổng 3 tỷ lệ > 100; payload `PUT /settings/commission-defaults` gửi toàn bộ mảng với tỷ lệ dạng chuỗi; hiển thị lỗi server `COMMISSION_RATES_EXCEED_100` tại đúng dòng vi phạm.
- [x] Tuân thủ quy ước: Không dùng `localStorage`/`sessionStorage`; không dùng `parseFloat`/`Number` cho tỷ lệ hoa hồng; không chứa chuỗi định danh đặc tả `SCR-` / `TSK-` trong giao diện và mã nguồn; không dùng emoji trong nhãn nút bấm; tên file dùng định dạng kebab-case.

## File đã tạo/sửa
- `frontend/src/app/(dashboard)/page.tsx`: Màn hình Bàn làm việc phân quyền theo vai trò (ATTORNEY, MANAGER, ACCOUNTANT, ADMIN) và xử lý 4 trạng thái giao diện.
- `frontend/src/app/(dashboard)/settings/page.tsx`: Màn hình Cài đặt hệ thống gồm Thông tin tài khoản và Bảng cấu hình hoa hồng mặc định.
- `frontend/src/components/dashboard/kpi-cards.tsx`: Thành phần 4 thẻ KPI thống kê tác vụ cá nhân.
- `frontend/src/components/dashboard/my-tasks-list.tsx`: Thành phần danh sách nhiệm vụ được phân công với bộ lọc hạn xử lý.
- `frontend/src/components/dashboard/approvals-card.tsx`: Thành phần khối chờ phê duyệt cấp quản lý.
- `frontend/src/components/dashboard/my-cases-card.tsx`: Thành phần khối danh mục vụ việc đang phụ trách.
- `frontend/src/components/dashboard/accountant-inbox-card.tsx`: Thành phần khối đợt thu chờ xác nhận cho kế toán.
- `frontend/src/components/dashboard/admin-shortcuts-card.tsx`: Thành phần khối lối tắt điều hướng cho quản trị viên.
- `frontend/src/components/settings/my-account-card.tsx`: Thành phần thẻ thông tin tài khoản người dùng và lối tắt bảo mật.
- `frontend/src/components/settings/commission-defaults-table.tsx`: Thành phần bảng chỉnh sửa tỷ lệ hoa hồng với kiểm tra hợp lệ tiền tệ nguyên xu.
- `frontend/src/hooks/use-my-tasks.ts`: Hook TanStack Query truy vấn `GET /me/tasks`.
- `frontend/src/hooks/use-settings.ts`: Hook TanStack Query truy vấn `GET` và `PUT /settings/commission-defaults`.

## Kết quả tự kiểm
```text
=== [1/5] Cài đặt dependencies frontend ===

up to date, audited 495 packages in 3s

170 packages are looking for funding
  run `npm fund` for details

18 vulnerabilities (2 low, 10 moderate, 3 high, 3 critical)

To address issues that do not require attention, run:
  npm audit fix

To address all issues, run:
  npm audit fix --force

Run `npm audit` for details.
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

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.5 /Users/namtran/agy-farm/worktrees/TASK-026/frontend

 ✓ tests/workflow/workflow-graph.test.ts (18 tests) 7ms
 ✓ tests/crm/opportunities-page.test.tsx (11 tests) 491ms
 ✓ tests/finance/accounting-page.test.tsx (13 tests) 451ms
 ✓ tests/cases/case-workspace.test.tsx (16 tests) 525ms
 ✓ tests/dashboard/dashboard-page.test.tsx (14 tests) 510ms
 ✓ tests/tasks/tasks-page.test.tsx (16 tests) 660ms
 ✓ tests/workflow/workflow-editor-page.test.tsx (14 tests) 810ms
 ✓ tests/crm/clients-page.test.tsx (11 tests) 408ms
 ✓ tests/admin/users-page.test.tsx (9 tests) 193ms
 ✓ tests/audit/audit-page.test.tsx (11 tests) 149ms
 ✓ tests/login.test.tsx (11 tests) 174ms
 ✓ tests/cases/use-cases.test.ts (12 tests) 482ms
 ✓ tests/two-factor/two-factor-setup.test.tsx (11 tests) 330ms
 ✓ tests/tasks/use-tasks.test.ts (10 tests) 584ms
 ✓ tests/workflow/use-workflows.test.ts (12 tests) 692ms
 ✓ tests/cases/cases-page.test.tsx (9 tests) 205ms
 ✓ tests/dashboard/settings-page.test.tsx (13 tests) 307ms
 ✓ tests/audit/audit-diff.test.tsx (7 tests) 218ms
 ✓ tests/admin/use-admin.test.ts (11 tests) 258ms
 ✓ tests/workflow/workflows-page.test.tsx (8 tests) 128ms
 ✓ tests/admin/departments-page.test.tsx (8 tests) 150ms
 ✓ tests/two-factor/security-page.test.tsx (7 tests) 830ms
 ✓ tests/tasks/change-requests.test.tsx (6 tests) 154ms
 ✓ tests/finance/use-finance.test.ts (7 tests) 312ms
 ✓ tests/finance/commissions-page.test.tsx (6 tests) 168ms
 ✓ tests/two-factor/use-two-factor.test.ts (7 tests) 57ms
 ✓ tests/tasks/approvals-page.test.tsx (8 tests) 276ms
 ✓ tests/tasks/task-detail.test.tsx (7 tests) 244ms
 ✓ tests/audit/use-audit-logs.test.ts (6 tests) 250ms
 ✓ tests/crm/use-crm.test.ts (7 tests) 249ms
 ✓ tests/workflow/holidays-page.test.tsx (10 tests) 218ms
 ✓ tests/admin/user-detail-page.test.tsx (7 tests) 135ms
 ✓ tests/finance/case-finance-page.test.tsx (5 tests) 243ms
 ✓ tests/two-factor/login-2fa.test.tsx (2 tests) 301ms
 ✓ tests/admin/user-create.test.tsx (4 tests) 294ms
 ✓ tests/finance/money.test.ts (18 tests) 5ms
 ✓ tests/crm/client-detail-page.test.tsx (6 tests) 101ms
 ✓ tests/api-client.test.ts (7 tests) 13ms
 ✓ tests/tasks/task-state.test.ts (11 tests) 11ms
 ✓ tests/audit/audit-integrity.test.tsx (5 tests) 201ms
 ✓ tests/crm/format-vnd.test.ts (9 tests) 61ms
 ✓ tests/finance/conventions.test.ts (5 tests) 25ms
 ✓ tests/tasks/conventions.test.ts (5 tests) 58ms
 ✓ tests/dashboard/conventions.test.ts (5 tests) 56ms
 ✓ tests/workflow/custom-fields.test.tsx (5 tests) 195ms
 ✓ tests/two-factor/conventions.test.ts (4 tests) 13ms
 ✓ tests/menu.test.ts (6 tests) 17ms
 ✓ tests/workflow/conventions.test.ts (3 tests) 75ms
 ✓ tests/dashboard/use-dashboard.test.ts (4 tests) 198ms
 ✓ tests/cases/conventions.test.ts (4 tests) 71ms
 ✓ tests/conventions.test.ts (4 tests) 136ms
 ✓ tests/audit/conventions.test.ts (2 tests) 17ms
 ✓ tests/admin/conventions.test.ts (2 tests) 62ms
 ✓ tests/dashboard-layout.test.tsx (4 tests) 103ms
 ✓ tests/ui-states.test.tsx (3 tests) 50ms

 Test Files  55 passed (55)
      Tests  446 passed (446)
   Start at  18:52:25
   Duration  7.57s (transform 2.06s, setup 0ms, collect 9.25s, tests 12.94s, environment 16.67s, prepare 3.80s)

=== [5/5] Build thử nghiệm dự án frontend (Next.js) ===

> frontend@1.0.0 build
> next build

   ▲ Next.js 15.0.4

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/18) ...
   Generating static pages (4/18) 
   Generating static pages (8/18) 
   Generating static pages (13/18) 
 ✓ Generating static pages (18/18)
   Finalizing page optimization ...
   Collecting build traces ...

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
└ ○ /settings                            7.13 kB         124 kB
+ First Load JS shared by all            99.9 kB
  ├ chunks/4bd1b696-fd245cfcf7b1c808.js  52.5 kB
  ├ chunks/517-ddaefe06d704aaf8.js       45.5 kB
  └ other shared chunks (total)          1.91 kB


○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

=== TẤT CẢ KIỂM TRA ĐÃ ĐẠT CHO TASK-026 ===

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không.
