# TASK-048 — Xuất Excel sổ hoa hồng (SCR-12)

> Người giao: Claude (Trưởng phòng) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** có (tiền — tổng khớp từng đồng; phạm vi dữ liệu theo vai trò)

## 1. Mục tiêu
Nút xuất trên trang Tài chính (`frontend/src/app/(dashboard)/finance/page.tsx` dòng ~47) gọi `GET /api/v1/finance/commissions/export` nhưng backend chưa có. Viết endpoint theo `docs/07-api-contracts.md` mục `GET /api/v1/finance/commissions` (đoạn về `/export`).

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` mục `GET /api/v1/finance/commissions` (cả đoạn export và đoạn phạm vi)
- Mẫu: `backend/app/services/commission_ledger.py` (truy vấn + phạm vi — dùng lại, không chép), `backend/app/api/finance_commissions.py`, `backend/app/services/report_export.py` (openpyxl, `content_disposition`, `_sanitize_string` chống công thức Excel, định dạng tiền), `backend/app/api/reports.py` (`export_report_endpoint` + audit)

## 3. Phạm vi file
**Được tạo/sửa:**
- `backend/app/api/finance_commissions.py` — thêm route `/export` (khai báo **trước** mọi route có tham số đường dẫn)
- `backend/app/services/commission_ledger.py` — chỉ tách phần dựng điều kiện lọc/phạm vi thành hàm dùng chung nếu cần; hành vi `GET /finance/commissions` giữ nguyên
- `backend/app/services/commission_ledger_export.py` (mới — dựng workbook)
- `backend/tests/test_finance_commissions_export.py` (tài khoản kiểm chéo viết, sau đó khoá)

**Không được sửa:** file trong `tests.lock`, `docs/`, `frontend/`, migration, `backend/app/services/report_export.py` (chỉ import).

## 4. Tiêu chí nghiệm thu (đo được — đầu vào để viết test)
- Kế toán, cùng bộ lọc `from/to/case_id` như test sổ hoa hồng: tệp mở được bằng openpyxl, sheet "Sổ hoa hồng", đúng 9 cột tiêu đề theo docs, số dòng dữ liệu = `total_records` của `GET /finance/commissions` cùng bộ lọc, thứ tự giống danh sách, ô tiền là `int`, dòng "Tổng cộng" = `summary.total_amount` (khớp từng đồng, kể cả số lẻ như `333333`).
- `Content-Type` là xlsx, `Content-Disposition` đúng mẫu tên tệp (không lọc ngày → `tat-ca`).
- Phạm vi: Luật sư chỉ dòng của mình (truyền `user_id` người khác vẫn chỉ ra của mình); Trưởng phòng chỉ nhân sự phòng mình; Quản trị viên `403 FORBIDDEN_ROLE`; chưa đăng nhập `401`.
- Tham số sai (`from > to`, `role_type` lạ) → `422 VALIDATION_ERROR`, không ghi audit; xuất thành công ghi đúng 1 audit `COMMISSIONS_EXPORTED` có `row_count`.
- Tên nhân sự/task bắt đầu bằng `=` không thành công thức trong ô.
- `bash handoff/tasks/TASK-048-commissions-ledger-export/verify.sh` xanh (test mới + `test_finance_commissions_api.py` + `test_no_test_hooks_in_app.py`).

## 5. Bẫy cần tránh
- Không float cho tiền; tổng cộng phải tính bằng `Decimal` trên toàn bộ kết quả, không cộng giá trị đã làm tròn.
- Không chép lại logic phạm vi — dùng chung với GET để hai bên không lệch.
- Không UPDATE `commission_transactions`/`audit_logs`; không ghép giá trị vào chuỗi SQL.
- Không sửa test đã khoá; không `python3 -c` nhiều dòng; không `rm`/`&&`/`git`/`sed`/`cat`/`grep`. File tạm ở `handoff/tasks/TASK-048-commissions-ledger-export/scratch/`.
