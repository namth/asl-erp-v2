# TASK-026 — Bàn làm việc cá nhân & Cài đặt (SCR-02, SCR-20)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không (giao diện)

## 1. Mục tiêu
Trang đầu sau đăng nhập cho từng người: việc của tôi (quá hạn, hôm nay, tuần này), hàng chờ duyệt, vụ việc của tôi — theo vai trò. Trang Cài đặt: tài khoản của tôi (mọi người) và tỷ lệ hoa hồng mặc định theo loại vụ việc (Quản trị viên). Backend làm sau → test dùng `fetch` giả lập.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` §3.4 (`GET /me/tasks`, `GET /approvals`, `GET /cases?mine=true`), `GET/PUT /settings/commission-defaults` (cùng bảng §3.4), §3.5 (`GET /accounting/inbox`), §1.3 (`COMMISSION_RATES_EXCEED_100`)
- `docs/03-screens-and-ui.md` dòng SCR-02, SCR-20 và 4 trạng thái UI; `docs/14-decisions.md` DEC-01, DEC-04
- Giao diện mẫu: `prototype/dashboard/index.html`, `prototype/settings/index.html`
- Code có sẵn: hooks `frontend/src/hooks/use-cases.ts`, `use-approvals.ts`, `use-accounting.ts`, `use-auth.ts`; `frontend/src/components/ui/`; trang `frontend/src/app/(dashboard)/account/security/` (đã có — chỉ liên kết tới, không sửa)

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `frontend/src/app/(dashboard)/page.tsx` (thay trang Empty hiện tại)
- `frontend/src/app/(dashboard)/settings/`
- `frontend/src/components/dashboard/`, `frontend/src/components/settings/`
- `frontend/src/hooks/use-my-tasks.ts`, `frontend/src/hooks/use-settings.ts`

**Người viết test:** `frontend/tests/dashboard/` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; các hook có sẵn (chỉ dùng); các file khác của `frontend/src`; `backend/`, `docs/`, `prototype/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- **SCR-02** theo vai trò:
  - `ATTORNEY`, `MANAGER`: thẻ đếm từ `summary` của `GET /me/tasks` (Cần làm, Đang làm, Chờ duyệt, Quá hạn — Quá hạn màu đỏ khi > 0); danh sách "Việc của tôi" với bộ lọc nhanh Quá hạn / Hôm nay / Tuần này (`due=`), mỗi dòng link tới `/cases/{case.id}/tasks`; thẻ "Chờ tôi duyệt" (số lượng + 5 mục mới nhất từ `GET /approvals?status=PENDING`, link `/approvals`); "Vụ việc của tôi" (5 vụ việc từ `GET /cases?mine=true`).
  - `ACCOUNTANT`: thay "Việc của tôi" bằng "Đợt thu chờ xác nhận" (số lượng + 5 mục từ `GET /accounting/inbox`, link `/accounting`); không có thẻ duyệt task.
  - `ADMIN`: lối tắt tới Người dùng, Quy trình, Nhật ký kiểm toán, Cài đặt; không gọi API nghiệp vụ vụ việc.
  - Lời chào theo `useMe().full_name`; mỗi khối có Skeleton riêng, lỗi một khối không làm hỏng khối khác.
- **SCR-20** `settings/page.tsx`:
  - Thẻ "Tài khoản của tôi" (mọi người): thông tin từ `useMe()`, liên kết tới `/account/security`.
  - Thẻ "Tỷ lệ hoa hồng mặc định" (`ADMIN` sửa, `MANAGER` xem): bảng theo loại vụ việc, 4 ô tỷ lệ (0–100, tối đa 2 chữ số lẻ, giữ dạng chuỗi); tổng 3 tỷ lệ (người mang khách về + quản lý + thực hiện) > 100 → chặn và báo ở đúng dòng; ghi chú "Chỉ áp cho vụ việc tạo sau khi lưu"; lưu bằng `PUT` gửi cả bảng; `COMMISSION_RATES_EXCEED_100` từ server hiện ở đúng dòng.
  - Liên kết tới `/admin/holidays` (đã có) cho `ADMIN`.
- Đủ Empty/Skeleton/Success/ErrorState.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test)
- [ ] `verify.sh`: `npm --prefix frontend install`, `lint`, `typecheck`, `test`, `build` exit 0; test cũ vẫn xanh.
- [ ] ATTORNEY: 4 thẻ đếm đúng `summary`, Quá hạn đỏ khi > 0; bộ lọc gửi đúng `due=`; có khối Chờ tôi duyệt và Vụ việc của tôi.
- [ ] ACCOUNTANT: có khối Đợt thu chờ xác nhận, **không** gọi `/me/tasks`, không có khối duyệt task. ADMIN: chỉ lối tắt, không gọi `/cases`, `/me/tasks`.
- [ ] Một khối lỗi (500) chỉ khối đó hiện ErrorState, các khối khác vẫn hiển thị.
- [ ] Cài đặt: ADMIN sửa được, MANAGER chỉ đọc; tổng > 100 bị chặn ở đúng dòng; tỷ lệ ngoài 0–100 hoặc > 2 chữ số lẻ bị chặn; body `PUT` đúng dạng (tỷ lệ là chuỗi); lỗi server hiện đúng dòng.
- [ ] Không `localStorage`; không `Number(`/`parseFloat` cho tỷ lệ; không chuỗi `SCR-`/`TSK-`; không emoji trong nút.

## 6. Ràng buộc & bẫy cần tránh
- Không sửa hook có sẵn; cần thêm hàm → tạo hook mới trong phạm vi. Cần đổi menu/api-client → ghi `report.md` mục câu hỏi.
- Chạy test qua `python3 scripts/handoff.py verify TASK-026` hoặc `npm --prefix frontend run test`. Ghi file bằng công cụ ghi file (tự tạo thư mục cha); `mkdir`, `;`, `||`, `|`, `xargs` bị từ chối.
