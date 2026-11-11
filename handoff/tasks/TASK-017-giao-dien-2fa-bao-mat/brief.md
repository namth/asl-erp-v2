# TASK-017 — Giao diện thiết lập 2FA & bảo mật tài khoản

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không (chỉ giao diện; bí mật do backend xử lý)

## 1. Mục tiêu
Hoàn thiện luồng 2FA phía người dùng (DEC-02): khi đăng nhập gặp `TOTP_SETUP_REQUIRED` thì thiết lập ngay bằng `setup_token`; trang "Bảo mật tài khoản" để người đã đăng nhập bật 2FA và đổi mật khẩu. Backend làm song song (TASK-011) → test dùng `fetch` giả lập.

## 2. Tài liệu bắt buộc đọc
- `docs/14-decisions.md` DEC-02; `docs/10-env-and-security.md` §2.2a
- `docs/07-api-contracts.md` §1.3 (mã `TOTP_*`), §3.1
- **Hợp đồng 2FA chi tiết:** `handoff/tasks/TASK-017-giao-dien-2fa-bao-mat/api-spec.md` mục 4 (bản sao brief TASK-011)
- Code có sẵn: `frontend/src/app/(auth)/login/page.tsx`, `frontend/src/lib/api-client.ts`, `frontend/src/hooks/use-auth.ts`, `frontend/src/components/ui/`

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `frontend/src/app/(auth)/login/` (chỉ phần nhánh `TOTP_SETUP_REQUIRED`)
- `frontend/src/app/(dashboard)/account/security/`
- `frontend/src/components/two-factor/`
- `frontend/src/hooks/use-two-factor.ts`
- `frontend/package.json`, `frontend/package-lock.json` (chỉ thêm `qrcode.react`, ghim phiên bản)

**Người viết test:** `frontend/tests/two-factor/` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; các file khác của `frontend/src`; `backend/`, `docs/`, `prototype/`.

## 4. Đặc tả chi tiết
- `use-two-factor.ts`: `useSetupTwoFactor(auth)` → `POST /auth/2fa/setup`; `useEnableTwoFactor(auth)` → `POST /auth/2fa/enable {code}`; `auth` là `{ setupToken }` (gửi `Authorization: Bearer`, không CSRF) hoặc `undefined` (dùng phiên cookie + CSRF qua `apiFetch`). `useChangePassword()` → `POST /auth/password {current_password, new_password}`.
- **Thành phần `TwoFactorSetup`** (dùng chung cho 2 nơi), 3 bước:
  1. Gọi setup → hiện mã QR từ `otpauth_uri` (`qrcode.react`) và khoá `secret` dạng nhóm 4 ký tự để nhập tay, nút sao chép.
  2. Ô nhập mã 6 số (chỉ số, tự gửi khi đủ 6) → enable; `TOTP_INVALID` → lỗi dưới ô, cho nhập lại.
  3. Hiện 10 `recovery_codes` dạng lưới mono, nút "Sao chép tất cả" và "Tải tệp .txt"; nút "Tôi đã lưu mã" chỉ bật sau khi đã sao chép hoặc tải. Đóng bước 3 thì xoá `secret` và mã khỏi state.
- **Đăng nhập:** nhánh `TOTP_SETUP_REQUIRED` mở `TwoFactorSetup` với `setupToken` từ `details.setup_token`; xong bước 3 → về `/` (enable bằng `setup_token` đã cấp phiên).
- **`account/security/page.tsx`:** thẻ trạng thái 2FA (từ `useMe().totp_enabled`); chưa bật → nút "Bật xác thực 2 lớp" mở `TwoFactorSetup` (phiên cookie); đã bật → hiện "Đang bật" và hướng dẫn liên hệ Quản trị viên nếu mất thiết bị (không có nút tự tắt). Form đổi mật khẩu: kiểm chính sách mật khẩu `docs/10` phía client (≥ 10 ký tự, hoa, thường, số, ký tự đặc biệt), xác nhận khớp; thành công → thông báo "Đã đổi mật khẩu, vui lòng đăng nhập lại" và chuyển `/login` (backend thu hồi mọi phiên).
- Đủ Empty/Skeleton/Success/Validation error.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test)
- [ ] `verify.sh`: `npm --prefix frontend install`, `lint`, `typecheck`, `test`, `build` exit 0; test cũ vẫn xanh.
- [ ] Setup bằng `setup_token`: request có `Authorization: Bearer`, không gắn `X-CSRF-Token`; bằng phiên: có `X-CSRF-Token`, không có `Authorization`.
- [ ] QR render từ `otpauth_uri`; `secret` hiển thị nhóm 4 ký tự; ô mã chỉ nhận số, đủ 6 tự gửi; `TOTP_INVALID` hiện lỗi và cho nhập lại.
- [ ] 10 mã khôi phục hiện đủ; nút "Tôi đã lưu mã" bị khoá tới khi sao chép/tải; đóng thì mã và secret biến mất khỏi DOM.
- [ ] Đăng nhập gặp `TOTP_SETUP_REQUIRED` → hoàn tất setup → điều hướng `/`.
- [ ] Trang bảo mật: đã bật 2FA thì không có nút tắt; đổi mật khẩu kiểm chính sách + khớp xác nhận, thành công chuyển `/login`.
- [ ] Không `localStorage`/`sessionStorage`; không chuỗi `SCR-`/`TSK-`; không emoji trong nút.

## 6. Ràng buộc & bẫy cần tránh
- Không sửa file ngoài mục 3; cần đổi menu/api-client → ghi `report.md` mục câu hỏi.
- Không gửi `secret`/mã khôi phục tới bất kỳ endpoint nào khác; không log ra console.
- Chạy test chỉ qua `python3 scripts/handoff.py verify TASK-017`. Ghi file bằng công cụ ghi file (tự tạo thư mục cha) — `mkdir`, `|`, `xargs` bị từ chối.
