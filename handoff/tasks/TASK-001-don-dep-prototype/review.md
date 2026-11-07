# Nghiệm thu TASK-001 — vòng 1: CHƯA ĐẠT (1 hạng mục)

Phần đã làm **đạt**, giữ nguyên, không sửa lại:
- Bỏ `SCR-15`, thay `✓` bằng SVG, `role=admin` trên 358 link, `?v=3.3` trên mọi trang, phạm vi file đúng, không đụng test.
- `syncRoleToLinks` chạy đúng trên trình duyệt: `cases/index.html?role=accountant` → 35/35 link thành `role=accountant`; bấm vụ việc → trang đích giữ `role=accountant`, sidebar Kế toán.

Ghi chú: phần hở dưới đây là do đặc tả/test vòng trước chưa nói tới — không phải lỗi làm sai. Trưởng phòng đã bổ sung 2 test và khoá lại.

## 1. Chuyển trang bằng JavaScript làm mất vai trò

**Tái hiện:** xoá localStorage, mở `cases/edit.html?role=accountant`, bấm Lưu → về `cases/detail.html` **không có `?role=`**, sidebar đổi sang Quản Trị Viên.

**Nguyên nhân:**
- 9 chỗ gán thẳng `location.href = '…html'` (onsubmit/onclick sau khi lưu form):
  `accounting/create-invoice.html:227`, `cases/create.html:55`, `cases/edit.html:59`, `crm/create-lead.html:226`, `crm/edit.html:52`, `tasks/create.html:52`, `tasks/detail.html:71`, `workflows/create.html:52`, `workflows/edit.html:52`.
- 2 link sinh bằng template JS sau khi trang tải xong nên `syncRoleToLinks` (chạy một lần lúc init) không thấy: `crm/index.html:474` (`../cases/create.html?lead=${client}…`), `accounting/index.html:909` (`${linkVal}`).

**Kỳ vọng:**
1. `prototype/assets/layout.js` gán `window.withRole = function (url) { … }`: trả về `url` với tham số `role` = vai trò hiện tại (dùng `URL`/`URLSearchParams`, giữ nguyên query/hash khác, giữ đường dẫn tương đối như `syncRoleToLinks` đang làm). Có thể dùng lại logic trong `syncRoleToLinks`.
2. `layout.js` thêm `document.addEventListener('click', …)`: khi người dùng bấm một `<a href>` nội bộ trỏ tới `.html`, đặt lại `role` trong href theo vai trò hiện tại **ngay trước khi điều hướng** — phủ cả link sinh bằng JS. Giữ `syncRoleToLinks` lúc init (để hover/copy link cũng đúng).
3. 9 chỗ ở trên đổi thành `location.href = withRole('detail.html')` (giữ nguyên `alert`, `event.preventDefault()` và mọi logic khác).
4. Không đổi `?v=3.3` (vẫn trong cùng task, chưa phát hành).

**Test tương ứng (đã khoá):** `test_js_navigation_keeps_role`, `test_layout_exposes_with_role_and_syncs_on_click` trong `tests/prototype/test_task_001_cleanup.py`.

**Tự kiểm:** `python3 scripts/handoff.py verify TASK-001` (7/7 test phải đạt). Không chạy `bash` trực tiếp.
