# Báo cáo TASK-035

## Đã làm
- **TC-MISA-03 & TC-FIN-05 (Thu một phần rồi thu đủ, mở khoá stage, dồn quỹ thực hiện):** Hiện thực hoá luồng xác nhận thu tiền đợt 1 (30tr) chuyển trạng thái sang `PARTIALLY_PAID`, ghi nhận hoa hồng cho các vai trò theo tỷ lệ chính sách, chính sách bị khoá (`locked_at`); lần thu 2 (30tr) chuyển sang `PAID_CONFIRMED`, mở khoá các stage bị chặn (`WAITING_PAYMENT` -> `ACTIVE`), ghi nhận sự kiện `MILESTONE_PAID` vào `outbox_events`, quỹ thực hiện dồn sang `commission_carry_forwards`.
- **TC-MISA-02 & TC-FIN-01 & Thu thừa (Cảnh báo OVERPAYMENT):** Xác nhận đủ tiền 1 lần, mở khoá stage; trường hợp thu thừa tiền phát cảnh báo `OVERPAYMENT` với số tiền thừa trong danh sách `warnings`, hoa hồng tính trên số tiền thực về.
- **Không có Supervisor / Người mang khách:** Phân bổ toàn bộ quỹ quản lý cho `CASE_MANAGER`, không sinh dòng hoa hồng `ORIGINATOR` khi không có cơ hội/người mang khách.
- **TC-FIN-04 (Dồn quỹ khi chưa có task đủ điều kiện):** Dồn toàn bộ quỹ thực hiện vào `commission_carry_forwards` khi chưa có task hoàn thành; khi đợt sau thu tiền và có task hoàn thành thì tiêu thụ quỹ dồn và cập nhật `consumed_by_misa_transaction_id`.
- **TC-MISA-04 (Chống trùng bank_ref_code):** Chặn các request gửi trùng mã giao dịch ngân hàng với mã lỗi 409 `DUPLICATE_BANK_REF`, không làm thay đổi số tiền hay sinh thêm hoa hồng.
- **TC-MISA-05 (Idempotency-Key & Bấm đúp):** Xử lý an toàn khi gửi đồng thời hoặc gửi lại cùng `Idempotency-Key` (trả lại kết quả nhất quán, cùng thứ tự phân bổ hoa hồng); chặn dùng lại key với nội dung khác bằng lỗi 409 `IDEMPOTENCY_KEY_REUSED`.
- **Validation & Rollback:** Kiểm tra chặt chẽ `Idempotency-Key` (UUID), `misa_invoice_no`, `bank_ref_code`, `received_amount` (chuỗi số > 0, tối đa 2 chữ số thập phân); rollback toàn bộ và trả 409 `CASE_MANAGER_REQUIRED` khi vụ việc chưa có Case Manager.
- **TC-FIN-08 (Chính sách hoa hồng vụ việc):** GET/PUT `/api/v1/cases/{case_id}/commission-policy`, phân quyền Quản lý chỉnh sửa, Kế toán xem (phạm vi `finance`), chặn Luật sư (403), chặn sửa khi đã khoá (409 `COMMISSION_POLICY_LOCKED`), chặn tổng tỷ lệ > 100% (422 `COMMISSION_RATES_EXCEED_100`), ghi `audit_logs` khi cập nhật.
- **Đợt thu của vụ việc:** GET `/api/v1/cases/{case_id}/milestones` sắp theo `order_index`, kèm thông tin `triggered_by_task`.
- **Hòm thư Kế toán:** GET `/api/v1/accounting/inbox` chỉ cho `ACCOUNTANT`, hỗ trợ lọc đa trạng thái, tìm kiếm `q` (mã vụ việc, tên vụ việc, tên khách hàng), phân trang `meta`, kèm danh sách `payments` xác nhận.

## File đã tạo/sửa
- `backend/app/schemas/accounting.py`: Định nghĩa Pydantic schemas cho request xác nhận thu tiền, cập nhật chính sách hoa hồng, items hoa hồng, cảnh báo và phân trang.
- `backend/app/services/payments.py`: Xử lý nghiệp vụ xác nhận thanh toán MISA trong 1 transaction nguyên tử (khoá đợt thu `FOR UPDATE`, idempotency, phân bổ hoa hồng qua `commission_engine`, dồn quỹ, mở khoá stage, outbox, audit log) và truy vấn hòm thư Kế toán.
- `backend/app/services/commission_policies.py`: Nghiệp vụ lấy danh sách đợt thu theo vụ việc, xem và cập nhật chính sách hoa hồng với audit log.
- `backend/app/api/accounting.py`: Router `/accounting` gồm endpoint `POST /confirm-payment` và `GET /inbox` (phân quyền `ACCOUNTANT`, kiểm tra CSRF).
- `backend/app/api/case_finance.py`: Router `/cases` gồm endpoint `GET /{case_id}/milestones`, `GET|PUT /{case_id}/commission-policy` (phân quyền `finance` / `MANAGER`, kiểm tra CSRF).
- `backend/app/main.py`: Đăng ký `accounting_router` và `case_finance_router` vào ứng dụng FastAPI chính.

## Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-035-thu-tien-misa-be/verify.sh
..............................................                           [100%]
46 passed in 536.80s (0:08:56)

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
