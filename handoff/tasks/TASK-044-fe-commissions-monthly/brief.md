# TASK-044 — Giao diện báo cáo hoa hồng theo tháng, bỏ "Tích luỹ / Đã chi" (DEC-09)

> Người giao: Claude (Trưởng phòng) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không

## 1. Mục tiêu
Chủ dự án chốt **DEC-09** (`docs/14-decisions.md`): hệ thống không chi trả hoa hồng, chỉ chia và **thống kê theo tháng**. Backend đã đổi `GET /reports/commissions` sang dạng theo tháng (`docs/07-api-contracts.md` §3.9 mục commissions). Sửa giao diện cho khớp:
1. Tab Hoa hồng ở trang Báo cáo (`components/reports/commissions-tab.tsx`, `app/(dashboard)/reports/page.tsx`): bỏ bộ lọc và thẻ/cột "Tích luỹ", "Đã chi"; hiển thị thẻ Tổng hoa hồng + Số bút toán, **bảng nhân sự × tháng** (cột theo `periods`, nhãn `MM/YYYY`, cột Tổng, dòng Tổng cộng) và bảng theo vai trò (5 vai trò).
2. Bỏ `payout_status` khỏi kiểu và hook (`types/reports.ts`, `types/finance.ts` — trường `disbursed_at`/`payout_status` của sổ hoa hồng, `hooks/use-reports.ts`); trang Sổ hoa hồng không hiển thị trạng thái chi trả.

## 2. Tài liệu bắt buộc đọc
- `docs/14-decisions.md` DEC-09; `docs/07-api-contracts.md` §3.9 (mục commissions — ví dụ JSON), mục `GET /api/v1/finance/commissions`
- `frontend/src/components/reports/*`, `frontend/src/app/(dashboard)/reports/page.tsx`, `frontend/src/app/(dashboard)/finance/`, `frontend/src/lib/format.ts` (`formatVnd`)

## 3. Phạm vi file
**Được tạo/sửa:**
- `frontend/src/components/reports/commissions-tab.tsx`
- `frontend/src/app/(dashboard)/reports/page.tsx`
- `frontend/src/hooks/use-reports.ts`
- `frontend/src/types/reports.ts`
- `frontend/src/types/finance.ts`
- `frontend/src/app/(dashboard)/finance/` (chỉ phần hiển thị trạng thái chi trả nếu có)
- `frontend/tests/` — chỉ người viết test

**Không được sửa:** `backend/`, `docs/`, `frontend/src/app/(dashboard)/layout.tsx`, `frontend/src/lib/menu.ts`, `frontend/src/hooks/use-menu-counts.ts` (task khác đang sửa), file trong `tests.lock`.

## 4. Đặc tả hiển thị
- Bảng "Hoa hồng theo tháng": hàng = `by_user` (giữ thứ tự API), cột = Nhân sự, Phòng ban, từng tháng trong `periods` (`2026-10` → `10/2026`), Tổng; dòng cuối "Tổng cộng" lấy từ `by_period` và `summary.total_amount` (không tự cộng số thực).
- Bảng "Theo vai trò": Nhân sự, Mang khách về, Giám sát, Quản lý vụ việc, Thực hiện, Hỗ trợ (từ `by_role`).
- Tiền định dạng bằng `formatVnd`. Bảng rộng cuộn ngang trong khung, không vỡ bố cục ở 375px.
- Đủ 4 trạng thái: Skeleton, Empty (`by_user` rỗng), Error (có Thử lại), Success.

## 5. Tiêu chí nghiệm thu (đo được)
1. `grep -rniE "disburs|payout|Đã chi|Tích lu[ỹy]" frontend/src` không còn kết quả.
2. Với mock đúng ví dụ JSON ở docs/07: hiển thị đúng tiêu đề cột `10/2026`, `11/2026`; dòng của từng nhân sự đúng số tiền từng tháng; dòng Tổng cộng đúng `by_period`; thẻ Tổng hoa hồng = `summary.total_amount`, Số bút toán = `summary.transaction_count`.
3. Hook báo cáo hoa hồng không gửi `payout_status`.
4. `by_user` rỗng → EmptyState; lỗi API → ErrorState có nút Thử lại.
5. `cd frontend && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx next lint` xanh.

## 6. Bẫy cần tránh
- Không tự cộng/làm tròn tiền ở frontend — lấy tổng từ API.
- Mock test phải đúng dạng backend thật (docs/07); không thêm code sản phẩm để chiều test.
- Không `python3 -c` nhiều dòng, không `rm`, không `git`, không ghép lệnh bằng `&&`; tự kiểm bằng `python3 scripts/handoff.py verify TASK-044`.
