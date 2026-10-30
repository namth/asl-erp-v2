# ERP ASL LAW (qlcvasl-v2)

Hệ thống ERP nội bộ cho hãng luật ASL LAW, viết lại từ theme WordPress cũ (`qlcvaslgate-old/`).
Bối cảnh nghiệp vụ, tech stack và bất biến hệ thống nằm trong CONTEXT.md — luôn tuân thủ:

@CONTEXT.md

## Giai đoạn hiện tại

Dự án đang ở **pha đặc tả + prototype UI tĩnh**. Chưa có `frontend/`, `backend/`, `docker/`.
Khi bắt đầu code thật, theo đúng cấu trúc monorepo trong `docs/09-conventions.md` và thứ tự task trong `docs/11-tasks.md`.

## Bản đồ thư mục

| Thư mục / file | Vai trò | Được sửa? |
| :--- | :--- | :--- |
| `docs/` | Bộ tài liệu 01–13 là nguồn sự thật (SSOT) | Có — giữ đánh số & cấu trúc |
| `docs/features/` | Đặc tả từng tính năng (FEAT-xx) | Có |
| `docs/qa/reports/` | Báo cáo QA, tên `QA-REPORT-YYYYMMDD-HHMM.md` | Chỉ thêm mới |
| `prototype/` | Prototype HTML hiện hành (44 trang, chia theo module) | Có |
| `prototype/assets/layout.js`, `layout.css` | Sidebar/header dùng chung, theme sáng/tối, vai trò | Có — cẩn thận, ảnh hưởng mọi trang |
| `*.html` ở thư mục gốc | Bản prototype cũ (phẳng), đã thay bởi `prototype/` | Không, trừ khi được yêu cầu |
| `qlcvaslgate-old/` | Theme WordPress cũ — chỉ để tra cứu nghiệp vụ/trường dữ liệu | **Không sửa** |

## Quy ước prototype (`prototype/`)

- Mỗi trang: Tailwind CDN (`darkMode: 'class'`), font Plus Jakarta Sans + JetBrains Mono, nạp `../assets/layout.css?v=X` và `../assets/layout.js?v=X` (defer). Tăng `?v=` khi sửa assets dùng chung.
- Sidebar được `layout.js` tự mount vào `<aside id="sidebar">`; không viết sidebar cứng trong trang.
- 4 vai trò: `admin`, `manager`, `accountant`, `attorney`. Mọi link nội bộ phải giữ tham số `?role=` để sidebar không đổi khi chuyển trang.
- Mỗi màn hình có đủ 4 trạng thái UI: Empty, Skeleton loading, Success, Validation error (xem `docs/03-screens-and-ui.md`).
- Giao diện là "product-ready": **không** để mã đặc tả (`SCR-xx`, `TSK-xx`) trong text hiển thị, không để dòng hướng dẫn/demo, không có nút trùng chức năng trên cùng trang.
- Icon dùng SVG kiểu Lucide, không dùng emoji trong nút/nhãn (trừ huy hiệu trạng thái đã định nghĩa trong spec như `☕ Đang nghỉ ngơi`).
- Phải đạt WCAG 2.1 AA ở cả Light và Dark mode.
- Text giao diện bằng tiếng Việt có dấu, thuật ngữ nghiệp vụ thống nhất với `docs/02-modules-and-features.md`.

## Lệnh hữu ích

```bash
# Xem prototype cục bộ
python3 -m http.server 8080 --directory prototype   # mở http://localhost:8080

# Kiểm tra link nội bộ & quy ước prototype
python3 scripts/check-prototype.py            # thêm --strict để soát cả link thiếu ?role=
```

## Quy tắc khi code thật (backend/frontend)

- Đặt tên theo bảng trong `docs/09-conventions.md` (kebab-case file FE, snake_case Python, bảng PG số nhiều, label Neo4j PascalCase, quan hệ UPPER_SNAKE_CASE).
- API theo hợp đồng `docs/07-api-contracts.md` (`/api/v1`, mã lỗi đã định nghĩa). Đổi hợp đồng → cập nhật doc trong cùng thay đổi.
- Mọi endpoint đọc/ghi vụ việc phải đi qua guard `verify_need_to_know()` (Neo4j).
- `audit_logs` chỉ INSERT/SELECT — không bao giờ viết code/migration UPDATE hoặc DELETE bảng này.
- Không thêm task/stage ngoài Workflow Template (Strict Governance).
- Hoa hồng tính theo tiền thực thu, dùng `Decimal`, khớp đến từng đồng (TC-FIN-01/02).
- Server state dùng TanStack Query; Zustand chỉ cho UI state. Không lưu dữ liệu nghiệp vụ vào localStorage.
- Mỗi task trong `docs/11-tasks.md` có "Lệnh xác minh tự động" — chạy nó trước khi báo xong.
- Commit theo Conventional Commits: `feat(scope): ...`, `fix`, `sec`, `docs`... Nhánh `feat/<module>-<tên>`, `fix/<ticket>-<tên>`.

## Bảo mật

- Không đọc, in ra hay commit file bí mật: `.env*`, `qlcvaslgate-old/datacenter/secret.php`, thông tin FTP hosting.
- Chỉ tạo `.env.example` với giá trị giả, theo mẫu trong `docs/10-env-and-security.md`.

## Cách làm việc

- Trả lời và viết tài liệu bằng tiếng Việt.
- Trước khi sửa một module, đọc doc liên quan trong `docs/` (bảng map ở CONTEXT.md mục 4).
- Khi thay đổi nghiệp vụ/UI làm lệch tài liệu, cập nhật doc tương ứng luôn, không để docs và prototype lệch nhau.
