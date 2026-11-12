# TASK-035 — Backend xác nhận thu tiền MISA, hòm thư Kế toán & chính sách hoa hồng (TSK-09, TSK-10 tích hợp)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (tiền, chống ghi trùng, transaction)
> **Phụ thuộc:** TASK-034 (`backend/app/services/commission_engine.py`, đã merge vào base) — **dùng lại, không viết lại công thức**.

## 1. Mục tiêu
Kế toán xác nhận từng khoản tiền về cho một đợt thu (thu một phần, thu đủ, thu thừa), hệ thống tính hoa hồng ngay trong cùng transaction, mở khoá stage khi đủ tiền; hòm thư Kế toán; xem đợt thu và chính sách hoa hồng của vụ việc.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` **§3.5** (4 endpoint, đã bổ sung thứ tự xử lý & lỗi), §1.2 (`meta`), §1.3 (mã lỗi)
- `docs/12-business-rules.md` §1.5 (máy trạng thái đợt thu), §2.3 (khoá chờ thu), §3 (hoa hồng); `docs/14` DEC-06
- `docs/06-database-schema.md`: `billing_milestones`, `misa_transactions`, `commission_policies`, `commission_transactions`, `commission_carry_forwards`, `case_assignments`, `opportunities`
- Code có sẵn: `backend/app/services/commission_engine.py`, `backend/app/guards/need_to_know.py` + `access_policy.py` (phạm vi `finance`), `backend/app/services/audit.py` (`log_audit_event`), `backend/app/services/case_tasks.py` (cách mở stage), mẫu router `backend/app/api/cases.py`, `backend/app/core/security.py` (`get_current_user`, `verify_csrf`), `backend/app/core/errors.py` (`AppException`)
- `.agents/rules/vai-tro-ky-su-thuc-thi.md` (luật 12, 13)

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `backend/app/api/accounting.py`
- `backend/app/api/case_finance.py`
- `backend/app/services/payments.py`
- `backend/app/services/commission_policies.py`
- `backend/app/schemas/accounting.py`
- `backend/app/main.py` (chỉ thêm import + `include_router`)

**Người viết test:** `backend/tests/test_misa_flow.py` và `verify.sh` của task (đã viết, đã khoá).

**Không được sửa:** mọi file trong `tests.lock`; `backend/tests/`; `backend/app/services/commission_engine.py`, `backend/app/guards/`, `backend/app/core/`, `backend/alembic/`; `frontend/`, `docs/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
**Router:** `accounting.py` — `prefix="/accounting"` (`POST /confirm-payment`, `GET /inbox`); `case_finance.py` — `prefix="/cases"` (`GET /{case_id}/milestones`, `GET|PUT /{case_id}/commission-policy`). Route ghi có `dependencies=[Depends(verify_csrf)]`.

**Phân quyền:**
- `confirm-payment`, `inbox`: `system_role == "ACCOUNTANT"`, ngược lại `403 FORBIDDEN_ROLE` (kiểm vai trò trước mọi thứ khác). Chưa đăng nhập → 401.
- `milestones`, `GET commission-policy`: `verify_need_to_know(user_id, case_id, "finance")` (Kế toán, Giám đốc, Trưởng phòng ban, Case Manager).
- `PUT commission-policy`: `system_role == "MANAGER"` (khác → `403 FORBIDDEN_ROLE`) **và** phạm vi `finance`.

**`POST /accounting/confirm-payment`** — header `Idempotency-Key` (UUID, thiếu/sai → 422 `VALIDATION_ERROR`). Body: `milestone_id` (UUID), `misa_invoice_no`, `bank_ref_code` (chuỗi, bỏ khoảng trắng hai đầu, rỗng → 422), `received_amount` (chuỗi số thập phân > 0, ≤ 2 chữ số lẻ — dùng `Decimal`, sai → 422), `notes?`. Đợt không tồn tại → 404 `NOT_FOUND`.

