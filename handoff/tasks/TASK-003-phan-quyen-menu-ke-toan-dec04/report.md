# Báo cáo TASK-003: Phân quyền menu theo DEC-04 và ẩn hành động chuyên môn với Kế toán

## Đã làm
- **`prototype/assets/layout.js`**:
  - Đã loại bỏ `itemPortal` khỏi danh sách menu mục `Tài Chính & Kế Toán` của Quản trị viên (Admin).
  - Đảm bảo `getMenuSections()` không chứa bất kỳ mục nào trỏ tới `client-portal` hoặc `timesheet` cho cả 4 vai trò (`admin`, `manager`, `accountant`, `attorney`).
- **`prototype/cases/index.html`**:
  - Bổ sung thuộc tính `data-role-hide="accountant"` cho nút "Tạo Vụ Việc Mới" (`a[href*="create.html"]`).
  - Cập nhật hàm `syncRoleTableColumns()` kiểm tra vai trò người dùng (`accountant`), tự động ẩn nút Tạo Vụ Việc Mới khi người dùng là Kế toán theo đúng DEC-01 và Bất biến #2.
- **`prototype/cases/detail.html`**:
  - Bổ sung thuộc tính `data-role-hide="accountant"` cho nút "Chỉnh Sửa" (`a[href*="edit.html"]`) và nút "Trình Phê Duyệt" (`button[onclick*="openApprovalModal"]`).
  - Thêm hàm `syncRoleDetailActions()` kiểm tra vai trò người dùng (`accountant`), tự động ẩn nút Chỉnh Sửa và Trình Phê Duyệt khi người dùng là Kế toán, đồng thời bảo toàn tham số `?role=` trên các liên kết.
- **Tính toàn vẹn hệ thống**:
  - Giữ nguyên giao diện, theme Dark/Light và responsive.
  - `python3 scripts/check-prototype.py --strict` đạt 0 lỗi, 0 cảnh báo trên toàn bộ 44 trang và 360 liên kết nội bộ.

## File đã tạo/sửa
- `prototype/assets/layout.js`: Bỏ itemPortal khỏi menu Admin, chuẩn hóa getMenuSections theo DEC-04.
- `prototype/cases/index.html`: Thêm thuộc tính và logic ẩn nút Tạo Vụ Việc Mới với Kế toán.
- `prototype/cases/detail.html`: Thêm thuộc tính và script ẩn nút Chỉnh Sửa & Trình Phê Duyệt với Kế toán.

## Kết quả tự kiểm
```text
$ bash handoff/tasks/TASK-003-phan-quyen-menu-ke-toan-dec04/verify.sh
test_accountant_no_create_case_in_cases_index (tests.prototype.test_task_003_role_menu_dec04.TestRoleMenuDEC04.test_accountant_no_create_case_in_cases_index)
DEC-01 & Bất biến #2: Kế toán chỉ quản lý đợt thu/tài chính, không được tạo vụ việc mới. ... ok
test_accountant_no_edit_case_in_cases_detail (tests.prototype.test_task_003_role_menu_dec04.TestRoleMenuDEC04.test_accountant_no_edit_case_in_cases_detail)
DEC-01 & Bất biến #2: Kế toán không có thẩm quyền chỉnh sửa vụ việc hoặc phê duyệt chuyên môn pháp lý. ... ok
test_dec04_no_client_portal_in_menu (tests.prototype.test_task_003_role_menu_dec04.TestRoleMenuDEC04.test_dec04_no_client_portal_in_menu)
DEC-04: Cổng khách hàng (Client Portal) thuộc Phase 2, phải ẩn khỏi menu sidebar của mọi vai trò. ... ok
test_dec04_no_timesheet_in_menu (tests.prototype.test_task_003_role_menu_dec04.TestRoleMenuDEC04.test_dec04_no_timesheet_in_menu)
DEC-04: Chấm công (Timesheet) thuộc Phase 2, không được xuất hiện trong bất kỳ menu nào. ... ok
test_prototype_checker_remains_clean (tests.prototype.test_task_003_role_menu_dec04.TestRoleMenuDEC04.test_prototype_checker_remains_clean)
Đảm bảo sau khi cập nhật, check-prototype.py --strict vẫn đạt 0 lỗi, 0 cảnh báo. ... ok

----------------------------------------------------------------------
Ran 5 tests in 0.096s

OK

44 trang, 360 link nội bộ — 0 lỗi, 0 cảnh báo

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
