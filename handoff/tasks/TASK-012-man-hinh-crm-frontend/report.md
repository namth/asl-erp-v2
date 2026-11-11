# Báo cáo TASK-012

## Đã làm
- [x] Đảm bảo quy trình kiểm thử `verify.sh` hoàn thành thành công 5/5 bước: install, typecheck, lint, vitest 79/79 passed (11/11 test files gồm 7 tests cũ và 4 test suites CRM mới), và build Next.js thành công.
- [x] Cung cấp hàm định dạng tiền tệ `formatVnd`, hàm so sánh `compareCurrencyStrings`, hàm tính tổng `sumCurrencyStrings` trong `frontend/src/lib/format.ts`: hỗ trợ chuỗi số lớn ("123456789012"), chuỗi "0", số thập phân lẻ ("1500.50"), hoàn toàn không dùng `parseFloat` hay `Number(` cho tiền tệ.
- [x] Triển khai màn hình SCR-03 `crm/clients/page.tsx`:
  - Bảng danh sách khách hàng, tìm kiếm tên/MST với debounce 300ms, bộ lọc theo nhóm đối tượng, phân trang theo `meta` từ API.
  - Form tạo khách hàng mới: validate MST doanh nghiệp (10 hoặc 13 số), khách hàng cá nhân nhập CMND/CCCD thay cho MST.
  - Hiển thị lỗi xác thực 409 `DUPLICATE_TAX_CODE` và `DUPLICATE_IDENTITY_NO` trực tiếp dưới ô nhập liệu tương ứng.
  - Xử lý phản hồi 201 có `warnings` `CONFLICT_OF_INTEREST` hiển thị cảnh báo vàng liệt kê các `case_codes` mà không chặn người dùng.
  - Ẩn nút tạo mới và các thao tác chỉnh sửa đối với người dùng có vai trò `ACCOUNTANT`.
- [x] Triển khai màn hình SCR-04 `crm/clients/[id]/page.tsx`:
  - Hiển thị thông tin chi tiết khách hàng và liên hệ, giữ nguyên định dạng số giấy tờ che PII (`identity_no`) như API trả về.
  - Hiển thị danh sách vụ việc liên quan từ API, trạng thái EmptyState khi chưa có vụ việc.
- [x] Triển khai màn hình SCR-05 `crm/opportunities/page.tsx`:
  - Bảng Kanban 5 cột theo các giai đoạn cơ hội (`stage`).
  - Kiểm soát chuyển trạng thái tuân thủ đúng máy trạng thái (chặn chuyển trái luật tại client).
  - Modal chuyển sang `LOST` bắt buộc nhập lý do thất bại (`lost_reason`).
  - Nút "Chuyển thành vụ việc" chỉ kích hoạt khi cơ hội ở trạng thái `WON`.
  - Hộp thoại chuyển đổi kiểm tra tổng giá trị các đợt thanh toán `milestones.amount` ≤ `contract_value` trước khi gửi.
  - Xử lý tự động sinh UUID `Idempotency-Key` trong header và giữ nguyên `Idempotency-Key` khi thử lại (retry) sau lỗi mạng.
  - Xử lý hiển thị thông báo lỗi tiếng Việt thân thiện: `MILESTONES_EXCEED_CONTRACT`, `OPPORTUNITY_ALREADY_CONVERTED`, `NO_PUBLISHED_TEMPLATE`.
  - Chuyển đổi thành công hiển thị mã vụ việc `case_code` và điều hướng tới `/cases/{case_id}`.
- [x] Cả 3 màn hình SCR-03, SCR-04, SCR-05 đều hỗ trợ đầy đủ 4 trạng thái giao diện: Loading (Skeleton), Empty, ErrorState, Success bằng các component chuẩn trong `components/ui/`.
- [x] Tuân thủ nghiêm ngặt các ràng buộc: không lưu dữ liệu CRM vào `localStorage`, không chứa mã đặc tả (`SCR-`, `TSK-`) trên giao diện, không sử dụng emoji trong nhãn và nút.

## File đã tạo/sửa
- `frontend/src/lib/format.ts`: Hàm `formatVnd`, `compareCurrencyStrings`, `sumCurrencyStrings` xử lý tiền tệ an toàn bằng chuỗi và `BigInt`.
- `frontend/src/types/crm.ts`: Định nghĩa types cho Client, Opportunity, Milestones, Stage, CategoryGroup, API responses.
- `frontend/src/hooks/use-crm.ts`: TanStack Query hooks (`useClients`, `useClient`, `useCreateClient`, `useOpportunities`, `useUpdateOpportunityStage`, `useConvertOpportunity`) kèm `fallbackQueryClient`.
- `frontend/src/app/(dashboard)/crm/clients/page.tsx`: Màn hình danh sách khách hàng & form tạo mới (SCR-03).
- `frontend/src/app/(dashboard)/crm/clients/[id]/page.tsx`: Màn hình chi tiết khách hàng & danh sách vụ việc (SCR-04).
- `frontend/src/app/(dashboard)/crm/opportunities/page.tsx`: Màn hình Kanban cơ hội & dialog chuyển đổi vụ việc (SCR-05).

## Kết quả tự kiểm
```text
=== [1/5] Cài đặt dependencies frontend ===
up to date, audited 494 packages in 3s

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
 Test Files  11 passed (11)
      Tests  79 passed (79)
   Start at  12:39:34
   Duration  1.71s (transform 614ms, setup 0ms, collect 1.94s, tests 1.67s, environment 4.06s, prepare 754ms)

=== [5/5] Build thử nghiệm dự án frontend (Next.js) ===
> frontend@1.0.0 build
> next build
   ▲ Next.js 15.0.4
   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types     ✓ Linting and checking validity of types 
   Collecting page data     ✓ Collecting page data 
 ✓ Generating static pages (7/7)
   Collecting build traces     ✓ Collecting build traces 
   Finalizing page optimization     ✓ Finalizing page optimization 

Route (app)                              Size     First Load JS
┌ ○ /                                    1.54 kB         101 kB
├ ○ /_not-found                          896 B           101 kB
├ ○ /crm/clients                         6.35 kB         118 kB
├ ƒ /crm/clients/[id]                    4.42 kB         116 kB
├ ○ /crm/opportunities                   6.79 kB         118 kB
└ ○ /login                               3.6 kB          104 kB
+ First Load JS shared by all            100 kB

=== TẤT CẢ KIỂM TRA ĐÃ ĐẠT CHO TASK-012 ===
KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
