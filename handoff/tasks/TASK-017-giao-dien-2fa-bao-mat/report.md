# Báo cáo TASK-017

## Đã làm
- Cài đặt và ghim thư viện `qrcode.react@4.2.0` phục vụ render mã QR TOTP từ `otpauth_uri`.
- Xây dựng module hook `frontend/src/hooks/use-two-factor.ts`:
  - `useSetupTwoFactor`: gửi `Authorization: Bearer <setup_token>` khi có `setupToken` (không gửi `X-CSRF-Token`); gửi `X-CSRF-Token` từ cookie khi dùng phiên đăng nhập (không gửi `Authorization`).
  - `useEnableTwoFactor`: gửi mã 6 số tới `POST /auth/2fa/enable`, tuân thủ phân tách auth token/cookie CSRF, ném `ApiError` với mã `TOTP_INVALID` khi mã sai.
  - `useChangePassword`: gửi `current_password` và `new_password` tới `POST /auth/password` kèm CSRF token.
- Phát triển thành phần dùng chung `TwoFactorSetup` (`frontend/src/components/two-factor/two-factor-setup.tsx`) gồm 3 bước:
  - Bước 1: Hiển thị mã QR từ `otpauth_uri` và khóa bí mật `secret` chia nhóm 4 ký tự; nút sao chép khóa bí mật vào clipboard; nút Tiếp tục.
  - Bước 2: Ô nhập 6 chữ số tự động lọc chỉ nhận ký tự số; tự gửi kích hoạt khi nhập đủ 6 số; hiển thị thông báo lỗi dưới ô và cho phép nhập lại khi gặp `TOTP_INVALID`.
  - Bước 3: Hiển thị lưới monospace 10 mã khôi phục `recovery_codes`; nút "Sao chép tất cả" và "Tải tệp .txt"; nút "Tôi đã lưu mã" bị khóa cho tới khi sao chép/tải; khi hoàn tất xóa sạch bí mật và mã khôi phục khỏi DOM và state.
- Cập nhật trang đăng nhập (`frontend/src/app/(auth)/login/page.tsx`):
  - Nhánh `TOTP_SETUP_REQUIRED`: khi có `setup_token` thì mở `TwoFactorSetup`; sau khi hoàn tất thiết lập tự động điều hướng về `/`.
- Phát triển trang Bảo mật tài khoản (`frontend/src/app/(dashboard)/account/security/page.tsx`):
  - Thẻ trạng thái 2FA: khi chưa bật hiện nút "Bật xác thực 2 lớp" mở luồng thiết lập 2FA phiên cookie; khi đã bật hiển thị badge "Đang bật", hướng dẫn liên hệ Quản trị viên nếu mất thiết bị và tuyệt đối không có nút tắt 2FA.
  - Form đổi mật khẩu: kiểm tra độ dài tối thiểu 10 ký tự, quy chuẩn chữ hoa, chữ thường, số, ký tự đặc biệt, kiểm tra xác nhận mật khẩu khớp; khi thành công thông báo và chuyển hướng về `/login`.
  - Tích hợp Skeleton loading state chuẩn khi dữ liệu tài khoản đang tải.
- Đảm bảo toàn bộ quy chuẩn kỹ thuật: kebab-case, không lưu dữ liệu nhạy cảm vào localStorage/sessionStorage, không chứa chuỗi `SCR-`/`TSK-`, không emoji trong nút bấm.

## File đã tạo/sửa
- `frontend/package.json`: Thêm và ghim `qrcode.react: 4.2.0`.
- `frontend/package-lock.json`: Cập nhật dependency tree cho `qrcode.react`.
- `frontend/src/hooks/use-two-factor.ts`: Hook xử lý setup 2FA, enable 2FA và đổi mật khẩu.
- `frontend/src/components/two-factor/two-factor-setup.tsx`: Thành phần giao diện 3 bước thiết lập 2FA.
- `frontend/src/components/two-factor/index.ts`: Re-export thành phần `TwoFactorSetup`.
- `frontend/src/app/(auth)/login/page.tsx`: Cập nhật nhánh xử lý `TOTP_SETUP_REQUIRED`.
- `frontend/src/app/(dashboard)/account/security/page.tsx`: Giao diện trang Bảo mật tài khoản (SCR-20).

## Kết quả tự kiểm
```
=== [1/5] Cài đặt dependencies frontend ===
up to date, audited 495 packages in 3s

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
 Test Files  27 passed (27)
      Tests  182 passed (182)

=== [5/5] Build thử nghiệm dự án frontend (Next.js) ===
> frontend@1.0.0 build
> next build
   ▲ Next.js 15.0.4
   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types     ✓ Linting and checking validity of types 
   Collecting page data     ✓ Collecting page data 
 ✓ Generating static pages (11/11)
   Collecting build traces     ✓ Collecting build traces 
   Finalizing page optimization     ✓ Finalizing page optimization 

Route (app)                              Size     First Load JS
┌ ○ /                                    1.54 kB         101 kB
├ ○ /_not-found                          896 B           101 kB
├ ○ /account/security                    2.95 kB         124 kB
├ ○ /admin/audit-logs                    7.07 kB         115 kB
├ ○ /admin/departments                   5.36 kB         117 kB
├ ○ /admin/users                         7.41 kB         128 kB
├ ƒ /admin/users/[id]                    6 kB            126 kB
├ ○ /crm/clients                         6.44 kB         118 kB
├ ƒ /crm/clients/[id]                    4.51 kB         116 kB
├ ○ /crm/opportunities                   6.88 kB         118 kB
└ ○ /login                               5.66 kB         119 kB
+ First Load JS shared by all            99.9 kB

=== TẤT CẢ KIỂM TRA ĐÃ ĐẠT CHO TASK-017 ===

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
