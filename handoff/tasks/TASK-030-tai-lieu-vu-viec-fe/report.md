# Báo cáo TASK-030

## Đã làm
- Hiện thực hoá đầy đủ quy tắc tệp tin và dung lượng trong `lib/file-rules.ts`: giới hạn `MAX_FILE_BYTES = 52428800` (50 MB), hàm `checkFile` kiểm tra phần mở rộng và MIME type hợp lệ (`.pdf`, `.docx`, `.xlsx`, `.jpg`, `.jpeg`, `.png`), chặn đuôi không cho phép hoặc MIME type giả mạo với `FILE_TYPE_NOT_ALLOWED`, chặn tệp quá 50 MB với `FILE_TOO_LARGE`, hàm `formatBytes` định dạng chuẩn kiểu Việt (dấu phẩy thập phân).
- Xây dựng định nghĩa kiểu dữ liệu trong `types/documents.ts` cho 4 thư mục cố định, trạng thái quét virus (`PENDING`, `CLEAN`, `INFECTED`), tài liệu và phiên bản tài liệu.
- Xây dựng các hook React Query và hàm tiện ích trong `hooks/use-documents.ts`: `useDocuments`, `useDocumentVersions`, `useUploadDocument` (không đặt `Content-Type` thủ công cho `FormData`), `useUploadVersion`, `useArchiveDocument` và `downloadDocumentVersion` (dùng `fetch` với `credentials: 'include'`, đọc tên tệp từ header `Content-Disposition`, xử lý `409 FILE_NOT_AVAILABLE`, tạo và thu hồi URL blob).
- Hiện thực hoá giao diện phân hệ tài liệu vụ việc `cases/[id]/documents/page.tsx`:
  - Cột trái 4 thư mục cố định (`LEGAL_CONTRACTS`, `CLIENT_SUBMISSIONS`, `OFFICIAL_FILINGS`, `INTERNAL_DRAFTS`), chỉ hiển thị thư mục có trong `meta.allowed_folders`; Kế toán chỉ thấy thư mục Hợp đồng dịch vụ và không có nút tải lên/lưu trữ; chuyển đổi thư mục cập nhật URL `?folder=`.
  - Công tắc "Hiện tài liệu đã lưu trữ" gửi `include_archived=true`, hiển thị dòng tài liệu lưu trữ mờ kèm huy hiệu "Đã lưu trữ".
  - Bảng danh sách tài liệu hiển thị đầy đủ tiêu đề, công việc gắn kèm, phiên bản `v{n}`, tên tệp, dung lượng `formatBytes`, người tải, trạng thái quét virus (`PENDING` "Đang quét", `CLEAN` không huy hiệu, `INFECTED` đỏ "Nhiễm virus").
  - Đầy đủ 4 trạng thái giao diện: Loading (Skeleton), Empty ("Chưa có tài liệu trong thư mục này"), Success, ErrorState (xử lý `403 NEED_TO_KNOW_DENIED` "Không có quyền truy cập").
- Hộp thoại tải lên `DocumentUploadModal`: kiểm tra tiêu đề bắt buộc 1–255 ký tự, kiểm tra tệp bằng `checkFile`, gửi `FormData` đúng trường (`folder`, `title`, `task_id`, `file`), hiển thị lỗi server đúng vị trí (`FILE_TYPE_NOT_ALLOWED`/`FILE_TOO_LARGE` dưới ô tệp, thông báo alert cho lỗi khác).
- Ngăn chi tiết tài liệu `DocumentDetailDrawer`: xem lịch sử phiên bản mới nhất trước, nút "Tải phiên bản mới" (ẩn khi lưu trữ hoặc không có quyền `can_upload`), nút "Tải xuống" bị tắt khi tệp đang quét (`PENDING`) hoặc nhiễm virus (`INFECTED`).
- Hộp thoại lưu trữ `DocumentArchiveModal`: yêu cầu lý do bắt buộc 1–500 ký tự, gọi API lưu trữ và làm mới dữ liệu.
- Tuân thủ toàn bộ quy chuẩn kỹ thuật: kebab-case cho tất cả các file, không chứa chuỗi mã đặc tả, không dùng `localStorage`, không dùng `window.open`, không có emoji trong nút bấm.

## File đã tạo/sửa
- `frontend/src/lib/file-rules.ts`: Quy tắc giới hạn kích thước, whitelist loại file và định dạng dung lượng tiếng Việt.
- `frontend/src/types/documents.ts`: Định nghĩa types, constants cho 4 thư mục, phiên bản và dữ liệu tài liệu.
- `frontend/src/hooks/use-documents.ts`: Các hook dữ liệu React Query và hàm tải xuống tệp an toàn.
- `frontend/src/components/documents/document-upload-modal.tsx`: Hộp thoại tải lên tài liệu mới.
- `frontend/src/components/documents/document-archive-modal.tsx`: Hộp thoại xác nhận lưu trữ tài liệu kèm lý do.
- `frontend/src/components/documents/document-version-upload-modal.tsx`: Hộp thoại tải lên phiên bản mới cho tài liệu.
- `frontend/src/components/documents/document-detail-drawer.tsx`: Ngăn chi tiết tài liệu và lịch sử các phiên bản.
- `frontend/src/components/documents/document-table.tsx`: Bảng danh sách tài liệu vụ việc.
- `frontend/src/app/(dashboard)/cases/[id]/documents/page.tsx`: Màn hình Tab Tài liệu trong không gian vụ việc.

