# TASK-009 — Khung frontend Next.js 15, khung giao diện theo vai trò & trang đăng nhập (TSK-16 phần FE)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không

## 1. Mục tiêu
Dựng ứng dụng `frontend/` chạy được, theo đúng cấu trúc và quy ước của dự án, để các màn hình sau chỉ việc thêm trang. Gồm: công cụ (lint, typecheck, test, build), khung giao diện chung (sidebar theo vai trò + header + Sáng/Tối), client gọi API theo hợp đồng, và trang đăng nhập hoàn chỉnh về giao diện + xử lý mã lỗi.

## 2. Tài liệu bắt buộc đọc
- `docs/09-conventions.md` §1 (cây `frontend/`), §2 (đặt tên kebab-case), §3 (TanStack Query cho server state, Zustand chỉ UI state)
- `docs/07-api-contracts.md` §1.2, §1.3, §3.1 (đăng nhập, 2FA verify, refresh, logout, me, password)
- `docs/03-screens-and-ui.md` mục SCR-01 và 4 trạng thái UI; `docs/14-decisions.md` DEC-01, DEC-02, DEC-04
- Giao diện mẫu: `prototype/auth/login.html`, menu theo vai trò trong `prototype/assets/layout.js` (`getMenuSections`)

## 3. Phạm vi file
**Được tạo/sửa:**
- `frontend/` (trừ `frontend/tests/`)

**Không được sửa:**
- `frontend/tests/` và mọi file trong `tests.lock`
- `backend/`, `prototype/`, `docs/`, `qlcvaslgate-old/`

## 4. Đặc tả chi tiết
- Next.js 15 App Router, React 19, TypeScript `strict`, Tailwind (`darkMode: 'class'`), ESLint (next), Vitest + Testing Library (jsdom). Font Plus Jakarta Sans + JetBrains Mono. Icon `lucide-react`. `@tanstack/react-query`, `zustand`.
- Script trong `frontend/package.json`: `lint`, `typecheck` (= `tsc --noEmit -p tsconfig.json`), `test` (= `vitest run`), `build`. Vitest đọc test ở `frontend/tests/**/*.test.{ts,tsx}`; alias `@/` → `frontend/src/`.
- `src/lib/api-client.ts`: `apiFetch<T>(path, init?)` — gắn tiền tố `NEXT_PUBLIC_API_BASE` (mặc định `/api/v1`), `credentials: 'include'`; với POST/PUT/PATCH/DELETE gắn header `X-CSRF-Token` lấy từ cookie `csrf_token`; parse phong bì: thành công trả `data`, thất bại ném `ApiError { status, code, message, details }`. Khi 401 `UNAUTHENTICATED`/`TOKEN_REVOKED` (trừ chính `/auth/*`): gọi `/auth/refresh` **một lần** rồi thử lại; refresh hỏng → ném lỗi gốc.
- `src/hooks/use-auth.ts`: `useMe()` (TanStack Query, key `['auth','me']`), `useLogin()`, `useLogout()`.
- `src/lib/menu.ts`: `getMenu(role)` trả các mục menu cho `ADMIN|MANAGER|ACCOUNTANT|ATTORNEY`, chép nội dung/nhãn từ `getMenuSections` của prototype; theo DEC-04 **không** có Chấm công và Cổng khách hàng.
- `src/app/(dashboard)/layout.tsx`: sidebar (thu gọn được, trạng thái trong `src/stores/sidebar-store.ts`) + header hiện tên/vai trò từ `useMe()`; chưa đăng nhập → chuyển `/login`. Trang `(dashboard)/page.tsx`: Bàn làm việc ở trạng thái Empty.
- Thành phần 4 trạng thái dùng chung `src/components/ui/` (`EmptyState`, `LoadingSkeleton`, `ErrorState`), dùng ở trang dashboard và form đăng nhập.
- `src/app/(auth)/login/page.tsx` theo `prototype/auth/login.html`:
  - Kiểm email phải đuôi `@asllaw.vn`, mật khẩu bắt buộc → lỗi hiện dưới ô (Validation error), nút bị khoá khi đang gửi (Loading).
  - Xử lý mã lỗi: `UNAUTHENTICATED` → "Email hoặc mật khẩu không đúng"; `ACCOUNT_LOCKED` → báo khoá kèm số phút từ `details.retry_after_seconds`; `TOTP_REQUIRED` → bước 2 nhập mã 6 số gọi `/auth/2fa/verify` với `challenge_id`; `TOTP_SETUP_REQUIRED` → thông báo cần thiết lập 2FA; `PASSWORD_RESET_REQUIRED` → form mật khẩu mới gọi `/auth/password` với `Authorization: Bearer <reset_token>`; thành công → về `/`.
  - Không SSO, không dòng demo/hướng dẫn, không lưu mật khẩu hay token vào `localStorage`.
- Text tiếng Việt có dấu; không mã đặc tả (`SCR-xx`, `TSK-xx`) trong giao diện; không emoji trong nút/nhãn.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test)
- [ ] `npm --prefix frontend run lint`, `typecheck`, `test`, `build` đều exit 0.
- [ ] `apiFetch`: trả `data` khi thành công; ném `ApiError` đúng `code`/`details`; POST có `X-CSRF-Token` = cookie, GET thì không; 401 `TOKEN_REVOKED` → gọi refresh đúng 1 lần rồi thử lại; refresh hỏng → không lặp vô hạn.
- [ ] `getMenu`: 4 vai trò đều có mục; ACCOUNTANT không có mục chuyên môn mà DEC-04 ẩn; không vai trò nào có Chấm công/Cổng khách hàng.
- [ ] Trang đăng nhập: email sai đuôi → lỗi, không gọi API; mỗi mã lỗi ở mục 4 hiện đúng thông điệp/bước; `TOTP_REQUIRED` hiện ô nhập mã và gửi `challenge_id`; thành công điều hướng `/`.
- [ ] Không `localStorage.setItem` chứa token/mật khẩu trong `frontend/src`; không chuỗi `SCR-`/`TSK-` trong text hiển thị.

## 6. Ràng buộc & bẫy cần tránh
- Không gọi backend thật trong test — test dùng mock `fetch`.
- Không thêm trang nghiệp vụ khác (CRM, vụ việc…) — chỉ khung + đăng nhập.
- Ghim phiên bản chính xác trong `package.json` (không `^`/`latest`), commit `package-lock.json`.
- **Không chạy `npm`/`npx` trực tiếp** (bị từ chối quyền ở chế độ ngầm). Khai báo gói + phiên bản trong `frontend/package.json`; `verify.sh` (người kiểm viết) tự chạy `npm --prefix frontend install --no-audit --no-fund` rồi `lint`, `typecheck`, `test`, `build` — luôn chạy qua `python3 scripts/handoff.py verify TASK-009`. `package-lock.json` sinh ra từ lần verify đó.
- Không dùng `create-next-app`; viết file cấu hình (`package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`) bằng tay.
