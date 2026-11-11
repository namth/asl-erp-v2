# Báo cáo TASK-015

## Đã làm
- Hiện thực hoá hook `use-admin.ts` tích hợp TanStack Query với fallback an toàn cho môi trường test: `useUsers`, `useUser`, `useCreateUser`, `useUpdateUser`, `useDeactivateUser`, `useActivateUser`, `useResetTwoFactor`, `useDepartments`, `useCreateDepartment`, `useSetDepartmentLeaders`. Tự động gọi `invalidateQueries` khi mutate thành công.
- Xây dựng màn hình danh sách người dùng (`admin/users/page.tsx`): hiển thị bảng dữ liệu nhân sự, bộ lọc tìm kiếm theo từ khoá, lọc theo vai trò, lọc theo phòng ban; phân trang theo `meta`; huy hiệu trạng thái (Đang hoạt động / Đã khoá) và trạng thái kích hoạt 2FA.
- Xây dựng quy trình tạo người dùng mới: kiểm tra email bắt buộc có đuôi `@asllaw.vn` trước khi gửi yêu cầu; vô hiệu hoá trường "Giám đốc" (`is_executive`) khi vai trò khác Quản lý (`MANAGER`); bắt và hiển thị lỗi `409 DUPLICATE_EMAIL` ngay dưới ô nhập email; khi tạo thành công hiển thị `temporary_password` một lần duy nhất kèm cảnh báo bảo mật và nút sao chép, đóng hộp thoại xoá mật khẩu khỏi DOM và không lưu trữ vào storage.
- Chức năng Khoá tài khoản và Reset 2FA: yêu cầu nhập lý do bắt buộc ≥ 10 ký tự, chặn và hiển thị lỗi nếu lý do không đạt chuẩn; gửi đúng payload API; tải lại dữ liệu sau khi thực hiện thành công.
- Xây dựng màn hình chi tiết & chỉnh sửa người dùng (`admin/users/[id]/page.tsx`): hiển thị đầy đủ thông tin chi tiết; hiển thị hộp xác nhận cảnh báo "người này sẽ bị đăng xuất khỏi mọi phiên" khi thay đổi vai trò hoặc phòng ban trước khi gửi API cập nhật.
- Bảo vệ tài khoản đang đăng nhập (`useMe`): người dùng hiện tại không thấy nút khoá tài khoản, không thấy nút reset 2FA của chính mình và bị vô hiệu hoá ô chọn vai trò để không thể tự hạ vai trò.
- Phân quyền RBAC chặt chẽ: tài khoản `MANAGER` xem được danh sách/chi tiết nhưng không hiển thị các nút thao tác ghi (tạo, sửa, khoá, reset); các vai trò khác (`ATTORNEY`, `ACCOUNTANT`) truy cập hiển thị `ErrorState` "Không có quyền truy cập".
- Xây dựng màn hình quản trị phòng ban (`admin/departments/page.tsx`): danh sách phòng ban, tạo phòng ban mới (`code`, `name`), chọn và phân công Trưởng phòng chỉ liệt kê các nhân sự có vai trò Quản lý (`MANAGER`) đang hoạt động và gửi đúng danh sách `leader_user_ids`.
- Tuân thủ quy chuẩn UI 4-states: đầy đủ Loading Skeleton, Empty State, Error State và Success State trên toàn bộ các màn hình.
- Tuân thủ quy chuẩn bảo mật: không sử dụng `localStorage` hay `sessionStorage` trong toàn bộ code của task; không chứa mã đặc tả trong chuỗi hiển thị.

## File đã tạo/sửa
- `frontend/src/types/admin.ts`: Định nghĩa kiểu dữ liệu cho người dùng, phòng ban, phân trang và các payload quản trị.
- `frontend/src/hooks/use-admin.ts`: Các React Query hooks tương tác với API quản trị người dùng và phòng ban.
- `frontend/src/app/(dashboard)/admin/users/page.tsx`: Màn hình danh sách người dùng, modal tạo mới, modal khoá tài khoản, modal reset 2FA và hiển thị mật khẩu tạm.
- `frontend/src/app/(dashboard)/admin/users/[id]/page.tsx`: Màn hình chi tiết, cập nhật thông tin người dùng và cảnh báo đăng xuất phiên.
- `frontend/src/app/(dashboard)/admin/departments/page.tsx`: Màn hình danh sách phòng ban, tạo mới và phân công Trưởng phòng.

## Kết quả tự kiểm
```
=== [1/5] Cài đặt dependencies frontend ===
up to date, audited 494 packages in 3s

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

 Test Files  17 passed (17)
      Tests  120 passed (120)
   Start at  13:11:55
   Duration  2.38s (transform 800ms, setup 0ms, collect 3.02s, tests 2.81s, environment 5.43s, prepare 1.22s)

=== [5/5] Build thử nghiệm dự án frontend (Next.js) ===
> frontend@1.0.0 build
> next build

   ▲ Next.js 15.0.4

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types     ✓ Linting and checking validity of types 
   Collecting page data     ✓ Collecting page data 
 ✓ Generating static pages (9/9)
   Collecting build traces     ✓ Collecting build traces 
   Finalizing page optimization     ✓ Finalizing page optimization 

Route (app)                              Size     First Load JS
┌ ○ /                                    1.54 kB         101 kB
├ ○ /_not-found                          896 B           101 kB
├ ○ /admin/departments                   5.36 kB         117 kB
├ ○ /admin/users                         7.41 kB         128 kB
├ ƒ /admin/users/[id]                    5.99 kB         126 kB
├ ○ /crm/clients                         6.43 kB         118 kB
├ ƒ /crm/clients/[id]                    4.5 kB          116 kB
├ ○ /crm/opportunities                   6.87 kB         118 kB
└ ○ /login                               3.6 kB          104 kB
+ First Load JS shared by all            99.9 kB
  ├ chunks/4bd1b696-e2deb48354c96b59.js  52.5 kB
  ├ chunks/517-89858a0ae2103f32.js       45.5 kB
  └ other shared chunks (total)          1.91 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

=== TẤT CẢ KIỂM TRA ĐÃ ĐẠT CHO TASK-015 ===

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
