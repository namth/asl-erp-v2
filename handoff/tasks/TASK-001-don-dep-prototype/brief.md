# TASK-001 — Dọn quy ước prototype: mã đặc tả, emoji trong nút, giữ ?role= trên mọi link

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity

## 1. Mục tiêu
Đưa 44 trang `prototype/` về đúng quy ước "product-ready" trong `CLAUDE.md`. Đây là mục U5 và một phần U8 trong báo cáo `docs/qa/reports/QA-REPORT-20261030-2318.md`. Người dùng phải giữ nguyên vai trò khi bấm **bất kỳ** link nào, kể cả khi mở tab mới hoặc trình duyệt khác (không dựa vào localStorage).

## 2. Tài liệu bắt buộc đọc
- `CLAUDE.md` mục "Quy ước prototype"
- `docs/qa/reports/QA-REPORT-20261030-2318.md` mục 3 (U5, U8)
- `prototype/assets/layout.js` — đoạn đọc `?role=` (khoảng dòng 178–186) và hàm đổi vai trò (khoảng dòng 680)
- `scripts/check-prototype.py` — cách checker xác định link nội bộ

## 3. Phạm vi file
**Được tạo/sửa:**
- `prototype/**/*.html` (44 trang)
- `prototype/assets/layout.js`

**Không được sửa:**
- Mọi file trong `tests.lock`: `verify.sh`, `tests/prototype/test_task_001_cleanup.py`
- `scripts/check-prototype.py`
- `prototype/assets/layout.css`, `prototype/assets/sidebar-*.html`
- `prototype/auth/login.html` — **chỉ** được thêm `?role=` nếu checker báo; không đổi nội dung khác (trang này đang chờ quyết định nghiệp vụ)
- `docs/`, `qlcvaslgate-old/`

## 4. Đặc tả chi tiết

### 4.1. Lộ mã đặc tả
`prototype/operations/floorplan.html` dòng 7 (`<title>`) và dòng 113: bỏ `SCR-15`, giữ tên nghiệp vụ "Văn Phòng Số Trực Quan".

### 4.2. Emoji/ký hiệu trong nút và link
`prototype/accounting/index.html` dòng 194: thay `✓` bằng icon SVG kiểu Lucide `check` (`<svg ... class="w-3.5 h-3.5" aria-hidden="true">`), cùng màu chữ. Quét lại toàn bộ trang, xử lý mọi chỗ test báo.

### 4.3. Giữ vai trò trên mọi link nội trang — hai lớp
1. **Tĩnh (trong HTML):** mọi `href` trỏ tới trang `.html` nội bộ phải có tham số `role=`. Dùng giá trị mặc định **`role=admin`** cho mọi trang (không chọn vai trò khác nhau trong cùng một trang). Giữ nguyên query/hash sẵn có: `detail.html?id=5#tab` → `detail.html?id=5&role=admin#tab`.
2. **Động (`layout.js`):** sau khi xác định `currentRole`, duyệt `document.querySelectorAll('a[href]')` và đặt lại tham số `role` của các link nội bộ trỏ tới `.html` thành `currentRole`. Bỏ qua link ngoài (`http:`, `https:` khác origin), `#…`, `mailto:`, `tel:`, `javascript:`. Dùng `URL`/`URLSearchParams`, không nối chuỗi thủ công. Các link do `layout.js` tự sinh (sidebar, header) đã đúng sẵn, không cần đổi.

Nên viết một script tạm (để trong thư mục scratch của bạn, **không** commit vào repo) để chèn `role=admin` hàng loạt, rồi soát lại diff.

### 4.4. Tăng phiên bản assets
Mọi trang đang nạp `layout.js?v=3.1|3.2` và `layout.css?v=3.1|3.2` → đổi hết thành `?v=3.3` cho cả hai file.

## 5. Tiêu chí nghiệm thu
- [ ] `bash handoff/tasks/TASK-001-don-dep-prototype/verify.sh` exit 0
- [ ] `python3 scripts/check-prototype.py --strict` → `44 trang, ≥363 link nội bộ — 0 lỗi, 0 cảnh báo`
- [ ] Mở `cases/index.html?role=accountant`, bấm vào một vụ việc → URL trang đích có `role=accountant` và sidebar là sidebar Kế toán (tự kiểm trên trình duyệt, ghi kết quả vào report)
- [ ] Không có thay đổi nào ngoài phạm vi mục 3 (`git status` sạch ngoài các file đó)

## 6. Ràng buộc & bẫy cần tránh
- **Không xoá link hay trang** để né checker — test có ngưỡng tối thiểu 44 trang / 363 link.
- **Không** đổi `role=admin` thành vai trò khác theo từng trang; đồng bộ theo vai trò thực tế là việc của `layout.js` lúc chạy.
- **Không** sửa giao diện, văn bản hay bố cục ngoài các điểm ở mục 4 — đây là task dọn dẹp, không phải thiết kế lại.
- Không thêm thư viện hay CDN mới.
- `layout.js` phải qua `node --check`. Không dùng cú pháp làm hỏng trang khi không có `?role=` trên URL (khi đó vẫn đọc vai trò từ localStorage như hiện tại).
