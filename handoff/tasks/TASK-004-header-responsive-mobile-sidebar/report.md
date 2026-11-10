# Báo cáo TASK-004

## Đã làm
- Thêm hàm `syncHeaderProfile(role)` trong `prototype/assets/layout.js` tự động tìm khối user profile trong `<header>` (avatar, tên, chức danh) và cập nhật đồng bộ theo `getRoleInfo(role)` cho cả 4 vai trò:
  - `admin`: LS. Nam Trần / Quản Trị Viên (NV)
  - `manager`: LS. Nguyễn Anh / Managing Partner (NA)
  - `accountant`: Trần Thị Thu Trang / Kế Toán Trưởng (TT)
  - `attorney`: LS. Hoàng Gia Huy / Luật Sư Chuyên Môn (GH)
- Tích hợp gọi `syncHeaderProfile(currentRole)` khi khởi tạo layout trong `initLayout()` và khi chuyển vai trò `switchRole()`.
- Cải tiến `toggleSidebar()` cùng các hàm quản lý `getOrCreateBackdrop()`, `openMobileSidebar()`, `closeMobileSidebar()`:
  - Trên màn hình nhỏ (`< 768px`), sidebar mặc định đóng off-canvas ngoài màn hình (`-translate-x-full`).
  - Khi mở sidebar trên mobile, hiển thị lớp nền che mờ `sidebar-backdrop`.
  - Khi chạm vào backdrop, nhấn phím Escape, hoặc bấm chọn link menu trên mobile, tự động đóng sidebar và ẩn backdrop.
  - Tự động đồng bộ layout khi thay đổi kích thước cửa sổ (`resize`).
- Bổ sung media query `@media (max-width: 767px)` trong `prototype/assets/layout.css` hỗ trợ trạng thái off-canvas cho `#sidebar` và lớp `.sidebar-backdrop`.
- Bổ sung thuộc tính bảo vệ chống tràn ngang (`overflow-x: hidden`) trên `html`, `body`, `#main-container` để đảm bảo responsive chuẩn xác ở 375px (mobile), 1024px (tablet) và 1440px (desktop).
- Chạy tự kiểm tra: 5/5 test unittest đạt `OK`, `check-prototype.py --strict` đạt 0 lỗi, 0 cảnh báo trên toàn bộ 44 trang.

## File đã tạo/sửa
- `prototype/assets/layout.js`: Thêm `syncHeaderProfile()`, cơ chế off-canvas sidebar trên mobile, quản lý `sidebar-backdrop` và xử lý sự kiện đóng mở responsive.
- `prototype/assets/layout.css`: Thêm media query `@media (max-width: 767px)` cho `#sidebar`, class `.sidebar-backdrop`, và cấu hình `overflow-x: hidden`.

## Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-004-header-responsive-mobile-sidebar/verify.sh
test_header_dynamic_role_sync_exists (tests.prototype.test_task_004_header_responsive.TestHeaderResponsiveTASK004.test_header_dynamic_role_sync_exists)
Header phải có hàm/logic đồng bộ thông tin người dùng theo 4 vai trò (admin, manager, accountant, attorney). ... ok
test_mobile_sidebar_default_closed (tests.prototype.test_task_004_header_responsive.TestHeaderResponsiveTASK004.test_mobile_sidebar_default_closed)
Trên mobile (<768px), sidebar phải đóng mặc định (off-canvas / -translate-x-full) và có backdrop overlay. ... ok
test_prototype_checker_strict_clean (tests.prototype.test_task_004_header_responsive.TestHeaderResponsiveTASK004.test_prototype_checker_strict_clean)
Sau khi cập nhật, check-prototype.py --strict phải đạt 0 lỗi, 0 cảnh báo. ... ok
test_responsive_overflow_protection (tests.prototype.test_task_004_header_responsive.TestHeaderResponsiveTASK004.test_responsive_overflow_protection)
Đảm bảo có thuộc tính bảo vệ chống tràn ngang (overflow-x protection) cho mobile 375px. ... ok
test_sidebar_backdrop_overlay_support (tests.prototype.test_task_004_header_responsive.TestHeaderResponsiveTASK004.test_sidebar_backdrop_overlay_support)
Khi mở sidebar trên mobile, phải hỗ trợ backdrop overlay để chạm ra ngoài là tự đóng. ... ok

----------------------------------------------------------------------
Ran 5 tests in 0.098s

OK

44 trang, 360 link nội bộ — 0 lỗi, 0 cảnh báo

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
