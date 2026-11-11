# TASK-025 — Bàn làm việc Kế toán & sổ hoa hồng (SCR-11, SCR-12)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không (giao diện; tiền và quyền do backend tính/kiểm)

## 1. Mục tiêu
Kế toán xử lý hàng chờ đợt thu: đối soát với MISA rồi xác nhận đã thu (kể cả thu một phần — DEC-06), thấy ngay hoa hồng phát sinh. Quản lý/Kế toán/Luật sư tra sổ hoa hồng. Trong vụ việc: tab Tài chính hiện đợt thu và chính sách hoa hồng. Backend làm sau (M4) → test dùng `fetch` giả lập.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` **§3.5** (toàn bộ), §1.1 (`Idempotency-Key`), §1.3
- `docs/12-business-rules.md` §1.5 (đợt thu), §3 (công thức hoa hồng — chỉ để hiểu, không tính ở client)
- `docs/14-decisions.md` DEC-04, DEC-06; `docs/03-screens-and-ui.md` dòng SCR-11, SCR-12
- Giao diện mẫu: `prototype/accounting/index.html`, `accounting/detail.html`, `prototype/finance/index.html`, `finance/detail.html`
- Code có sẵn: `frontend/src/lib/api-client.ts`, `frontend/src/lib/format.ts` (`formatVnd`), `frontend/src/components/ui/`, layout vụ việc `frontend/src/app/(dashboard)/cases/[id]/layout.tsx` (đã có tab Tài chính trỏ tới `/cases/{id}/finance`)

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `frontend/src/app/(dashboard)/accounting/`, `frontend/src/app/(dashboard)/finance/`
- `frontend/src/app/(dashboard)/cases/[id]/finance/`
- `frontend/src/components/accounting/`, `frontend/src/components/finance/`
- `frontend/src/hooks/use-accounting.ts`, `frontend/src/hooks/use-finance.ts`, `frontend/src/types/finance.ts`, `frontend/src/lib/money.ts`

**Người viết test:** `frontend/tests/finance/` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; các file khác của `frontend/src`; `backend/`, `docs/`, `prototype/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- `lib/money.ts` (hàm thuần trên **chuỗi thập phân**, không `Number`/`parseFloat`): `parseMoneyInput("30.000.000") → "30000000"` (bỏ dấu chấm/khoảng trắng, từ chối chữ, tối đa 2 chữ số lẻ), `compareMoney(a, b) → -1|0|1`, `subtractMoney(a, b) → string`. Dùng `BigInt` trên phần nguyên × 100.
- **SCR-11** `accounting/page.tsx` (ACCOUNTANT): hàng chờ từ `GET /accounting/inbox`, lọc trạng thái, tìm theo mã vụ việc/khách hàng; mỗi dòng: vụ việc, đợt, số tiền, đã thu, còn lại, chờ từ ngày nào (cảnh báo khi > 7 ngày).
  - Hộp thoại **Xác nhận đã thu**: số hoá đơn MISA, mã GD ngân hàng (bắt buộc cả hai), số tiền nhận (nhập kiểu `30.000.000`, mặc định = còn lại), ghi chú. Số tiền > còn lại → cảnh báo vàng "Thu thừa X ₫" nhưng vẫn cho gửi; ≤ 0 → chặn. Mỗi lần mở hộp thoại sinh một `Idempotency-Key`; thử lại sau lỗi mạng dùng **cùng** khoá.
  - Kết quả: hiện trạng thái đợt (`PARTIALLY_PAID`/`PAID_CONFIRMED`), số còn lại, bảng hoa hồng phát sinh theo vai trò, `execution_carried_forward` nếu > 0, `warnings` `OVERPAYMENT`; `stage_unblocked = true` → dòng "Đã mở khoá giai đoạn kế tiếp cho luật sư".
  - Lỗi `DUPLICATE_BANK_REF` hiện dưới ô mã GD; `MILESTONE_NOT_AWAITING_PAYMENT` → thông báo và tải lại hàng chờ.
- **SCR-12** `finance/page.tsx`: sổ hoa hồng, lọc theo vụ việc/người/thời gian, bảng + dải tổng `summary` theo vai trò, nút "Xuất Excel" (tải `export` cùng tham số). `ATTORNEY` không thấy bộ lọc người (chỉ của mình).
- **Tab Tài chính** `cases/[id]/finance/page.tsx`: danh sách đợt thu với thanh tiến độ đã thu/số tiền; chính sách hoa hồng (4 tỷ lệ); Quản lý sửa được khi `locked_at = null` — tổng > 100 chặn ở client; `COMMISSION_POLICY_LOCKED` → thông báo "Đã khoá từ lần thu đầu".
- Vai trò khác ACCOUNTANT vào SCR-11 → ErrorState "Không có quyền truy cập". Đủ Empty/Skeleton/Success/Validation error.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test)
- [ ] `verify.sh`: `npm --prefix frontend install`, `lint`, `typecheck`, `test`, `build` exit 0; test cũ vẫn xanh.
- [ ] `money.ts`: `parseMoneyInput` cho `"30.000.000"`, `" 1 500 000 "`, `"1500000.5"` → `"1500000.50"`; từ chối `"abc"`, `"1.2.3,45"`, 3 chữ số lẻ; `compareMoney`/`subtractMoney` đúng với số lớn `"999999999999.99"`; không `Number(`/`parseFloat` trong `money.ts` và các thành phần tiền.
- [ ] Xác nhận thu: thiếu hoá đơn/mã GD → chặn; ≤ 0 → chặn; thu thừa → cảnh báo nhưng gửi được; body đúng §3.5 (tiền là chuỗi); thử lại dùng cùng `Idempotency-Key`; hiển thị đúng bảng hoa hồng, `stage_unblocked`, `OVERPAYMENT`; `DUPLICATE_BANK_REF` hiện dưới ô.
- [ ] Sổ hoa hồng: tham số lọc đúng; ATTORNEY không có bộ lọc người; nút xuất gọi đúng URL kèm tham số.
- [ ] Tab Tài chính: sửa chính sách bị khoá khi `locked_at` có giá trị; tổng > 100 bị chặn; `COMMISSION_POLICY_LOCKED` hiện thông báo.
- [ ] Không `localStorage`; không chuỗi `SCR-`/`TSK-`; không emoji trong nút.

## 6. Ràng buộc & bẫy cần tránh
- Không tự tính hoa hồng ở client — chỉ hiển thị số server trả về.
- Không sửa file ngoài mục 3; cần đổi menu/api-client/layout vụ việc → ghi `report.md` mục câu hỏi.
- Chạy test qua `python3 scripts/handoff.py verify TASK-025` hoặc `npm --prefix frontend run test`. Ghi file bằng công cụ ghi file (tự tạo thư mục cha); `mkdir`, `;`, `||`, `|`, `xargs` bị từ chối.
