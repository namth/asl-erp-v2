# TASK-041 — Backend sổ hoa hồng `GET /finance/commissions` (SCR-12)

> Người giao: Claude (Trưởng phòng) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (tiền — tổng khớp từng đồng; phạm vi dữ liệu theo vai trò)

## 1. Mục tiêu
Trang Sổ hoa hồng (`frontend/src/app/(dashboard)/finance/commissions/page.tsx`, hook `useCommissions` trong `frontend/src/hooks/use-finance.ts`) đang gọi `GET /api/v1/finance/commissions` nhưng backend chưa có. Viết endpoint này đúng `docs/07-api-contracts.md` mục `GET /api/v1/finance/commissions` (cạnh `confirm-payment`). **Chỉ GET**; export và disburse làm sau.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md`: mục `GET /api/v1/finance/commissions`, §1.2 (phong bì/meta), bảng phạm vi DEC-04 ở §3.9 (cột `commissions`)
- Mẫu code cùng kiểu: `backend/app/services/reports.py` (`resolve_scope`, `validate_and_parse_period`, `get_commissions_data` — lọc ngày giờ VN, phạm vi Trưởng phòng theo `department_leaders`), `backend/app/api/reports.py`, `backend/app/api/accounting.py` (psycopg đồng bộ qua `asyncio.to_thread`)
- `.agents/rules/vai-tro-ky-su-thuc-thi.md`

## 3. Phạm vi file
**Được tạo/sửa:**
- `backend/app/api/finance_commissions.py` (router `prefix="/finance/commissions"`)
- `backend/app/services/commission_ledger.py`
- `backend/app/main.py` — chỉ thêm import + `include_router(..., prefix="/api/v1")`

**Test (đã viết, đã khoá):** `backend/tests/test_finance_commissions_api.py`, `verify.sh`.
**Không được sửa:** file trong `tests.lock`; `backend/app/services/reports.py` (chỉ được import hàm dùng lại); `docs/`; `frontend/`; migration.

## 4. Blueprint
- Thứ tự: xác thực (401) → tham số (422 `VALIDATION_ERROR`, có `details.fields`) → vai trò (`ADMIN` → 403 `FORBIDDEN_ROLE`).
- Phạm vi (điều kiện SQL thêm vào `WHERE`):
  - `ACCOUNTANT` hoặc `MANAGER` có `is_executive` → không giới hạn.
  - `MANAGER` thường → `u.department_id IN (SELECT department_id FROM department_leaders WHERE user_id = me)`; không có phòng → kết quả rỗng (vẫn 200).
  - `ATTORNEY` → `ct.user_id = me`, **bỏ qua** tham số `user_id`.
- Truy vấn: `commission_transactions ct JOIN cases c JOIN users u LEFT JOIN billing_milestones m LEFT JOIN case_tasks t`. Lọc ngày: `(ct.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN from AND to` (mỗi đầu chỉ áp khi có).
- Ba truy vấn cùng điều kiện: (1) trang `ORDER BY ct.created_at DESC, ct.id LIMIT/OFFSET`; (2) `count(*)`; (3) `SUM(amount)` theo `role_type` → `summary.by_role` đủ 5 khoá (thiếu = `"0"`), `total_amount` = tổng. Tính bằng `Decimal`, trả chuỗi (cùng cách định dạng tiền như `reports.py`).
- `total_pages = ceil(total_records / limit)`; phản hồi `{"success": true, "data": [...], "meta": {page, limit, total_records, total_pages, summary}}`.

## 5. Tiêu chí nghiệm thu (đo được)
- `bash handoff/tasks/TASK-041-finance-commissions-ledger/verify.sh` xanh (test mới + test báo cáo + test không cài hook test vào app).
- `summary` giống hệt nhau ở mọi trang của cùng bộ lọc.

## 6. Bẫy cần tránh
- Không float cho tiền; không cộng trong Python từ trang hiện tại (summary phải trên toàn bộ kết quả lọc).
- Không UPDATE bảng `commission_transactions` (có trigger chặn) hay `audit_logs`.
- Không ghép giá trị tham số vào chuỗi SQL — dùng tham số psycopg.
- Không sửa test; không `python3 -c` nhiều dòng; không `rm`/`&&` (bị chặn ở chế độ ngầm) — script tạm để ở `/tmp`.
