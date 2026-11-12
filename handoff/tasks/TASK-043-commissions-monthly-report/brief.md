# TASK-043 — Báo cáo hoa hồng theo tháng, bỏ trạng thái chi trả (DEC-09)

> Người giao: Claude (Trưởng phòng) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (tiền — tổng khớp từng đồng)

## 1. Mục tiêu
Chủ dự án chốt **DEC-09** (`docs/14-decisions.md`): hệ thống chỉ chia hoa hồng và **thống kê theo từng tháng**; chi trả làm ngoài hệ thống. Cần:
1. `GET /api/v1/reports/commissions` + `/reports/commissions/export` đổi sang dạng theo tháng đúng `docs/07-api-contracts.md` mục `GET /api/v1/reports/commissions` (§3.9) — `summary {total_amount, transaction_count, by_role}`, `periods`, `by_period`, `by_user[].by_period`; tệp Excel 3 sheet như mô tả ở đó.
2. Bỏ mọi xử lý `payout_status` / "tích luỹ / đã chi": tham số `payout_status` của báo cáo và sổ hoa hồng bị **bỏ qua** (không 422), sổ hoa hồng `GET /finance/commissions` không trả trường `payout_status`.

## 2. Tài liệu bắt buộc đọc
- `docs/14-decisions.md` DEC-09; `docs/07-api-contracts.md` §3.9 (quy ước chung + mục commissions), mục `GET /api/v1/finance/commissions`
- Code hiện tại: `backend/app/services/reports.py` (`get_commissions_data`, `generate_periods` — dùng lại cho danh sách tháng), `backend/app/api/reports.py`, `backend/app/services/report_export.py` (`_build_commissions_wb`, cách các sheet khác ghi tiền/in đậm dòng tổng), `backend/app/services/commission_ledger.py`, `backend/app/api/finance_commissions.py`

## 3. Phạm vi file
**Được tạo/sửa:**
- `backend/app/services/reports.py`
- `backend/app/api/reports.py`
- `backend/app/services/report_export.py`
- `backend/app/services/commission_ledger.py`
- `backend/app/api/finance_commissions.py`

**Test (đã viết, đã khoá):** `backend/tests/test_reports_api.py`, `backend/tests/test_report_export.py`, `backend/tests/test_finance_commissions_api.py`, `verify.sh`.
**Không được sửa:** file trong `tests.lock`; `docs/`; `frontend/`; migration; trigger DB.

## 4. Blueprint
- Tháng của bút toán: `to_char(ct.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM')`. Một truy vấn `GROUP BY user_id, role_type, month` (cùng điều kiện phạm vi/kỳ như hiện tại) rồi gộp bằng `Decimal` trong Python; `transaction_count` = `count(*)` cùng điều kiện.
- `periods` = `generate_periods(from, to, "month")`; mọi `by_period` điền `"0"` cho tháng trống, đúng thứ tự `periods`.
- `by_user` sắp `total_amount` giảm dần, hoà thì `full_name` tăng dần. Tiền trả chuỗi số nguyên như cách hiện tại (`format_money`/hàm định dạng đang dùng trong `reports.py`).
- Excel: sheet "Theo tháng" tiêu đề tháng `MM/YYYY` (từ `periods`); "Theo nhân sự" bỏ 2 cột Tích luỹ/Đã chi; "Tổng quan" có "Tổng hoa hồng" và "Số bút toán", không còn "Tích luỹ"/"Đã chi". Dòng "Tổng cộng" cộng bằng `Decimal`, in đậm như hiện tại.
- Bỏ hằng/kiểm tra `ALLOWED_PAYOUT_STATUS`; tham số có thể giữ trong chữ ký `Query` để không vỡ client cũ nhưng không dùng.

## 5. Tiêu chí nghiệm thu (đo được)
- `python3 scripts/handoff.py verify TASK-043` xanh (3 file test trên + `test_no_test_hooks_in_app.py`).
- `grep -rn "payout_status" backend/app/services/reports.py backend/app/services/report_export.py backend/app/services/commission_ledger.py` không còn dùng trong logic (chỉ chấp nhận trong comment).

## 6. Bẫy cần tránh
- Không float; tổng `by_user` = `summary.total_amount` = tổng `by_period` khớp từng đồng.
- Không UPDATE/DELETE `commission_transactions` hay `audit_logs`.
- Không sửa test; không `python3 -c` nhiều dòng, không `rm`, không ghép lệnh bằng `&&`; script tạm ở `handoff/tasks/TASK-043-commissions-monthly-report/scratch/`. Tự kiểm bằng `python3 scripts/handoff.py verify TASK-043`.
