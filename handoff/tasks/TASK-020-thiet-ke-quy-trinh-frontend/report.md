# Báo cáo TASK-020: Màn hình thiết kế quy trình (SCR-06)

## Đã làm
- Hiện thực hoá đầy đủ các thuật toán phân tích đồ thị quy trình trong `frontend/src/lib/workflow-graph.ts`:
  - `findCycle`: phát hiện chính xác chu trình phụ thuộc 2 task, 3 task và nhánh con chu trình trong DAG; trả về mảng các key tham gia chu trình hoặc `null` nếu không có chu trình.
  - `findForwardDependency`: phát hiện tác vụ phụ thuộc sang giai đoạn sau (forward dependency).
  - `validateDraft`: kiểm tra toàn diện các quy tắc bản nháp theo hợp đồng §3.3a (`order_index` liên tục từ 1, `key` stage và task duy nhất, `sla_business_days > 0`, `complexity_weight` 1–4, `depends_on` không trỏ key lạ hoặc tự phụ thuộc, `triggers_milestone_order >= 1` và không trùng lặp).
- Xây dựng hệ thống hooks quản lý quy trình, phiên bản, trường động và ngày nghỉ lễ trong `frontend/src/hooks/use-workflows.ts` tích hợp React Query và `apiFetch`.
- Xây dựng màn hình danh sách mẫu quy trình `frontend/src/app/(dashboard)/admin/workflows/page.tsx` đáp ứng chuẩn 4 trạng thái giao diện (Loading Skeleton, Empty State, Error State kèm Thử lại, Success State); hiển thị thông tin loại vụ việc, huy hiệu Khung cứng/Linh hoạt, phiên bản phát hành, tình trạng bản nháp; modal tạo mẫu quy trình kèm xử lý lỗi 409 `ACTIVE_TEMPLATE_EXISTS`.
- Xây dựng trình soạn thảo quy trình `frontend/src/app/(dashboard)/admin/workflows/[id]/page.tsx`:
  - Phân biệt rõ bản nháp (DRAFT) đầy đủ quyền soạn thảo và bản phát hành chỉ đọc (PUBLISHED) kèm nút tạo phiên bản mới (bắt lỗi 409 `DRAFT_VERSION_EXISTS`).
  - Thao tác thêm/xoá/sắp xếp thứ tự giai đoạn bằng nút lên/xuống; thêm/xoá tác vụ, chỉnh sửa SLA, vai trò mặc định, trọng số, kích hoạt đợt thu, duyệt kết quả.
  - Dropdown phụ thuộc lọc nghiêm ngặt chỉ cho phép chọn tác vụ ở giai đoạn hiện tại hoặc trước đó.
  - Lưu bản nháp gửi đúng cấu trúc cây §3.3a; gắn lỗi 422 `VALIDATION_ERROR` (details.fields) vào đúng ô nhập liệu.
  - Quy trình phát hành: tự động chạy kiểm tra phía client (`validateDraft`, `findCycle`, `findForwardDependency`) trước khi gọi API; hộp thoại xác nhận cảnh báo "vụ việc đang chạy giữ phiên bản cũ"; bắt lỗi 422 `DEPENDENCY_CYCLE` và tô đỏ các tác vụ trong chu trình.
  - Chuyển đổi chế độ Khung cứng ↔ Linh hoạt kèm hộp xác nhận cảnh báo "chỉ áp cho vụ việc tạo sau lần phát hành kế tiếp".
- Xây dựng component quản lý trường động `frontend/src/components/workflow/custom-fields-editor.tsx`: thêm/xoá trường, kiểm tra định dạng key snake_case duy nhất, bắt buộc `select` phải có tối thiểu 1 lựa chọn, lưu danh sách trường qua `PUT /workflows/matter-types/{id}/custom-fields`.
- Xây dựng màn hình cấu hình ngày nghỉ lễ `frontend/src/app/(dashboard)/admin/holidays/page.tsx`: chọn năm áp dụng, thêm/xoá ngày nghỉ lễ, chặn trùng ngày, lưu danh sách qua `PUT /settings/holidays`, đủ 4 trạng thái UI.
- Phân quyền nghiêm ngặt theo vai trò hệ thống: `ADMIN` toàn quyền soạn thảo và lưu; `MANAGER` xem ở chế độ chỉ đọc (ẩn toàn bộ nút thao tác ghi); các vai trò khác (`ATTORNEY`, `ACCOUNTANT`) bị chặn bằng ErrorState "Không có quyền truy cập".
- Tuân thủ quy chuẩn kỹ thuật: không sử dụng `localStorage`/`sessionStorage`, không lộ chuỗi đặc tả nội bộ, tên file tuân thủ kebab-case.

