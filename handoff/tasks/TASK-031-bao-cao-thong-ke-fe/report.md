# Báo cáo TASK-031 — Báo cáo & thống kê (SCR-18)

## Đã làm
- Hiện thực hoá trang `/reports` đầy đủ 3 tab theo phân quyền: Doanh thu thực thu, Hoa hồng, Vận hành.
- Xây dựng thư viện hàm thuần `lib/reports.ts` xử lý khoảng thời gian (`defaultRange`, `validateRange`), định dạng tiền tệ và tỷ lệ (`formatVnd` an toàn cho số lớn không dùng `Number()`, `formatPct`), tính tỷ lệ độ rộng thanh biểu đồ CSS (`barWidths`), và sinh tên tệp xuất Excel (`exportFilename`).
- Xây dựng các hook React Query trong `hooks/use-reports.ts` (`useRevenueReport`, `useCommissionsReport`, `useOperationsReport`) và hàm `exportReportExcel` tải file blob với tên từ `Content-Disposition`.
- Xây dựng các component giao diện modular trong `components/reports/`:
  - `ScopeBadge`: nhãn phạm vi số liệu (`FIRM` "Toàn hãng", `DEPARTMENT` "Phòng ban", `SELF` "Số liệu của tôi").
  - `ReportFilters`: bộ lọc ngày có kiểm tra hợp lệ, dropdown chọn phòng ban (chỉ hiện khi có > 1 phòng ban) và nút "Xuất Excel" (không emoji).
  - `RevenueTab`: 3 thẻ chỉ số doanh thu và số khoản thu; biểu đồ thanh ngang CSS theo kỳ (tháng/quý); bảng theo phòng ban và theo loại vụ việc.
  - `CommissionsTab`: 3 thẻ chỉ số hoa hồng; bộ lọc trạng thái chi trả (`payout_status`); bảng chi tiết nhân sự theo 5 vai trò.
  - `OperationsTab`: số vụ việc theo 5 trạng thái với nhãn tiếng Việt chuẩn; bảng task quá hạn có liên kết `/cases/{id}`; bảng thời gian xử lý theo stage; tỷ lệ chuyển đổi cơ hội.
- Đầy đủ 4 trạng thái giao diện UI: Loading (Skeleton), Empty ("Chưa có số liệu trong kỳ này"), Error (403 "Không có quyền truy cập", 422 báo lỗi bộ lọc), Success.
- Đảm bảo kiểm soát vai trò: `ADMIN` không gọi API và nhận thông báo lỗi quyền truy cập; `ACCOUNTANT` ẩn tab Vận hành và mở mặc định tab Doanh thu.
- Tuân thủ Luật 12: không sử dụng bất kỳ mã lách test nào trong `src/`, không `localStorage`/`sessionStorage`, không thêm thư viện ngoài quy định, không chứa mã đặc tả `SCR-`/`TSK-`/`DEC-`.

## File đã tạo/sửa
- `frontend/src/types/reports.ts`: Khai báo kiểu dữ liệu cho báo cáo doanh thu, hoa hồng, vận hành, bộ lọc và meta.
- `frontend/src/lib/reports.ts`: Các hàm thuần tính ngày mặc định, kiểm tra hợp lệ khoảng ngày, format VND số lớn, format %, bề rộng bar CSS, tên file Excel.
- `frontend/src/hooks/use-reports.ts`: Hooks TanStack Query gọi API báo cáo và hàm xuất Excel xử lý Blob/Content-Disposition.
- `frontend/src/components/reports/scope-badge.tsx`: Component hiển thị huy hiệu phạm vi dữ liệu theo meta.scope.
- `frontend/src/components/reports/report-filters.tsx`: Component thanh bộ lọc ngày, phòng ban và nút xuất Excel.
- `frontend/src/components/reports/revenue-tab.tsx`: Component nội dung tab Doanh thu thực thu với thẻ chỉ số, biểu đồ thanh CSS và 2 bảng phân tích.
- `frontend/src/components/reports/commissions-tab.tsx`: Component nội dung tab Hoa hồng với thẻ chỉ số, bộ lọc chi trả và bảng phân tích 5 vai trò.
- `frontend/src/components/reports/operations-tab.tsx`: Component nội dung tab Vận hành với 5 trạng thái vụ việc, bảng task quá hạn, thời gian stage và chuyển đổi cơ hội.
- `frontend/src/app/(dashboard)/reports/page.tsx`: Màn hình `/reports` tổng hợp, điều phối tab, phân quyền theo vai trò, quản lý bộ lọc và xử lý 4 trạng thái UI.

## Kết quả tự kiểm
```
=== [1/5] Cài đặt dependencies frontend ===
up to date, audited 495 packages in 3s
170 packages are looking for funding
  run `npm fund` for details

=== [2/5] Lint toàn bộ mã nguồn frontend ===
> frontend@1.0.0 lint
> next lint
✔ No ESLint warnings or errors

=== [3/5] Type-check toàn bộ dự án frontend ===
> frontend@1.0.0 typecheck
> tsc --noEmit -p tsconfig.json

=== [4/5] Chạy toàn bộ test suite frontend (vitest) ===
> frontend@1.0.0 test
> vitest run
 Test Files  69 passed (69)
      Tests  600 passed (600)
   Start at  01:33:26
   Duration  9.06s (transform 2.50s, setup 0ms, collect 11.26s, tests 15.04s, environment 20.61s, prepare 4.74s)

=== [5/5] Build thử nghiệm dự án frontend (Next.js) ===
> frontend@1.0.0 build
> next build
   ▲ Next.js 15.0.4
   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types     ✓ Linting and checking validity of types 
   Collecting page data     ✓ Collecting page data 
 ✓ Generating static pages (20/20)
   Collecting build traces     ✓ Collecting build traces 
   Finalizing page optimization     ✓ Finalizing page optimization 
Route (app)                              Size     First Load JS
├ ○ /reports                             7.51 kB         124 kB

=== TẤT CẢ KIỂM TRA ĐÃ ĐẠT CHO TASK-031 ===

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không. Mọi tiêu chí nghiệm thu đã hoàn thành đầy đủ, tự kiểm verify.sh đạt exit 0 và toàn bộ 69 test files (600 tests) đều xanh.
