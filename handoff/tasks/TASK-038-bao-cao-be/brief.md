# TASK-038 — Backend báo cáo & thống kê SCR-18: revenue, commissions, operations, export (TSK-15)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** cao (số tiền khớp từng đồng, phạm vi dữ liệu theo vai trò DEC-04)
> **Phụ thuộc:** đã có `backend/app/services/report_export.py` (TASK-037: dựng tệp Excel) và FE `frontend/src/app/(dashboard)/reports/`, `hooks/use-reports.ts` (đọc để khớp tham số).

## 1. Mục tiêu
Viết 4 endpoint `GET /api/v1/reports/{revenue|commissions|operations}` và `GET /api/v1/reports/{name}/export` đúng hợp đồng `docs/07` §3.9, kể cả mục **"Quy ước chi tiết"** (chốt cho task này).

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` **§3.9** (toàn bộ, đặc biệt "Quy ước chi tiết") và §1 (định dạng phản hồi, mã lỗi)
- `docs/14-decisions.md` DEC-04 (phạm vi xem)
- `backend/app/services/report_export.py` — `build_report_xlsx`, `export_filename`, `content_disposition`
- `backend/app/services/audit.py` — `log_audit_event`
- `backend/app/api/accounting.py`, `backend/app/services/payments.py` — mẫu dùng `psycopg` đồng bộ qua `asyncio.to_thread`
- `.agents/rules/vai-tro-ky-su-thuc-thi.md` (luật 12, 13)

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `backend/app/api/reports.py` (router `prefix="/reports"`)
- `backend/app/services/reports.py` (truy vấn + tổng hợp)
- `backend/app/main.py` — chỉ thêm import và `include_router` cho router báo cáo

**Người viết test:** `backend/tests/test_reports_api.py` và `verify.sh` của task (đã viết, đã khoá).

**Không được sửa:** mọi file trong `tests.lock`; `backend/app/services/report_export.py`; mọi file khác trong `backend/`, `frontend/`, `docs/`.

## 4. Đặc tả (tóm tắt — nguồn sự thật là docs/07 §3.9)
- **Thứ tự kiểm tra:** xác thực (401) → `name` hợp lệ (404 `NOT_FOUND` cho export) → tham số (422 `VALIDATION_ERROR`) → vai trò (403 `FORBIDDEN_ROLE`) → phạm vi phòng (403 `NEED_TO_KNOW_DENIED`). Tham số có thể kiểm tra trước hoặc sau vai trò, nhưng **không** được trả 200 hay ghi audit khi bị từ chối.
- **Phạm vi:**
  - ADMIN → 403 mọi báo cáo.
  - Kế toán → `operations` 403.
  - Giám đốc (`is_executive`) và Kế toán → toàn hãng, lọc được mọi phòng.
  - Trưởng phòng → các phòng trong `department_leaders`; lọc phòng khác → 403 `NEED_TO_KNOW_DENIED`.
  - Luật sư → `SELF`, `department_id` bị bỏ qua.
- **Ngày giờ VN:** điều kiện "trong kỳ" phải so ngày theo `Asia/Ho_Chi_Minh`, ví dụ `(confirmed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN :from AND :to`. Test có khoản thu 00:15 ngày 01/01 giờ VN (UTC còn năm trước) phải được tính, và 00:30 ngày 01/04 giờ VN phải bị loại.
- **Tiền:** chuỗi số nguyên (`"65000000"`, không có `".00"`). Tỷ lệ là chuỗi 2 chữ số thập phân; `avg_days` 1 chữ số; làm tròn `Decimal` `ROUND_HALF_UP`. Ví dụ 5,25 → `"5.3"`, `round()` của float cho `5.2` là sai. **Không dùng float** ở bất kỳ phép tính tiền/tỷ lệ nào.
- **Export:**
  - Gọi `build_report_xlsx(name, data, meta)`, trong đó `meta.departments` = các phòng **thực sự áp dụng**: phòng đã lọc, hoặc các phòng Trưởng phòng quản lý; `FIRM`/`SELF` dùng `[]`.
  - Header `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: content_disposition(export_filename(name, from, to))`, trong đó `from`/`to` là giá trị đã áp mặc định.
  - Ghi audit `REPORT_EXPORTED` (`entity_name='reports'`, `entity_id=name`, `after_state={name, from, to, department_id, scope}`); `department_id` là chuỗi UUID hoặc `null`.
- **Route:** khai báo `/{name}/export` sao cho không bị `/{name}` nuốt mất.

## 5. Tiêu chí nghiệm thu (đã thành test trong `backend/tests/test_reports_api.py`, 24 test)
- **Doanh thu:**
  - Lọc phòng đúng từng đồng; kỳ theo tháng/quý đủ cả kỳ có thu bằng 0.
  - Toàn hãng sắp giảm dần.
  - Trưởng phòng chỉ thấy phòng mình; Luật sư chỉ thấy vụ việc được giao.
  - Quản lý chưa phụ trách phòng nào nhận dữ liệu rỗng.
- **Hoa hồng:** tổng theo nhân sự đủ 5 vai trò, tách tích luỹ/đã chi, lọc `payout_status`, phạm vi theo vai trò.
- **Vận hành:** 5 trạng thái, task quá hạn (giờ VN, sắp theo số ngày quá hạn), thời gian giai đoạn, chuyển đổi cơ hội; Luật sư chỉ thấy vụ việc của mình.
- **Phân quyền & tham số:** 401/403/422 như hợp đồng; khoảng đúng 366 ngày hợp lệ; mặc định từ đầu quý đến hôm nay.
- **Xuất Excel:** đúng tên tệp và nhãn phạm vi theo người xem; ghi audit; tên sai → 404; bị từ chối thì không ghi audit.

## 6. Ràng buộc & bẫy cần tránh
- DB dùng chung tích luỹ dữ liệu test cũ: đừng giả định bảng rỗng; mọi truy vấn phải lọc đúng phạm vi và kỳ.
- SQL tham số hoá; không nối chuỗi giá trị người dùng vào câu SQL.
- `audit_logs` chỉ INSERT qua `log_audit_event`.
- Test đỏ mà bạn cho là lỗi test → ghi `report.md` mục câu hỏi rồi dừng, không lách (luật 12).
- Không ghép lệnh shell bằng `&&`/`;`, không chạy `pwd`/`cd`. Chỉ dùng công cụ đọc/sửa file và `python3 scripts/handoff.py verify TASK-038` / `submit TASK-038`.
