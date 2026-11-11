# Báo cáo TASK-025: Bàn làm việc Kế toán & sổ hoa hồng (SCR-11, SCR-12)

## Đã làm
- Hiện thực hoá thư viện xử lý tiền tệ chuỗi thập phân `frontend/src/lib/money.ts`: các hàm thuần `parseMoneyInput`, `compareMoney`, `subtractMoney` sử dụng `BigInt` trên chuỗi, hoàn toàn không dùng `Number()` hoặc `parseFloat()`.
- Định nghĩa đầy đủ kiểu dữ liệu hợp đồng tài chính và kế toán tại `frontend/src/types/finance.ts` (`MilestoneStatus`, `AccountingInboxItem`, `ConfirmPaymentPayload`, `CommissionTransaction`, `CommissionPolicy`, ...).
- Hiện thực hoá các custom React hooks với TanStack Query:
  - `frontend/src/hooks/use-accounting.ts`: `useAccountingInbox` (lọc status, q, page, limit), `useConfirmPayment` (gửi header `Idempotency-Key` và payload tiền tệ dạng chuỗi).
  - `frontend/src/hooks/use-finance.ts`: `useCommissions` (lọc case_id, user_id, from, to), `useCaseMilestones`, `useCaseCommissionPolicy`, `useUpdateCommissionPolicy`.
- Hiện thực hoá màn hình Bàn làm việc Kế toán (SCR-11) tại `frontend/src/app/(dashboard)/accounting/page.tsx`:
  - Phân quyền: vai trò khác `ACCOUNTANT` bị chặn với `ErrorState` "Không có quyền truy cập".
  - Đáp ứng chuẩn 4 trạng thái giao diện (Loading, Empty, Error, Success).
  - Bảng hàng chờ đợt thu đối soát MISA với cảnh báo màu hổ phách khi chờ quá 7 ngày.
  - Hộp thoại `ConfirmPaymentModal` (`frontend/src/components/accounting/confirm-payment-modal.tsx`): bắt buộc hoá đơn MISA & mã GD ngân hàng; chặn tiền <= 0; cảnh báo vàng "Thu thừa X ₫" khi vượt số còn lại nhưng vẫn cho gửi; sinh và giữ nguyên `Idempotency-Key` qua các lần thử lại sau lỗi mạng; hiển thị bảng hoa hồng theo vai trò, mở khoá giai đoạn kế tiếp và dồn hoa hồng sang đợt kế tiếp; hiển thị lỗi `DUPLICATE_BANK_REF` dưới ô mã GD; xử lý `MILESTONE_NOT_AWAITING_PAYMENT` tự động tải lại hàng chờ.
- Hiện thực hoá màn hình Sổ hoa hồng thực thu (SCR-12) tại `frontend/src/app/(dashboard)/finance/page.tsx`:
  - Dải tổng summary phân theo vai trò (`total_amount`, `ORIGINATOR`, `SUPERVISOR`, `CASE_MANAGER`, `EXECUTOR`).
  - Bộ lọc người ẩn với `ATTORNEY` (chỉ xem hoa hồng của mình), hiện với `ACCOUNTANT`/`MANAGER`.
  - Nút "Xuất Excel" không chứa emoji, tải đúng endpoint export kèm tham số lọc.
- Hiện thực hoá tab Tài chính trong hồ sơ vụ việc tại `frontend/src/app/(dashboard)/cases/[id]/finance/page.tsx`:
  - Danh sách đợt thu kèm thanh tiến độ tỷ lệ đã thu / số tiền theo từng mốc.
  - Khối chính sách hoa hồng hiển thị 4 tỷ lệ; Quản lý sửa được khi chưa khoá; chặn ở client khi tổng 4 tỷ lệ vượt 100%; hiển thị trạng thái "Đã khoá" khi `locked_at` có giá trị; xử lý lỗi `COMMISSION_POLICY_LOCKED` hiển thị "Đã khoá từ lần thu đầu".
- Tuân thủ toàn bộ quy chuẩn kỹ thuật: kebab-case, không dùng `localStorage`, không có chuỗi mã đặc tả hiển thị, không emoji trong button, không tính hoa hồng ở client.

## File đã tạo/sửa
- `frontend/src/lib/money.ts`: Thư viện xử lý tiền tệ chuỗi thập phân thuần bằng `BigInt`.
- `frontend/src/types/finance.ts`: Khai báo kiểu TypeScript cho API kế toán & hoa hồng.
- `frontend/src/hooks/use-accounting.ts`: React hooks `useAccountingInbox` và `useConfirmPayment`.
- `frontend/src/hooks/use-finance.ts`: React hooks `useCommissions`, `useCaseMilestones`, `useCaseCommissionPolicy`, `useUpdateCommissionPolicy`.
- `frontend/src/components/accounting/confirm-payment-modal.tsx`: Modal xác nhận đã thu tiền với hợp đồng Idempotency.
- `frontend/src/app/(dashboard)/accounting/page.tsx`: Màn hình Bàn làm việc Kế toán & đối soát hàng chờ (SCR-11).
- `frontend/src/app/(dashboard)/finance/page.tsx`: Màn hình Sổ hoa hồng thực thu (SCR-12).
- `frontend/src/app/(dashboard)/cases/[id]/finance/page.tsx`: Màn hình tab Tài chính vụ việc.

## Kết quả tự kiểm
```text
=== [1/5] Cài đặt dependencies frontend ===
up to date, audited 495 packages in 3s

=== [2/5] Type-check toàn bộ dự án frontend ===
> frontend@1.0.0 typecheck
> tsc --noEmit -p tsconfig.json

=== [3/5] Lint toàn bộ mã nguồn frontend ===
> frontend@1.0.0 lint
> next lint
✔ No ESLint warnings or errors

=== [4/5] Chạy toàn bộ test suite frontend (vitest) ===
> frontend@1.0.0 test
> vitest run
 Test Files  44 passed (44)
      Tests  347 passed (347)
   Start at  17:30:45
   Duration  5.96s (transform 1.65s, setup 0ms, collect 7.59s, tests 9.89s, environment 13.07s, prepare 3.07s)

=== [5/5] Build thử nghiệm dự án frontend (Next.js) ===
> frontend@1.0.0 build
> next build
   ▲ Next.js 15.0.4
   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types     ✓ Linting and checking validity of types 
   Collecting page data     ✓ Collecting page data 
 ✓ Generating static pages (16/16)
   Collecting build traces     ✓ Collecting build traces 
   Finalizing page optimization     ✓ Finalizing page optimization 

=== TẤT CẢ KIỂM TRA ĐÃ ĐẠT CHO TASK-025 ===
KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
- Tại `frontend/src/app/(dashboard)/cases/[id]/layout.tsx` hiện tại đường dẫn tab Tài chính đang trỏ tới `/cases/{id}/billing` (placeholder). Vì `layout.tsx` nằm ngoài phạm vi file được sửa của TASK-025 theo brief mục 3, agent giữ nguyên `layout.tsx` và tạo đúng trang tại `frontend/src/app/(dashboard)/cases/[id]/finance/page.tsx` theo brief. Trưởng phòng có thể cập nhật đường dẫn tab trong `layout.tsx` sang `/cases/{id}/finance` khi hợp nhất.
