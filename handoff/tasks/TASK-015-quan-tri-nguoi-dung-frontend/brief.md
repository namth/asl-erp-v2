# TASK-015 — Màn hình quản trị người dùng & phòng ban (SCR-19)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không (chỉ giao diện; quyền thật do backend kiểm)

## 1. Mục tiêu
Màn hình cho Quản trị viên tạo/sửa/khoá người dùng, quản lý phòng ban và Trưởng phòng, reset 2FA; Quản lý chỉ xem. Backend đang được làm song song (TASK-014, TASK-011) → test dùng `fetch` giả lập theo hợp đồng.

## 2. Tài liệu bắt buộc đọc
- `docs/03-screens-and-ui.md` dòng SCR-19 và mục 4 trạng thái UI; `docs/14-decisions.md` DEC-01, DEC-02
- `docs/07-api-contracts.md` §1.2, §1.3, §2 (dòng Người dùng, Phòng ban, `POST /users/{id}/2fa/reset`), §3.2
- **Hợp đồng chi tiết của backend:** `handoff/tasks/TASK-015-quan-tri-nguoi-dung-frontend/api-spec.md` mục 4 (bản sao brief TASK-014) và mục "reset 2FA" bên dưới
- Giao diện mẫu: `prototype/users/index.html`, `create.html`, `detail.html`, `edit.html`
- Code có sẵn: `frontend/src/lib/api-client.ts`, `frontend/src/hooks/use-auth.ts`, `frontend/src/components/ui/`, cách làm của `frontend/src/app/(dashboard)/crm/`

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `frontend/src/app/(dashboard)/admin/users/`
- `frontend/src/app/(dashboard)/admin/departments/`
- `frontend/src/components/admin/`
- `frontend/src/hooks/use-admin.ts`, `frontend/src/types/admin.ts`

**Người viết test:** `frontend/tests/admin/` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; các file khác của `frontend/src`; `backend/`, `docs/`, `prototype/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- `use-admin.ts` (TanStack Query): `useUsers({q, role, department_id, page})`, `useUser(id)`, `useCreateUser()`, `useUpdateUser(id)`, `useDeactivateUser(id)` (`{reason}`), `useActivateUser(id)`, `useResetTwoFactor(id)` (`POST /users/{id}/2fa/reset` `{reason}` — lý do ≥ 10 ký tự), `useDepartments()`, `useCreateDepartment()`, `useSetDepartmentLeaders(id)` (`PUT /departments/{id}/leaders` `{leader_user_ids}`). Ghi xong → `invalidateQueries` đúng key.
- **Danh sách** `admin/users/page.tsx`: bảng, tìm, lọc vai trò/phòng ban, phân trang theo `meta`; huy hiệu trạng thái (Đang hoạt động / Đã khoá), 2FA bật/tắt.
- **Tạo** người dùng: email bắt buộc đuôi `@asllaw.vn`; "Giám đốc" (`is_executive`) chỉ chọn được khi vai trò là Quản lý; `409 DUPLICATE_EMAIL` hiện dưới ô email. Thành công → hộp thoại hiện `temporary_password` **một lần** kèm nút sao chép và cảnh báo "chỉ hiện một lần"; đóng hộp thoại thì xoá giá trị khỏi state, không lưu ở đâu khác.
- **Chi tiết/Sửa**: đổi vai trò hoặc phòng ban → hộp xác nhận nói rõ "người này sẽ bị đăng xuất khỏi mọi phiên". Khoá tài khoản và reset 2FA → hộp xác nhận bắt buộc nhập lý do. Người đang đăng nhập (`useMe()`) **không** thấy nút khoá/hạ vai trò của chính mình, không thấy nút reset 2FA của chính mình.
- **Phòng ban** `admin/departments/page.tsx`: danh sách, tạo mới (`code`, `name`), chọn Trưởng phòng (chỉ liệt kê người dùng vai trò Quản lý đang hoạt động).
- Vai trò `MANAGER`: xem được danh sách/chi tiết, không có nút tạo/sửa/khoá/reset. Vai trò khác truy cập → ErrorState "Không có quyền truy cập".
- Mỗi màn hình đủ Empty, Skeleton loading, Success, Validation error/ErrorState.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test)
- [ ] `verify.sh`: `npm --prefix frontend install`, `lint`, `typecheck`, `test`, `build` exit 0; test cũ trong `frontend/tests` vẫn xanh.
- [ ] Tạo user: email sai đuôi → lỗi, không gọi API; `is_executive` bị khoá khi vai trò khác Quản lý; 409 hiện dưới ô; `temporary_password` hiện sau 201 và biến mất khỏi DOM khi đóng hộp thoại.
- [ ] Khoá / reset 2FA: thiếu lý do hoặc lý do < 10 ký tự → chặn; gửi đúng body; sau thành công danh sách được tải lại.
- [ ] Đổi vai trò/phòng ban hiện cảnh báo đăng xuất trước khi gửi.
- [ ] Người dùng hiện tại không thấy nút khoá/hạ vai trò/reset 2FA cho chính mình.
- [ ] MANAGER không thấy nút ghi; ATTORNEY/ACCOUNTANT thấy ErrorState không có quyền.
- [ ] Chọn Trưởng phòng chỉ liệt kê Quản lý đang hoạt động; gửi đúng `leader_user_ids`.
- [ ] Không `localStorage`/`sessionStorage` trong code của task; không chuỗi `SCR-`/`TSK-` trong text hiển thị.

## 6. Ràng buộc & bẫy cần tránh
- Không sửa file ngoài mục 3; cần đổi menu/api-client → ghi `report.md` mục câu hỏi.
- Chạy test chỉ qua `python3 scripts/handoff.py verify TASK-015`. File tạm ghi trong thư mục dự án; không dùng `|`/`xargs`.