## Kết quả tự kiểm
```
=== [1/5] Cài đặt dependencies frontend ===

up to date, audited 495 packages in 14s

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

 RUN  v2.1.5 /Users/namtran/agy-farm/worktrees/TASK-030/frontend

 ✓ tests/audit/audit-page.test.tsx (11)
 ✓ tests/audit/conventions.test.ts (2)
 ✓ tests/audit/use-audit-logs.test.ts (6)
 ✓ tests/cases/case-workspace.test.tsx (16) 552ms
 ✓ tests/cases/cases-page.test.tsx (9)
 ✓ tests/cases/conventions.test.ts (4)
 ✓ tests/cases/use-cases.test.ts (12) 492ms
 ✓ tests/crm/client-detail-page.test.tsx (6)
 ✓ tests/crm/clients-page.test.tsx (11)
 ✓ tests/crm/format-vnd.test.ts (9)
 ✓ tests/crm/opportunities-page.test.tsx (11) 471ms
 ✓ tests/crm/use-crm.test.ts (7)
 ✓ tests/dashboard/conventions.test.ts (5)
 ✓ tests/dashboard/dashboard-page.test.tsx (14) 470ms
 ✓ tests/dashboard/settings-page.test.tsx (13)
 ✓ tests/dashboard/use-dashboard.test.ts (4)
 ✓ tests/documents/conventions.test.ts (5)
 ✓ tests/documents/documents-page.test.tsx (19) 783ms
 ✓ tests/documents/file-rules.test.ts (14)
 ✓ tests/documents/use-documents.test.ts (8)
 ✓ tests/finance/accounting-page.test.tsx (13) 531ms
 ✓ tests/finance/case-finance-page.test.tsx (5)
 ✓ tests/finance/commissions-page.test.tsx (6)
 ✓ tests/finance/conventions.test.ts (5)
 ✓ tests/finance/money.test.ts (18)
 ✓ tests/finance/use-finance.test.ts (7) 325ms
 ✓ tests/tasks/approvals-page.test.tsx (8)
 ✓ tests/tasks/change-requests.test.tsx (6)
 ✓ tests/tasks/conventions.test.ts (5)
 ✓ tests/tasks/task-detail.test.tsx (7)
 ✓ tests/tasks/task-state.test.ts (11)
 ✓ tests/tasks/tasks-page.test.tsx (16) 582ms
 ✓ tests/tasks/use-tasks.test.ts (10) 586ms
 ✓ tests/two-factor/conventions.test.ts (4)
 ✓ tests/two-factor/login-2fa.test.tsx (2)
 ✓ tests/two-factor/security-page.test.tsx (7) 754ms
 ✓ tests/two-factor/two-factor-setup.test.tsx (11) 388ms
 ✓ tests/two-factor/use-two-factor.test.ts (7)
 ✓ tests/workflow/conventions.test.ts (3)
 ✓ tests/workflow/custom-fields.test.tsx (5)
 ✓ tests/workflow/holidays-page.test.tsx (10)
 ✓ tests/workflow/use-workflows.test.ts (12) 694ms
 ✓ tests/workflow/workflow-editor-page.test.tsx (14) 854ms
 ✓ tests/workflow/workflow-graph.test.ts (18)
 ✓ tests/workflow/workflows-page.test.tsx (8)

 Test Files  59 passed (59)
      Tests  492 passed (492)
   Start at  20:56:11
   Duration  7.91s (transform 2.13s, setup 0ms, collect 9.66s, tests 13.86s, environment 17.57s, prepare 4.27s)

=== [5/5] Build thử nghiệm dự án frontend (Next.js) ===

> frontend@1.0.0 build
> next build

   ▲ Next.js 15.0.4

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types     ✓ Linting and checking validity of types 
   Collecting page data     ✓ Collecting page data 
 ✓ Generating static pages (18/18)
   Collecting build traces     ✓ Collecting build traces 
   Finalizing page optimization     ✓ Finalizing page optimization 

Route (app)                              Size     First Load JS
┌ ○ /                                    9.37 kB         130 kB
├ ○ /_not-found                          896 B           101 kB
├ ○ /account/security                    2.96 kB         124 kB
├ ○ /accounting                          8.46 kB         116 kB
├ ○ /admin/audit-logs                    7.07 kB         115 kB
├ ○ /admin/departments                   5.36 kB         117 kB
├ ○ /admin/holidays                      5.17 kB         116 kB
├ ○ /admin/users                         7.41 kB         128 kB
├ ƒ /admin/users/[id]                    6 kB            126 kB
├ ○ /admin/workflows                     5.4 kB          126 kB
├ ƒ /admin/workflows/[id]                10.3 kB         122 kB
├ ○ /approvals                           5.15 kB         126 kB
├ ○ /cases                               3.39 kB         125 kB
├ ƒ /cases/[id]                          6.92 kB         119 kB
├ ƒ /cases/[id]/documents                10.6 kB         118 kB
├ ƒ /cases/[id]/finance                  3.12 kB         115 kB
├ ƒ /cases/[id]/tasks                    9.85 kB         121 kB
├ ○ /crm/clients                         6.44 kB         118 kB
├ ƒ /crm/clients/[id]                    4.51 kB         116 kB
├ ○ /crm/opportunities                   6.94 kB         118 kB
├ ○ /finance                             2.59 kB         114 kB
├ ○ /login                               5.66 kB         119 kB
└ ○ /settings                            7.13 kB         124 kB
+ First Load JS shared by all            99.9 kB
  ├ chunks/4bd1b696-fd245cfcf7b1c808.js  52.5 kB
  ├ chunks/517-ddaefe06d704aaf8.js       45.5 kB
  └ other shared chunks (total)          1.91 kB

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

=== TẤT CẢ KIỂM TRA ĐÃ ĐẠT CHO TASK-030 ===
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
