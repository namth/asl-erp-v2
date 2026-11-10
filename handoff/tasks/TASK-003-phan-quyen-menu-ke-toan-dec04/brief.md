# Nhiệm vụ TASK-003: Phân quyền menu theo DEC-04 và ẩn hành động chuyên môn với Kế toán

## 1. Bối cảnh
Theo Quyết định kiến trúc **DEC-04** và **DEC-01** (cùng Bất biến #2 trong `CONTEXT.md`):
- **Phạm vi Phase 1 (DEC-04):** Chấm công (Timesheet) và Cổng khách hàng (Client Portal) thuộc Phase 2, cần ẩn hoàn toàn khỏi menu sidebar của mọi vai trò trên prototype.
- **Bảo mật Need-to-know & Vai trò Kế toán (DEC-01 & Bất biến #2):** Kế toán (`accountant`) chỉ quản lý tiến độ đợt thu, đối soát MISA và sổ hoa hồng; **tuyệt đối không** có thẩm quyền tạo vụ việc pháp lý mới, chỉnh sửa hồ sơ vụ việc hay phê duyệt chuyên môn pháp lý.

## 2. Mục tiêu cụ thể
1. **Trong `prototype/assets/layout.js`:**
   - Xóa bỏ `itemPortal` khỏi danh sách menu `Tài Chính & Kế Toán` của Quản trị viên (Admin).
   - Đảm bảo `getMenuSections()` không trả về bất kỳ item nào trỏ tới `client-portal` hoặc `timesheet` cho cả 4 vai trò (`admin`, `manager`, `accountant`, `attorney`).
2. **Trong `prototype/cases/index.html`:**
   - Đối với vai trò `accountant` (xác định qua URL query `?role=accountant` hoặc `asl_user_role` trong `localStorage`):
     - Ẩn nút **"Tạo Vụ Việc Mới"** (`a[href*="create.html"]`), ví dụ thêm class hoặc kiểm tra trong hàm `syncRoleTableColumns()` để ẩn nút này khi `role === 'accountant'`.
3. **Trong `prototype/cases/detail.html`:**
   - Đối với vai trò `accountant`:
     - Ẩn nút **"Chỉnh Sửa"** (`a[href*="edit.html"]`).
     - Ẩn nút **"Trình Phê Duyệt"** (`openApprovalModal()`).
     - Thêm script kiểm tra `role === 'accountant'` để ẩn các hành động chuyên môn này khi vào trang với `?role=accountant`.
4. **Đảm bảo tính toàn vẹn:**
   - Giữ nguyên các liên kết, theme Light/Dark và responsive.
   - `python3 scripts/check-prototype.py --strict` đạt 0 lỗi, 0 cảnh báo.

## 3. Phạm vi file được phép sửa
- `prototype/assets/layout.js`
- `prototype/cases/index.html`
- `prototype/cases/detail.html`

## 4. Kiểm tra tự động
Chạy lệnh kiểm tra:
```bash
bash handoff/tasks/TASK-003-phan-quyen-menu-ke-toan-dec04/verify.sh
```
Yêu cầu: tất cả 5 test đều đạt `OK`, exit code 0.
