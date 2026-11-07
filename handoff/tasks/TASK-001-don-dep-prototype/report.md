# Báo cáo TASK-001

## Đã làm
- **Dọn mã đặc tả (Brief 4.1):** Tại `prototype/operations/floorplan.html`, đã xoá mã `SCR-15` ở thẻ `<title>` (dòng 7) và breadcrumb (dòng 113), giữ lại tên nghiệp vụ "Văn Phòng Số Trực Quan".
- **Dọn emoji/ký hiệu trong nút (Brief 4.2):** Tại `prototype/accounting/index.html` dòng 194, đã thay ký hiệu `✓` bằng icon SVG kiểu Lucide `check` (`<svg class="w-3.5 h-3.5" ... aria-hidden="true">`) với màu chữ kế thừa và bổ sung `flex items-center gap-1.5`. Quét toàn bộ 44 trang đạt 0 emoji trong nút/link.
- **Giữ vai trò trên mọi link nội trang — Lớp tĩnh (Brief 4.3.1):** Thêm tham số mặc định `role=admin` trên toàn bộ 358 liên kết nội bộ trỏ tới file `.html` trên 42 trang HTML, giữ nguyên toàn bộ query params và hash anchors.
- **Giữ vai trò trên mọi link nội trang — Lớp động (Brief 4.3.2):** Bổ sung hàm `syncRoleToLinks(currentRole)` vào `prototype/assets/layout.js`, sử dụng `document.querySelectorAll('a[href]')` và `URL` / `URLSearchParams` để cập nhật lại `?role=` theo vai trò thực tế của người dùng khi trang khởi tạo (`initLayout`).
- **Nâng phiên bản assets dùng chung (Brief 4.4):** Nâng toàn bộ tham số phiên bản của `layout.css` và `layout.js` từ `v=3.1`/`v=3.2` lên `v=3.3` trên tất cả 42 trang HTML có nạp assets.
- **Trang đăng nhập `prototype/auth/login.html`:** Tuân thủ phạm vi — chỉ cập nhật `?role=admin` cho 3 liên kết theo báo cáo của checker (`../dashboard/index.html` và `../index.html`), cập nhật `layout.css?v=3.3`, không thay đổi bất kỳ nội dung nào khác.

## File đã tạo/sửa
- `prototype/operations/floorplan.html`: Bỏ mã đặc tả `SCR-15`, nâng assets lên `v=3.3`, thêm `role=admin` cho các link nội bộ.
- `prototype/accounting/index.html`: Thay ký hiệu `✓` bằng icon SVG Lucide check, nâng assets lên `v=3.3`, thêm `role=admin` cho các link nội bộ.
- `prototype/assets/layout.js`: Thêm hàm `syncRoleToLinks` đồng bộ động `role` trên mọi link nội trang trỏ tới `.html` theo `currentRole`.
- `prototype/auth/login.html`: Bổ sung `?role=admin` cho 3 link nội bộ và nâng `layout.css?v=3.3`.
- 40 trang prototype HTML còn lại: Cập nhật tĩnh `role=admin` cho các link nội bộ và nâng `layout.css` / `layout.js` lên `v=3.3`:
  - `prototype/index.html`
  - `prototype/accounting/create-invoice.html`
  - `prototype/accounting/detail.html`
  - `prototype/ai-assistant/index.html`
  - `prototype/approvals/index.html`
  - `prototype/audit-logs/index.html`
  - `prototype/cases/create.html`
  - `prototype/cases/detail.html`
  - `prototype/cases/edit.html`
  - `prototype/cases/index.html`
  - `prototype/client-portal/index.html`
  - `prototype/crm/create-lead.html`
  - `prototype/crm/customers.html`
  - `prototype/crm/detail.html`
  - `prototype/crm/edit.html`
  - `prototype/crm/index.html`
  - `prototype/crm/list.html`
  - `prototype/dashboard/index.html`
  - `prototype/documents/create.html`
  - `prototype/documents/detail.html`
  - `prototype/documents/index.html`
  - `prototype/finance/detail.html`
  - `prototype/finance/index.html`
  - `prototype/reports/index.html`
  - `prototype/settings/index.html`
  - `prototype/tasks/create.html`
  - `prototype/tasks/detail.html`
  - `prototype/tasks/index.html`
  - `prototype/tasks/list.html`
  - `prototype/timesheet/create.html`
  - `prototype/timesheet/index.html`
  - `prototype/users/create.html`
  - `prototype/users/detail.html`
  - `prototype/users/edit.html`
  - `prototype/users/index.html`
  - `prototype/workflows/create.html`
  - `prototype/workflows/detail.html`
  - `prototype/workflows/edit.html`
  - `prototype/workflows/index.html`

## Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-001-don-dep-prototype/verify.sh
test_checker_strict_clean (tests.prototype.test_task_001_cleanup.TestPrototypeConventions.test_checker_strict_clean) ... ok
test_no_emoji_in_buttons_or_links (tests.prototype.test_task_001_cleanup.TestPrototypeConventions.test_no_emoji_in_buttons_or_links) ... ok
test_role_links_follow_current_role_at_runtime (tests.prototype.test_task_001_cleanup.TestPrototypeConventions.test_role_links_follow_current_role_at_runtime)
layout.js phải đồng bộ ?role= của mọi link nội trang theo vai trò hiện tại, ... ok
test_role_param_uses_current_role (tests.prototype.test_task_001_cleanup.TestPrototypeConventions.test_role_param_uses_current_role)
Link nội trang không được hard-code một vai trò cố định khác nhau trong cùng trang ... ok
test_shared_assets_version_bumped_consistently (tests.prototype.test_task_001_cleanup.TestPrototypeConventions.test_shared_assets_version_bumped_consistently)
Sửa layout.js → tăng ?v= (CLAUDE.md). Mọi trang phải dùng cùng phiên bản 3.3 cho cả js và css. ... ok

----------------------------------------------------------------------
Ran 5 tests in 0.174s

OK
44 trang, 363 link nội bộ — 0 lỗi, 0 cảnh báo
TASK-001: PASS

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
- Mục kiểm tra trực quan trên trình duyệt (`cases/index.html?role=accountant` và click điều hướng): Chưa thực hiện được do môi trường thực thi dòng lệnh không có giao diện đồ hoạ trình duyệt. Logic đã được xác thực qua unit test DOM và node syntax check. Trưởng phòng có thể kiểm tra trực quan khi nghiệm thu.
- Không có điểm lệch nào khác so với brief.

## Vòng sửa 1

### Đã làm
- **Cung cấp `window.withRole(url, role)` trong `prototype/assets/layout.js`**: Tự động gắn tham số `role` hiện tại vào URL, giữ nguyên query/hash và định dạng tương đối. Expose vào `window.withRole` và `window.ASL_LAYOUT.withRole`.
- **Thêm listener `document.addEventListener('click', ...)` trong `prototype/assets/layout.js`**: Khi người dùng bấm vào bất kỳ thẻ `<a>` nội bộ trỏ tới `.html`, cập nhật lại `role` trong `href` ngay trước khi điều hướng, phủ được cả các link sinh động sau khi tải trang bằng JS template (như trong `crm/index.html` và `accounting/index.html`).
- **Thay thế chuyển trang JavaScript bằng `location.href = withRole(...)`**: Đổi 9 vị trí gán chuỗi `.html` cứng thành `withRole(...)`:
  - `prototype/accounting/create-invoice.html`: dòng 227 (`window.location.href = withRole('index.html');`)
  - `prototype/cases/create.html`: dòng 55 (`window.location.href=withRole('detail.html');`)
  - `prototype/cases/edit.html`: dòng 59 (`window.location.href=withRole('detail.html');`)
  - `prototype/crm/create-lead.html`: dòng 226 (`window.location.href = withRole('index.html');`)
  - `prototype/crm/edit.html`: dòng 52 (`window.location.href=withRole('detail.html');`)
  - `prototype/tasks/create.html`: dòng 52 (`window.location.href=withRole('index.html');`)
  - `prototype/tasks/detail.html`: dòng 71 (`window.location.href=withRole('index.html');`)
  - `prototype/workflows/create.html`: dòng 52 (`window.location.href=withRole('index.html');`)
  - `prototype/workflows/edit.html`: dòng 52 (`window.location.href=withRole('index.html');`)
- **Giữ nguyên phiên bản assets `?v=3.3`**.

### Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-001-don-dep-prototype/verify.sh
test_checker_strict_clean (tests.prototype.test_task_001_cleanup.TestPrototypeConventions.test_checker_strict_clean) ... ok
test_js_navigation_keeps_role (tests.prototype.test_task_001_cleanup.TestPrototypeConventions.test_js_navigation_keeps_role)
Chuyển trang bằng JS (vd sau khi Lưu form) phải đi qua withRole(), không gán thẳng chuỗi .html — ... ok
test_layout_exposes_with_role_and_syncs_on_click (tests.prototype.test_task_001_cleanup.TestPrototypeConventions.test_layout_exposes_with_role_and_syncs_on_click)
layout.js phải (1) cung cấp window.withRole(url) để code trang dùng khi chuyển trang, ... ok
test_no_emoji_in_buttons_or_links (tests.prototype.test_task_001_cleanup.TestPrototypeConventions.test_no_emoji_in_buttons_or_links) ... ok
test_role_links_follow_current_role_at_runtime (tests.prototype.test_task_001_cleanup.TestPrototypeConventions.test_role_links_follow_current_role_at_runtime)
layout.js phải đồng bộ ?role= của mọi link nội trang theo vai trò hiện tại, ... ok
test_role_param_uses_current_role (tests.prototype.test_task_001_cleanup.TestPrototypeConventions.test_role_param_uses_current_role)
Link nội trang không được hard-code một vai trò cố định khác nhau trong cùng trang ... ok
test_shared_assets_version_bumped_consistently (tests.prototype.test_task_001_cleanup.TestPrototypeConventions.test_shared_assets_version_bumped_consistently)
Sửa layout.js → tăng ?v= (CLAUDE.md). Mọi trang phải dùng cùng phiên bản 3.3 cho cả js và css. ... ok

----------------------------------------------------------------------
Ran 7 tests in 0.182s

OK
44 trang, 363 link nội bộ — 0 lỗi, 0 cảnh báo
TASK-001: PASS

KẾT QUẢ: khoá test OK, verify.sh exit 0
```
