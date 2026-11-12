# Báo cáo TASK-041

## Đã làm
- Hiện thực endpoint `GET /api/v1/finance/commissions` theo chuẩn `docs/07-api-contracts.md` mục `GET /api/v1/finance/commissions` (SCR-12 / M4).
- Tuân thủ thứ tự xử lý bảo mật và hợp đồng dữ liệu:
  1. Xác thực (401 qua `get_current_user`).
  2. Kiểm tra tính hợp lệ của toàn bộ tham số: `from`, `to`, `from <= to`, `case_id`, `user_id`, `role_type`, `payout_status`, `page >= 1`, `limit` trong [1, 100]; trả về 422 `VALIDATION_ERROR` kèm chi tiết `details.fields`.
  3. Phân quyền vai trò: Chặn `ADMIN` và các vai trò không được phép với 403 `FORBIDDEN_ROLE`.
- Áp dụng phân quyền phạm vi dữ liệu theo DEC-04:
  - `ACCOUNTANT` và `MANAGER` có `is_executive`: toàn hãng, cho phép lọc `user_id`.
  - `MANAGER` thường: chỉ thấy các bản ghi của nhân sự thuộc phòng ban mình phụ trách trong `department_leaders`; nếu không phụ trách phòng ban nào thì trả về kết quả rỗng (200).
  - `ATTORNEY`: chỉ thấy bản ghi của chính mình (`ct.user_id = me`), bỏ qua tham số `user_id` nếu người dùng truyền.
- Truy vấn kết hợp `commission_transactions`, `cases`, `users`, `billing_milestones`, `case_tasks`:
  - Phân trang `ORDER BY ct.created_at DESC, ct.id` với `limit` và `offset`.
  - Đếm tổng số bản ghi `total_records`, tính `total_pages = ceil(total_records / limit)`.
  - Tính `summary` (toàn bộ kết quả lọc, không phụ thuộc trang hiện tại): `by_role` đủ 5 vai trò (`ORIGINATOR`, `SUPERVISOR`, `CASE_MANAGER`, `EXECUTOR`, `ASSISTANT`), vai trò không có doanh số = `"0"`; `total_amount` là tổng tiền.
  - Định dạng tiền tệ và tỷ lệ bằng `format_money` (import từ `backend/app/services/payments.py`), không dùng số float, trả chuỗi số nguyên chuẩn.

## File đã tạo/sửa
- [commission_ledger.py](file:///Users/namtran/Local%20Sites/agy-worktrees/TASK-041/backend/app/services/commission_ledger.py): Module dịch vụ xử lý logic truy vấn SQL, phân quyền phạm vi theo vai trò, phân trang và tính toán summary.
- [finance_commissions.py](file:///Users/namtran/Local%20Sites/agy-worktrees/TASK-041/backend/app/api/finance_commissions.py): Router FastAPI tiếp nhận `GET /finance/commissions`, kiểm tra hợp lệ tham số, kiểm tra quyền vai trò và gọi service đồng bộ qua `asyncio.to_thread`.
- [main.py](file:///Users/namtran/Local%20Sites/agy-worktrees/TASK-041/backend/app/main.py): Đăng ký `finance_commissions_router` với tiền tố `/api/v1`.

## Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-041-finance-commissions-ledger/verify.sh
......................................                                   [100%]
38 passed in 487.53s (0:08:07)
TASK-041 -> submitted. Báo trưởng phòng nghiệm thu.
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không.