Trong **một transaction** (SQLAlchemy async `engine.begin()` hoặc tương đương):
1. `SELECT … FROM billing_milestones WHERE id = :mid FOR UPDATE`.
2. Đã có `misa_transactions.idempotency_key = key`: nếu `milestone_id`, `misa_invoice_no`, `bank_ref_code`, `received_amount` trùng khớp → **dựng lại response từ DB** (trạng thái đợt hiện tại, hoa hồng của giao dịch đó, `execution_carried_forward` của giao dịch đó, `warnings`) và trả 200; khác → 409 `IDEMPOTENCY_KEY_REUSED`. Hai request đồng thời cùng key phải ra **đúng 1** giao dịch và hai response giống hệt nhau (khoá ở bước 1 tuần tự hoá; nếu vẫn dính `UniqueViolation` trên `idempotency_key` thì rollback rồi đi đường trả lại).
3. Trạng thái đợt ∉ {`AWAITING_PAYMENT`, `PARTIALLY_PAID`} → 409 `MILESTONE_NOT_AWAITING_PAYMENT`.
4. `bank_ref_code` đã tồn tại → 409 `DUPLICATE_BANK_REF` (kiểm trước khi INSERT; vẫn bắt `UniqueViolation` phòng đua).
5. Người nhận: người mang khách về = `opportunities.originator_id` qua `cases.opportunity_id` (không có → `None`); Supervisor / Case Manager = `case_assignments` đang hiệu lực (`unassigned_at IS NULL`) vai trò tương ứng, nhiều người thì lấy `assigned_at` sớm nhất. Không có Case Manager → 409 `CASE_MANAGER_REQUIRED` (và **không ghi gì**).
6. INSERT `misa_transactions` (`accountant_id` = người gọi, `idempotency_key`, …).
7. `commission_policies` của vụ việc: đặt `locked_at = now()` nếu đang null. Vụ việc không có chính sách → 422 `VALIDATION_ERROR` ("Vụ việc chưa có chính sách hoa hồng"), không ghi gì.
8. Task đủ điều kiện = `case_tasks` của vụ việc `status = 'COMPLETED'` và **chưa có** dòng `commission_transactions` `role_type='EXECUTOR'` với `task_id` đó → `EligibleTask(str(id), str(assigned_to), complexity_weight, completed_at)`; task không có người được giao thì bỏ qua.
9. Quỹ dồn `D` = tổng `commission_carry_forwards.amount` của vụ việc có `consumed_by_misa_transaction_id IS NULL`.
10. `compute_commission(received_amount, policy, …, carry_in=D)` → INSERT mỗi dòng vào `commission_transactions` (`misa_transaction_id`, `milestone_id`, `case_id`, `user_id`, `role_type`, `task_id`, `base_amount`, `rate_pct`, `amount`, `source='SYSTEM'`). Có task đủ điều kiện và `D > 0` → UPDATE các dòng dồn đó `consumed_by_misa_transaction_id = <giao dịch này>`. `result.carried_forward > 0` → INSERT 1 dòng `commission_carry_forwards(case_id, from_misa_transaction_id, amount)`.
11. `received_total += received_amount`; `status = PAID_CONFIRMED` nếu `received_total >= amount`, ngược lại `PARTIALLY_PAID`; `updated_at = now()`.
12. Khi chuyển `PAID_CONFIRMED`: mọi `case_stages` có `blocking_milestone_id = đợt này` và `status = 'WAITING_PAYMENT'` → `ACTIVE`, `started_at = now()`; `stage_unblocked = true` nếu có ít nhất 1 stage được mở. INSERT `outbox_events('MILESTONE_PAID', {milestone_id, case_id})`.
13. `log_audit_event` action `PAYMENT_CONFIRMED`, `entity_name='billing_milestones'`, `entity_id=<milestone_id>`, `after_state` gồm `received_amount`, `received_total`, `status`, `misa_transaction_id`.

