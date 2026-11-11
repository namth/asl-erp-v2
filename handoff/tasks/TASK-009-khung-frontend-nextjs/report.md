# Báo cáo TASK-009

## Đã làm
- [x] Thiết lập khung frontend Next.js 15 App Router, React 19, TypeScript strict, Tailwind CSS (`darkMode: 'class'`), ESLint flat config, Vitest + Testing Library (`jsdom`), TanStack Query, Zustand, `lucide-react`.
- [x] Đầy đủ các scripts trong `frontend/package.json`: `lint`, `typecheck`, `test`, `build`. Cả 4 lệnh đều chạy thành công exit code 0.
- [x] Hiện thực `src/lib/api-client.ts` (`apiFetch<T>`, `ApiError`): tự động gắn base path `/api/v1`, `credentials: 'include'`; thêm `X-CSRF-Token` từ cookie `csrf_token` cho các request thay đổi dữ liệu (POST, PUT, PATCH, DELETE); parse phong bì response chuẩn `{ success, data }` hoặc `{ success: false, error: { code, message, details } }`; tự động gọi `/auth/refresh` 1 lần khi gặp 401 `TOKEN_REVOKED` hoặc `UNAUTHENTICATED` (trừ các endpoint `/auth/*`), retry thành công hoặc ném lại lỗi gốc nếu refresh thất bại.
- [x] Hiện thực `src/lib/menu.ts` (`getMenu`): cung cấp danh mục điều hướng cho 4 vai trò hệ thống `ADMIN`, `MANAGER`, `ACCOUNTANT`, `ATTORNEY` (không phân biệt hoa/thường). Tuân thủ nghiêm ngặt DEC-04: không vai trò nào có Chấm công / Cổng khách hàng; vai trò `ACCOUNTANT` không có các mục chuyên môn vụ việc, quy trình, cơ hội, quản trị người dùng.
- [x] Xây dựng khung giao diện `src/app/(dashboard)/layout.tsx`: Sidebar thu gọn/mở rộng đồng bộ qua `src/stores/sidebar-store.ts`, Top Header hiển thị họ tên và vai trò/chức danh từ hook `useMe()`, có nút chuyển đổi giao diện Sáng / Tối; chuyển hướng về `/login` nếu chưa đăng nhập hoặc lỗi phiên.
- [x] Xây dựng trang Bàn làm việc cá nhân `src/app/(dashboard)/page.tsx` ở trạng thái Trống (Empty state) dùng `EmptyState`.
- [x] Xây dựng bộ component dùng chung 4 trạng thái giao diện trong `src/components/ui/`: `EmptyState`, `LoadingSkeleton`, `ErrorState`.
- [x] Xây dựng trang đăng nhập `src/app/(auth)/login/page.tsx` bám sát thiết kế `prototype/auth/login.html`:
  - Kiểm tra email bắt buộc có đuôi `@asllaw.vn` và mật khẩu bắt buộc tại client, hiển thị lỗi ngay dưới ô nhập và không gọi API nếu dữ liệu không hợp lệ.
  - Khoá nút đăng nhập (disabled) khi đang gửi yêu cầu (Loading state).
  - Xử lý đầy đủ các mã lỗi: `UNAUTHENTICATED` ("Email hoặc mật khẩu không đúng"), `ACCOUNT_LOCKED` (tính số phút khoá từ `retry_after_seconds`), `TOTP_REQUIRED` (chuyển sang bước 2 nhập mã 6 số gọi `/auth/2fa/verify` với `challenge_id`), `TOTP_SETUP_REQUIRED` (thông báo tài khoản cần thiết lập 2FA), `PASSWORD_RESET_REQUIRED` (hiển thị form mật khẩu mới gọi `/auth/password` với `Authorization: Bearer <reset_token>`).
  - Đăng nhập thành công điều hướng về `/`.
  - Không có nút SSO theo DEC-02, không lưu token hoặc mật khẩu vào `localStorage`.
- [x] Toàn bộ text giao diện bằng tiếng Việt có dấu, đặt tên file tuân thủ `kebab-case`, không chứa mã đặc tả SCR-xx / TSK-xx trong text hiển thị.

