# Báo cáo TASK-023: Danh sách vụ việc & không gian vụ việc (SCR-07, SCR-08)

## Đã làm
- **`verify.sh`:** Cài đặt dependencies, lint, typecheck, chạy 38/38 test suite (293/293 tests vitest) và build Next.js thành công với exit code 0.
- **SCR-07 (`cases/page.tsx`):**
  - Hiển thị danh sách vụ việc với 4 trạng thái giao diện chuẩn (Loading/Skeleton, Empty, Error có nút Thử lại, Success).
  - Đầy đủ thông tin: mã vụ việc, tên vụ việc, khách hàng, giai đoạn hiện tại kèm huy hiệu trạng thái stage, tiến độ % với thanh hiển thị, hạn gần nhất, vai trò của tôi, trạng thái vụ việc.
  - Bộ lọc tìm kiếm từ khóa, trạng thái, "Chỉ vụ việc của tôi" (`mine=true`), đồng bộ 2 chiều với URL searchParams và phân trang chuẩn.
  - Tự động bỏ qua các tham số lọc rỗng / khoảng trắng khi gọi API.
- **SCR-08 (`cases/[id]`):**
  - Layout phân quyền: thanh tab `Tổng quan` · `Tác vụ` (liên kết `/cases/{id}/tasks`) · `Tài chính`. Với vai trò `ACCOUNTANT` hoặc phản hồi `?view=progress`, tab `Tác vụ` và phần `Phân công` được ẩn hoàn toàn theo đúng DEC-04.
  - Dòng thời gian giai đoạn (`StageTimeline`): hiển thị danh sách giai đoạn sắp xếp theo `order_index`. Giai đoạn `WAITING_PAYMENT` hiển thị biểu tượng khoá kèm tên đợt thu chặn và thông điệp "Chờ Kế toán xác nhận thu tiền"; giai đoạn `WAITING_APPROVAL` hiển thị "Chờ duyệt cổng giai đoạn".
  - Phân công nhân sự vụ việc (`AssignmentDialog`): hiển thị danh sách theo vai trò. Quản lý có nút "Sửa phân công", chặn lưu khi số lượng `CASE_MANAGER !== 1` hoặc `SUPERVISOR > 1`. Xử lý lỗi 409 `ASSIGNEE_HAS_OPEN_TASKS` hiển thị danh sách task cần bàn giao. Ẩn nút sửa với người không phải Quản lý.
  - Đổi trạng thái vòng đời (`StatusTransitionDialog`): các nút thao tác theo đúng máy trạng thái (§1.2). Vụ việc `INITIALIZING` có nút "Bắt đầu vụ việc" bị khoá khi chưa đủ 1 `CASE_MANAGER` và ≥ 1 `EXECUTOR`. Chuyển sang `PAUSED` hoặc `TERMINATED` bắt buộc nhập lý do; `TERMINATED` có cảnh báo "các đợt thu chưa thu sẽ bị huỷ".
  - Vụ việc lịch sử (`is_legacy = true`): hiển thị biểu ngữ "Vụ việc lịch sử — chỉ đọc" và ẩn toàn bộ các nút ghi.
  - Xử lý mã lỗi 403 `NEED_TO_KNOW_DENIED` hiển thị ErrorState với thông điệp "Bạn không thuộc phạm vi vụ việc này".
  - Hiển thị `custom_data` theo nhãn thân thiện.
  - Tuân thủ quy chuẩn: tiền tệ hiển thị qua `formatVnd`, không sử dụng `localStorage`, không chứa chuỗi mã đặc tả `SCR-`/`TSK-` trong giao diện, tên file theo chuẩn kebab-case.

## File đã tạo/sửa
- `frontend/src/types/cases.ts`: Định nghĩa kiểu dữ liệu chuẩn cho phân hệ Vụ việc (trạng thái, vai trò, giai đoạn, phân công, bộ lọc, payload).
- `frontend/src/hooks/use-cases.ts`: Cung cấp các TanStack Query hooks `useCases`, `useCase`, `useCaseStages`, `useAssignments`, `useSetAssignments`, `useChangeCaseStatus`.
- `frontend/src/components/cases/case-badge.tsx`: Component hiển thị huy hiệu trạng thái vụ việc, trạng thái giai đoạn và vai trò vụ việc.
- `frontend/src/components/cases/stage-timeline.tsx`: Component hiển thị dòng thời gian giai đoạn vụ việc, xử lý cảnh báo khoá thanh toán và chờ duyệt.
- `frontend/src/components/cases/assignment-dialog.tsx`: Hộp thoại phân công nhân sự kèm logic xác thực số lượng vai trò và xử lý lỗi task chưa bàn giao.
- `frontend/src/components/cases/status-transition-dialog.tsx`: Hộp thoại xác nhận chuyển trạng thái vòng đời, bắt buộc nhập lý do và cảnh báo huỷ đợt thu.
- `frontend/src/app/(dashboard)/cases/page.tsx`: Màn hình danh sách vụ việc SCR-07.
- `frontend/src/app/(dashboard)/cases/[id]/layout.tsx`: Layout không gian vụ việc SCR-08 với thanh điều hướng tab theo vai trò.
- `frontend/src/app/(dashboard)/cases/[id]/page.tsx`: Trang tổng quan không gian vụ việc SCR-08.

## Kết quả tự kiểm
```
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

Test Files  38 passed (38)
     Tests  293 passed (293)
  Duration  5.34s

=== [5/5] Build thử nghiệm dự án frontend (Next.js) ===
> frontend@1.0.0 build
> next build
   ▲ Next.js 15.0.4
   Creating an optimized production build ...
 ✓ Compiled successfully
 ✓ Linting and checking validity of types 
 ✓ Collecting page data 
 ✓ Generating static pages (14/14)
 ✓ Collecting build traces 
 ✓ Finalizing page optimization 

Route (app)                              Size     First Load JS
┌ ○ /                                    1.54 kB         101 kB
├ ○ /_not-found                          896 B           101 kB
├ ○ /account/security                    2.95 kB         124 kB
├ ○ /admin/audit-logs                    7.07 kB         115 kB
├ ○ /admin/departments                   5.36 kB         117 kB
├ ○ /admin/holidays                      5.17 kB         116 kB
├ ○ /admin/users                         7.41 kB         128 kB
├ ƒ /admin/users/[id]                    6 kB            126 kB
├ ○ /admin/workflows                     5.4 kB          126 kB
├ ƒ /admin/workflows/[id]                10.3 kB         122 kB
├ ○ /cases                               3.39 kB         125 kB
├ ƒ /cases/[id]                          6.92 kB         119 kB
├ ○ /crm/clients                         6.44 kB         118 kB
├ ƒ /crm/clients/[id]                    4.51 kB         116 kB
├ ○ /crm/opportunities                   6.94 kB         118 kB
└ ○ /login                               5.66 kB         119 kB
+ First Load JS shared by all            99.9 kB

=== TẤT CẢ KIỂM TRA ĐÃ ĐẠT CHO TASK-023 ===
KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không.