## File đã tạo/sửa
- `frontend/src/types/workflow.ts`: Định nghĩa kiểu dữ liệu TypeScript cho quy trình, phiên bản, giai đoạn, tác vụ, trường động và ngày nghỉ lễ.
- `frontend/src/lib/workflow-graph.ts`: Thuật toán tìm chu trình (`findCycle`), phụ thuộc tiến (`findForwardDependency`) và kiểm tra hợp lệ bản nháp (`validateDraft`).
- `frontend/src/hooks/use-workflows.ts`: Các React Query hooks thao tác API workflows, versions, custom fields và holidays.
- `frontend/src/components/workflow/custom-fields-editor.tsx`: Giao diện khai báo và cấu hình trường động theo loại vụ việc.
- `frontend/src/app/(dashboard)/admin/workflows/page.tsx`: Màn hình danh sách mẫu quy trình và khởi tạo template mới.
- `frontend/src/app/(dashboard)/admin/workflows/[id]/page.tsx`: Trình soạn thảo cấu trúc quy trình, quản lý phiên bản, lưu nháp và phát hành.
- `frontend/src/app/(dashboard)/admin/holidays/page.tsx`: Màn hình cấu hình danh mục ngày nghỉ lễ theo năm.

## Kết quả tự kiểm
```text
=== [1/5] Cài đặt dependencies frontend ===

up to date, audited 495 packages in 3s

170 packages are looking for funding
  run `npm fund` for details

18 vulnerabilities (2 low, 10 moderate, 3 high, 3 critical)

To address issues that do not require attention, run:
  npm audit fix

To address all issues, run:
  npm audit fix --force

Run `npm audit` for details.
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

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.5 /Users/namtran/agy-farm/worktrees/TASK-020/frontend

 ✓ tests/api-client.test.ts (7)
 ✓ tests/conventions.test.ts (4)
 ✓ tests/dashboard-layout.test.tsx (4)
 ✓ tests/login.test.tsx (11)
 ✓ tests/menu.test.ts (6)
 ✓ tests/ui-states.test.tsx (3)
 ✓ tests/admin/conventions.test.ts (2)
 ✓ tests/admin/departments-page.test.tsx (8)
 ✓ tests/admin/use-admin.test.ts (11)
 ✓ tests/admin/user-create.test.tsx (4)
 ✓ tests/admin/user-detail-page.test.tsx (7)
 ✓ tests/admin/users-page.test.tsx (9)
 ✓ tests/audit/audit-diff.test.tsx (7)
 ✓ tests/audit/audit-integrity.test.tsx (5)
 ✓ tests/audit/audit-page.test.tsx (11)
 ✓ tests/audit/conventions.test.ts (2)
 ✓ tests/audit/use-audit-logs.test.ts (6)
 ✓ tests/crm/client-detail-page.test.tsx (6)
 ✓ tests/crm/clients-page.test.tsx (11)
 ✓ tests/crm/format-vnd.test.ts (9)
 ✓ tests/crm/opportunities-page.test.tsx (11)
 ✓ tests/crm/use-crm.test.ts (7)
 ✓ tests/two-factor/conventions.test.ts (4)
 ✓ tests/two-factor/login-2fa.test.tsx (2)
 ✓ tests/two-factor/security-page.test.tsx (7)
 ✓ tests/two-factor/two-factor-setup.test.tsx (11)
 ✓ tests/two-factor/use-two-factor.test.ts (7)
 ✓ tests/workflow/conventions.test.ts (3)
 ✓ tests/workflow/custom-fields.test.tsx (5)
 ✓ tests/workflow/holidays-page.test.tsx (10)
 ✓ tests/workflow/use-workflows.test.ts (12)
 ✓ tests/workflow/workflow-editor-page.test.tsx (14)
 ✓ tests/workflow/workflow-graph.test.ts (18)
 ✓ tests/workflow/workflows-page.test.tsx (8)

 Test Files  34 passed (34)
      Tests  252 passed (252)
   Start at  16:33:44
   Duration  4.63s (transform 1.27s, setup 0ms, collect 5.74s, tests 7.08s, environment 10.80s, prepare 2.39s)

=== [5/5] Build thử nghiệm dự án frontend (Next.js) ===

> frontend@1.0.0 build
> next build

   ▲ Next.js 15.0.4

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types     ✓ Linting and checking validity of types 
   Collecting page data     ✓ Collecting page data 
 ✓ Generating static pages (13/13)
   Collecting build traces     ✓ Collecting build traces 
   Finalizing page optimization     ✓ Finalizing page optimization 

Route (app)                              Size     First Load JS
┌ ○ /                                    1.54 kB         101 kB
├ ○ /_not-found                          896 B           101 kB
├ ○ /account/security                    2.95 kB         124 kB
├ ○ /admin/audit-logs                    7.07 kB         115 kB
├ ○ /admin/departments                   5.36 kB         117 kB
├ ○ /admin/holidays                      5.17 kB         116 kB
├ ○ /admin/users                         7.41 kB         128 kB
├ ƒ /admin/users/[id]                    6 kB            126 kB
├ ○ /admin/workflows                     5.39 kB         126 kB
├ ƒ /admin/workflows/[id]                10.3 kB         122 kB
├ ○ /crm/clients                         6.44 kB         118 kB
├ ƒ /crm/clients/[id]                    4.51 kB         116 kB
├ ○ /crm/opportunities                   6.88 kB         118 kB
└ ○ /login                               5.66 kB         119 kB
+ First Load JS shared by all            99.9 kB
  ├ chunks/4bd1b696-367555c8c7ab8535.js  52.5 kB
  ├ chunks/517-294265c65ddcf286.js       45.5 kB
  └ other shared chunks (total)          1.91 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

=== TẤT CẢ KIỂM TRA ĐÃ ĐẠT CHO TASK-020 ===

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
