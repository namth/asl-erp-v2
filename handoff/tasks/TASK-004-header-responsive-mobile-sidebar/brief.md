# Nhiệm vụ TASK-004: Header chuẩn hóa theo vai trò, sidebar đóng mặc định trên mobile & responsive 375/1024/1440 (A2)

## 1. Bối cảnh
Theo Báo cáo QA và Milestone 0 (A2):
- Header ở các trang hiện tại đang hiển thị cứng một nhân sự (ví dụ LS. Nguyễn Anh / Managing Partner), chưa tự động đồng bộ theo vai trò đang chọn (`admin`, `manager`, `accountant`, `attorney`).
- Trên màn hình thiết bị di động (< 768px, đặc biệt là 375px), sidebar đang hiển thị đè kín 70% màn hình vì không có trạng thái đóng mặc định (off-canvas). Cần ẩn sidebar ngoài màn hình (`-translate-x-full`), chỉ mở khi bấm nút hamburger và có lớp nền che mờ (backdrop overlay) để chạm ra ngoài là tự đóng.
- Đảm bảo bảo vệ chống tràn ngang (overflow-x protection) ở các kích thước 375px, 1024px và 1440px.

## 2. Mục tiêu cụ thể
1. **Trong `prototype/assets/layout.js`**:
   - Thêm hàm `syncHeaderProfile(role)` tự động tìm khối user profile trong `<header>` (avatar, tên, chức danh) và cập nhật theo `getRoleInfo(role)`:
     - `admin`: LS. Nam Trần / Quản Trị Viên (NV)
     - `manager`: LS. Nguyễn Anh / Managing Partner (NA)
     - `accountant`: Trần Thị Thu Trang / Kế Toán Trưởng (TT)
     - `attorney`: LS. Hoàng Gia Huy / Luật Sư Chuyên Môn (GH)
   - Gọi `syncHeaderProfile(currentRole)` trong `initLayout()` và khi chuyển vai trò `switchRole()`.
   - Cải tiến `toggleSidebar()` và quản lý trạng thái trên mobile:
     - Trên màn hình nhỏ (`window.innerWidth < 768`), sidebar mặc định đóng ngoài màn hình (`-translate-x-full` hoặc `sidebar-mobile-closed`).
     - Khi mở trên mobile, hiển thị lớp nền `sidebar-backdrop` (che mờ nền, click vào backdrop sẽ tự đóng sidebar).
     - Khi đóng trên mobile, ẩn backdrop và đưa sidebar về vị trí `-translate-x-full`.
2. **Trong `prototype/assets/layout.css`**:
   - Bổ sung media query `@media (max-width: 767px)` hỗ trợ trạng thái off-canvas cho `#sidebar` và lớp `sidebar-backdrop`.
   - Đảm bảo `overflow-x: hidden` trên `body`, `#main-container` để tránh tràn ngang ở 375px.
3. **Đảm bảo tính toàn vẹn**:
   - `python3 scripts/check-prototype.py --strict` đạt 0 lỗi, 0 cảnh báo trên toàn bộ 44 trang.

## 3. Phạm vi file được phép sửa
- `prototype/assets/layout.js`
- `prototype/assets/layout.css`

## 4. Kiểm tra tự động
```bash
bash handoff/tasks/TASK-004-header-responsive-mobile-sidebar/verify.sh
```
Yêu cầu: tất cả 5 test đều đạt `OK`, exit code 0.
