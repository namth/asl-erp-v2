# Báo cáo TASK-037

## Đã làm
- Hiện thực hoá module `backend/app/services/report_export.py` với các hàm `build_report_xlsx`, `export_filename`, `content_disposition`.
- Hỗ trợ đầy đủ 3 loại báo cáo theo đặc tả `docs/07` §3.9 và `brief.md`:
  - `revenue`: 4 sheets ("Tổng quan", "Theo kỳ", "Theo phòng ban", "Theo loại vụ việc").
  - `commissions`: 2 sheets ("Tổng quan", "Theo nhân sự" kèm dòng "Tổng cộng" in đậm, cộng bằng Decimal).
  - `operations`: 4 sheets ("Vụ việc theo trạng thái", "Task quá hạn", "Thời gian giai đoạn", "Chuyển đổi cơ hội").
- Báo cáo với tên ngoài tập `{revenue, commissions, operations}` ném ngoại lệ `ValueError`.
- Chuẩn hóa định dạng hiển thị:
  - Bảng có dòng tiêu đề in đậm ở dòng 1; dữ liệu từ dòng 2; bảng rỗng vẫn giữ dòng tiêu đề.
  - Sheet nhãn–giá trị: cột A nhãn, cột B giá trị từ dòng 1.
  - Tiền dạng chuỗi chuyển sang số nguyên `int(Decimal(x))` với `number_format = "#,##0"`, đảm bảo chính xác từng đồng kể cả số tiền rất lớn. Tỷ lệ và số ngày trung bình dùng `Decimal(x)`. Đếm dùng `int`.
  - Ngày `YYYY-MM-DD` chuyển thành `DD/MM/YYYY`. Kỳ báo cáo dạng `"{from} – {to}"`.
  - Phạm vi hiển thị theo quy tắc: `FIRM` → `Toàn hãng`, `SELF` → `Cá nhân`, `DEPARTMENT` → `Phòng ban: <danh sách phòng>`.
- Chống chèn công thức (Formula injection): các chuỗi bắt đầu bằng `=`, `+`, `-`, `@`, tab hoặc `\r` được gắn tiền tố `'` và gán kiểu chuỗi (`s`). Giá trị `null` hiển thị ô trống.
- Hàm `content_disposition` mã hoá RFC 5987 bằng `urllib.parse.quote(filename, safe="")`.
- Module hàm thuần độc lập hoàn toàn với database và web framework, chỉ dùng `openpyxl` và thư viện chuẩn.

## File đã tạo/sửa
- `backend/app/services/report_export.py`: Module dựng tệp `.xlsx` cho 3 báo cáo SCR-18 (TSK-15, phần thuần).

## Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-037-xuat-excel-bao-cao/verify.sh
................                                                         [100%]
16 passed in 0.20s

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
