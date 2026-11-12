# TASK-037 — Dựng tệp Excel cho 3 báo cáo SCR-18 (TSK-15, phần thuần)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW–MEDIUM · **Nhạy cảm:** trung bình (số tiền khớp từng đồng, chống chèn công thức)
> **Phụ thuộc:** không. Module **hàm thuần** (không DB, không API); task backend báo cáo sau sẽ gọi nó cho `GET /reports/{name}/export`.

## 1. Mục tiêu
Viết `backend/app/services/report_export.py`: nhận `data` + `meta` đúng hình dạng JSON của 3 báo cáo trong `docs/07` §3.9 → trả nội dung tệp `.xlsx` (bytes), cùng hàm đặt tên tệp và header `Content-Disposition`.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` **§3.9** (hình dạng `data`/`meta` của `revenue`, `commissions`, `operations`, quy tắc tên tệp export)
- `frontend/src/components/reports/*.tsx` — nhãn cột đang hiển thị trên giao diện (Excel dùng cùng nhãn)
- `.agents/rules/vai-tro-ky-su-thuc-thi.md` (luật 12, 13)

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `backend/app/services/report_export.py`

**Người viết test:** `backend/tests/test_report_export.py` và `verify.sh` của task (đã viết, đã khoá).

**Không được sửa:** mọi file trong `tests.lock`; mọi file khác trong `backend/`, `frontend/`, `docs/`.

## 4. Giao diện
```python
def build_report_xlsx(name: str, data: dict, meta: dict) -> bytes
def export_filename(name: str, date_from: str, date_to: str) -> str   # "bao-cao-{name}-{from}-{to}.xlsx"
def content_disposition(filename: str) -> str                        # "attachment; filename*=UTF-8''<percent-encoded>"
```
- `name` ∉ {`revenue`, `commissions`, `operations`} (phân biệt hoa thường) → `ValueError` ở cả `build_report_xlsx` và `export_filename`.
- Chỉ dùng `openpyxl` (đã có trong `backend/requirements.txt`) + thư viện chuẩn. Không import DB/framework.
- `content_disposition`: percent-encode **toàn bộ** tên tệp theo RFC 5987 (`urllib.parse.quote(filename, safe="")`).

## 5. Bố cục tệp (test kiểm đúng từng chi tiết)
**Quy ước chung:**
- Sheet dạng bảng: dòng 1 là tiêu đề cột (in đậm), dữ liệu từ dòng 2. Bảng rỗng vẫn có dòng tiêu đề.
- Sheet dạng nhãn–giá trị (“Tổng quan”, “Chuyển đổi cơ hội”): mỗi dòng cột A = nhãn, cột B = giá trị, bắt đầu từ dòng 1.
- Tiền (chuỗi trong JSON) → ô **số nguyên** `int(Decimal(x))`, `number_format = "#,##0"`. Tỷ lệ/số ngày trung bình → `Decimal(x)`. Đếm → `int`. Không đi qua số thực khi chuyển đổi.
- Ngày `YYYY-MM-DD` → chuỗi `DD/MM/YYYY`. `Kỳ` = `"{from} – {to}"` (dấu gạch ngang dài `–`, hai bên có dấu cách, ngày dạng `DD/MM/YYYY`).
- `Phạm vi`: `FIRM` → `Toàn hãng`; `SELF` → `Cá nhân`; `DEPARTMENT` → `Phòng ban: <tên các phòng trong meta.departments nối bằng ", ">`.
- **Chống chèn công thức:** mọi giá trị chuỗi bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc `\r` → thêm tiền tố `'` (ô kiểu chuỗi).
- Giá trị `null` → ô trống.

**`revenue`** — sheet theo thứ tự: `Tổng quan`, `Theo kỳ`, `Theo phòng ban`, `Theo loại vụ việc`.
- `Tổng quan`: `Báo cáo` = `Doanh thu thực thu`; `Kỳ`; `Phạm vi`; `Tổng thực thu`; `Tổng giá trị hợp đồng`; `Tỷ lệ thu (%)`; `Số lần thu`.
- `Theo kỳ`: `Kỳ | Thực thu`. `Theo phòng ban`: `Phòng ban | Thực thu`. `Theo loại vụ việc`: `Mã | Loại vụ việc | Thực thu | Giá trị hợp đồng`. Giữ nguyên thứ tự phần tử đầu vào.

**`commissions`** — `Tổng quan`, `Theo nhân sự`.
- `Tổng quan`: `Báo cáo` = `Hoa hồng`; `Kỳ`; `Phạm vi`; `Tổng hoa hồng`; `Tích luỹ`; `Đã chi`.
- `Theo nhân sự`: `Nhân sự | Phòng ban | Tổng hoa hồng | Tích luỹ | Đã chi | Mang khách về | Giám sát | Quản lý vụ việc | Thực hiện | Hỗ trợ` (5 cột cuối = `by_role` ORIGINATOR, SUPERVISOR, CASE_MANAGER, EXECUTOR, ASSISTANT; thiếu khoá → 0). Dòng cuối `Tổng cộng` (in đậm, cột Phòng ban trống) = tổng từng cột tiền, cộng bằng `Decimal`.

**`operations`** — `Vụ việc theo trạng thái`, `Task quá hạn`, `Thời gian giai đoạn`, `Chuyển đổi cơ hội` (không có sheet Tổng quan).
- `Vụ việc theo trạng thái`: `Trạng thái | Số vụ việc`, đúng thứ tự & nhãn: Khởi tạo (INITIALIZING), Đang thụ lý (ACTIVE), Tạm dừng (PAUSED), Đã đóng (CLOSED), Đã huỷ (TERMINATED).
- `Task quá hạn`: `Task | Mã vụ việc | Người thực hiện | Hạn | Số ngày quá hạn` (`assignee` null → ô trống).
- `Thời gian giai đoạn`: `Giai đoạn | Số lần hoàn thành | Số ngày trung bình`.
- `Chuyển đổi cơ hội`: `Cơ hội tạo mới`, `Thắng`, `Đã chuyển vụ việc`, `Tỷ lệ chuyển đổi (%)`.

## 6. Ràng buộc
- Test đỏ mà bạn cho là lỗi test → ghi `report.md` mục câu hỏi rồi dừng, không lách (luật 12).
- Không ghép nhiều lệnh shell bằng `&&`/`;`; chạy verify bằng `python3 scripts/handoff.py verify TASK-037`.