## File đã tạo/sửa
- `frontend/package.json`: Cấu hình npm scripts và ghim phiên bản chính xác các gói phụ thuộc.
- `frontend/package-lock.json`: Lockfile sinh từ lần cài đặt verify.
- `frontend/tsconfig.json`: Cấu hình TypeScript compiler, strict mode, path alias `@/*` trỏ tới `src/*`.
- `frontend/next.config.ts`: Cấu hình Next.js 15.
- `frontend/tailwind.config.ts`: Cấu hình Tailwind CSS, darkMode class, bảng màu ASL LAW.
- `frontend/postcss.config.mjs`: Cấu hình PostCSS plugins.
- `frontend/eslint.config.mjs`: Cấu hình ESLint flat config với Next.js FlatCompat.
- `frontend/vitest.config.ts`: Cấu hình Vitest môi trường jsdom, alias `@/`.
- `frontend/next-env.d.ts`: Next.js TypeScript declarations.
- `frontend/.gitignore`: Bỏ qua node_modules, .next, *.tsbuildinfo.
- `frontend/public/assets/*`: Logo thương hiệu ASL LAW.
- `frontend/src/types/auth.ts`: Khai báo kiểu dữ liệu User, LoginResponse.
- `frontend/src/lib/api-client.ts`: Module `apiFetch` và `ApiError` gọi API, CSRF, auto-refresh.
- `frontend/src/lib/menu.ts`: Hàm `getMenu(role)` phân quyền menu theo vai trò và DEC-04.
- `frontend/src/stores/sidebar-store.ts`: Zustand store quản lý trạng thái sidebar.
- `frontend/src/hooks/use-auth.ts`: React Query hooks `useMe`, `useLogin`, `useLogout`.
- `frontend/src/components/ui/empty-state.tsx`: Component trạng thái rỗng kèm nút thao tác.
- `frontend/src/components/ui/loading-skeleton.tsx`: Component khung xương tải trang với hiệu ứng pulse.
- `frontend/src/components/ui/error-state.tsx`: Component trạng thái lỗi kèm nút thử lại.
- `frontend/src/components/providers.tsx`: React Query Client Provider bọc ứng dụng.
- `frontend/src/app/globals.css`: Khai báo styles Tailwind, biến màu CSS và font chữ.
- `frontend/src/app/layout.tsx`: Root layout ứng dụng.
- `frontend/src/app/(dashboard)/layout.tsx`: Layout dashboard kèm Sidebar phân quyền và Top Header.
- `frontend/src/app/(dashboard)/page.tsx`: Màn hình Bàn làm việc cá nhân trạng thái rỗng.
- `frontend/src/app/(auth)/login/page.tsx`: Màn hình đăng nhập đa bước (mật khẩu, TOTP 2FA, đổi mật khẩu bắt buộc).

## Kết quả tự kiểm
```text
$ bash handoff/tasks/TASK-009-khung-frontend-nextjs/verify.sh

up to date in 498ms

> frontend@1.0.0 lint
> next lint

✔ No ESLint warnings or errors

> frontend@1.0.0 typecheck
> tsc --noEmit -p tsconfig.json


> frontend@1.0.0 test
> vitest run

 RUN  v2.1.5 /Users/namtran/agy-farm/worktrees/TASK-009/frontend

 ✓ tests/api-client.test.ts (7)
 ✓ tests/menu.test.ts (6)
 ✓ tests/conventions.test.ts (4)
 ✓ tests/login.test.tsx (11)
 ✓ tests/ui-states.test.tsx (3)
 ✓ tests/dashboard-layout.test.tsx (4)

 Test Files  6 passed (6)
      Tests  35 passed (35)
   Start at  11:58:25
   Duration  928ms (transform 250ms, setup 0ms, collect 772ms, tests 385ms, environment 1.80s, prepare 390ms)


> frontend@1.0.0 build
> next build

   ▲ Next.js 15.0.4

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types     ✓ Linting and checking validity of types 
   Collecting page data     ✓ Collecting page data 
 ✓ Generating static pages (5/5)
   Collecting build traces     ✓ Collecting build traces 
   Finalizing page optimization     ✓ Finalizing page optimization 

Route (app)                              Size     First Load JS
┌ ○ /                                    1.51 kB         101 kB
├ ○ /_not-found                          896 B           101 kB
└ ○ /login                               3.59 kB         104 kB
+ First Load JS shared by all            99.9 kB
  ├ chunks/4bd1b696-5a35de2e399394ed.js  52.5 kB
  ├ chunks/517-a6ee13bf2bd738bf.js       45.5 kB
  └ other shared chunks (total)          1.91 kB


○  (Static)  prerendered as static content


KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không.