Response 200: `{"success": true, "data": {milestone_status, received_total, remaining = max(amount − received_total, 0), stage_unblocked, commissions: [{user_id, role_type, amount, task_id?}], execution_carried_forward}, "warnings": [...]}` — tiền là **chuỗi**. Thu thừa: `warnings = [{"code": "OVERPAYMENT", "amount": "<received_total − amount>", "message": "…"}]`, không thừa → `[]`. Khi trả lại theo Idempotency-Key, `stage_unblocked` lấy đúng giá trị của lần đầu (lưu trong `after_state` audit hoặc tính lại từ việc giao dịch này có làm đợt chuyển `PAID_CONFIRMED` hay không).

**`GET /accounting/inbox`** — `status` (danh sách phân tách dấu phẩy, mỗi giá trị ∈ 5 trạng thái đợt, mặc định `AWAITING_PAYMENT,PARTIALLY_PAID`; giá trị lạ → 422), `q` (tìm `case_code`, tên vụ việc, tên khách hàng — `ILIKE`, tham số hoá), `page` ≥ 1, `limit` 1–100 (mặc định 20). Sắp xếp `requested_at ASC NULLS LAST`, rồi `id`. Phần tử: `{milestone_id, case {id, case_code, title, client_name}, name, amount, received_total, remaining, status, awaiting_since (= requested_at, ISO), payments: [{received_amount, misa_invoice_no, bank_ref_code, confirmed_at, confirmed_by {full_name}}]}` (payments theo `confirmed_at ASC`) + `meta {page, limit, total_records, total_pages}`.

**`GET /cases/{id}/milestones`** — sắp theo `order_index`: `[{id, order_index, name, amount, received_total, status, triggered_by_task}]`, `triggered_by_task = {"title": …}` của task có `triggers_milestone_id` = đợt (lấy 1, task tạo sớm nhất), không có → `null`.

**`GET|PUT /cases/{id}/commission-policy`** — `{originator_rate, management_rate, supervisor_share_pct, execution_rate, locked_at}` (tỷ lệ là chuỗi). `PUT` body 4 tỷ lệ (chuỗi số 0–100, ≤ 2 chữ số lẻ, sai → 422); đã khoá → 409 `COMMISSION_POLICY_LOCKED`; `R_o + R_m + R_e > 100` → 422 `COMMISSION_RATES_EXCEED_100` (dùng `validate_policy` của engine); thành công → UPDATE, ghi audit `COMMISSION_POLICY_UPDATED`, trả policy mới.

## 5. Tiêu chí nghiệm thu (đã thành test trong `backend/tests/test_misa_flow.py`)
TC-MISA-03 (30tr + 30tr: lần 1 `PARTIALLY_PAID` + 4 dòng hoa hồng theo ví dụ docs/07, stage vẫn khoá, chính sách khoá; lần 2 `PAID_CONFIRMED`, mở stage, task cũ không nhận thêm → dồn 2,4tr), TC-MISA-02 + thu thừa `OVERPAYMENT`, TC-FIN-01 qua API, không Supervisor / không người mang khách, TC-FIN-04 (dồn rồi dùng hết, đánh dấu `consumed_by`), TC-MISA-04, TC-MISA-05 (đồng thời + gửi lại + khác nội dung), validate đầu vào, đợt sai trạng thái, phân quyền, rollback khi thiếu Case Manager, TC-FIN-08 (GET/PUT/khoá/101%), đợt thu của vụ việc, hòm thư Kế toán.

## 6. Ràng buộc & bẫy cần tránh
- Tiền luôn `Decimal`, không số thực; không tự viết lại công thức chia — gọi `commission_engine`.
- `misa_transactions`, `commission_transactions`, `audit_logs` **chỉ INSERT** (có trigger chặn UPDATE/DELETE) — không bao giờ sửa/xoá, không tắt trigger, không DDL (luật 13).
- DB test dùng chung: không giả định bảng rỗng; dữ liệu tài chính của test không xoá được — đó là bình thường.
- Pooler giới hạn kết nối: không mở kết nối mới trong vòng lặp; dùng 1 transaction cho cả luồng.
- Test đỏ mà bạn cho là lỗi test → ghi `report.md` mục câu hỏi rồi dừng, không lách (luật 12).
- Không ghép nhiều lệnh shell bằng `&&`/`;`; chạy verify bằng `python3 scripts/handoff.py verify TASK-035`.
