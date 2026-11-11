# Báo cáo TASK-024 — Bảng tác vụ, yêu cầu bổ sung & hàng chờ duyệt (SCR-09, SCR-10, SCR-16)

## Đã làm
- **Máy trạng thái tác vụ (`task-state.ts`):** Hiện thực hoá hàm thuần `nextStatuses(task, context)` tính toán chính xác mọi nhánh: chặn khi giai đoạn chưa `ACTIVE`, khi vụ việc `PAUSED`, `is_legacy`, `CLOSED`, `TERMINATED`; chuyển `TODO -> IN_PROGRESS` chỉ khi `blocked_by` rỗng; `IN_PROGRESS -> WAITING_APPROVAL` khi `requires_approval = true` và sang `COMPLETED` khi không cần duyệt; `WAITING_APPROVAL` và `COMPLETED` không chuyển tiếp trên menu thẻ.
- **Màn hình Bảng tác vụ vụ việc (`cases/[id]/tasks/page.tsx` - SCR-09):**
  - Chuyển đổi linh hoạt giữa chế độ xem Kanban (4 cột trạng thái: Cần làm, In Progress, Chờ duyệt, Hoàn thành) và Danh sách; hỗ trợ lọc theo giai đoạn và người làm.
  - Hiển thị thẻ tác vụ trực quan: tiêu đề, người làm, hạn chót (định dạng đỏ khi quá hạn), huy hiệu "Bổ sung" cho tác vụ `is_ad_hoc`, biểu tượng khoá kèm "Chờ: <tên task>" khi `blocked_by` khác rỗng.
  - Menu chuyển trạng thái trên thẻ chỉ chứa trạng thái hợp lệ từ `nextStatuses`, vô hiệu hoá khi task bị chặn phụ thuộc; gửi đúng body `PATCH /cases/{id}/tasks/{taskId}/status`.
  - Hộp thoại Trả về từ `WAITING_APPROVAL -> IN_PROGRESS` bắt buộc nhập lý do (chặn gửi khi lý do rỗng).
  - Bắt và hiển thị thông điệp tiếng Việt thân thiện, chuẩn xác cho các mã lỗi: `PREREQUISITE_TASK_NOT_COMPLETED`, `STAGE_LOCKED`, `CASE_PAUSED`, `INVALID_STATE_TRANSITION`.
- **Ngăn bên chi tiết tác vụ & bình luận (`task-detail-drawer.tsx`):**
  - Hiển thị tiêu đề, mô tả đầy đủ và danh sách quan hệ phụ thuộc.
  - Cập nhật người thực hiện và hạn chót (`PATCH /cases/{id}/tasks/{taskId}`); hiển thị thông báo lỗi tiếng Việt khi server trả về `ASSIGNEE_NOT_IN_CASE`.
  - Quản lý bình luận với danh sách mới nhất ở trên đầu; form nhập chặn gửi khi rỗng, chặn khi vượt quá 5000 ký tự và reset ô nhập khi thành công.
- **Đề xuất yêu cầu bổ sung tác vụ (`change-request-modal.tsx` - DEC-07):**
  - Nút "Đề xuất thêm tác vụ" chỉ hiển thị ở vụ việc chế độ `FLEXIBLE`, ẩn hoàn toàn ở vụ việc `STRICT`.
  - Form đề xuất với đầy đủ trường (giai đoạn, tiêu đề, người làm, trọng số 1–4, hạn chót, lý do bắt buộc); chặn gửi khi thiếu lý do; gửi chuẩn payload `POST /cases/{id}/change-requests`.
  - Hiển thị thông báo "Đã gửi, chờ Quản lý duyệt" khi thành công; xử lý lỗi `STRICT_GOVERNANCE_VIOLATION`.
- **Hàng chờ phê duyệt (`approvals/page.tsx` - SCR-16 & SCR-10):**
  - Hiển thị hàng chờ phê duyệt từ `GET /approvals?status=PENDING`, liên kết trực tiếp tới vụ việc.
  - Bộ lọc theo loại: Tất cả, Tác vụ, Cổng giai đoạn, Yêu cầu bổ sung.
  - Thao tác Duyệt (gửi `POST /approvals/{id}/decide` với action `APPROVE`) và làm mới hàng chờ sau khi xong.
  - Thao tác Trả về với hộp thoại bắt buộc nhập lý do (gửi `action: 'REJECT'` kèm `comment`).
  - Xử lý mã lỗi `APPROVAL_NOT_ALLOWED` hiển thị đúng thông báo: "Bạn không thể duyệt yêu cầu của chính mình".
- **Quy chuẩn kỹ thuật:**
  - Đầy đủ 4 trạng thái giao diện UI 4-states: Loading (Skeleton), Empty, Error (thử lại), Success.
  - Không sử dụng `localStorage`/`sessionStorage`.
  - Không chứa chuỗi đặc tả `SCR-` hay `TSK-` trong giao diện người dùng.
  - Không sử dụng emoji trong các nút bấm.
  - Không cài đặt thêm thư viện kéo-thả ngoài quy định.

## File đã tạo/sửa
- `frontend/src/types/tasks.ts`: Định nghĩa kiểu dữ liệu TypeScript cho tác vụ, bình luận, đề xuất bổ sung, hàng chờ duyệt.
- `frontend/src/lib/task-state.ts`: Hàm tính toán máy trạng thái tác vụ thuần tuý `nextStatuses`.
- `frontend/src/hooks/use-tasks.ts`: Hooks TanStack Query quản lý tác vụ, bình luận, đề xuất bổ sung (tích hợp fallback QueryClient cho unit tests).
- `frontend/src/hooks/use-approvals.ts`: Hooks TanStack Query quản lý hàng chờ và quyết định duyệt.
- `frontend/src/components/cases/tasks/task-detail-drawer.tsx`: Component ngăn bên chi tiết tác vụ, quan hệ phụ thuộc, sửa phân công/hạn và bình luận.
- `frontend/src/components/cases/tasks/change-request-modal.tsx`: Component hộp thoại đề xuất bổ sung tác vụ mới.
- `frontend/src/app/(dashboard)/cases/[id]/tasks/page.tsx`: Màn hình Bảng tác vụ vụ việc SCR-09.
- `frontend/src/app/(dashboard)/approvals/page.tsx`: Màn hình Hàng chờ phê duyệt SCR-16 và hộp thoại duyệt SCR-10.

## Kết quả tự kiểm
```text
=== [1/5] Cài đặt dependencies frontend ===
up to date, audited 495 packages in 3s
170 packages are looking for funding
  run `npm fund` for details
18 vulnerabilities (2 low, 10 moderate, 3 high, 3 critical)

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

 ✓ tests/tasks/approvals-page.test.tsx (8)
 ✓ tests/tasks/change-requests.test.tsx (6)
 ✓ tests/tasks/conventions.test.ts (5)
 ✓ tests/tasks/task-detail.test.tsx (7)
 ✓ tests/tasks/task-state.test.ts (11)
 ✓ tests/tasks/tasks-page.test.tsx (16)
 ✓ tests/tasks/use-tasks.test.ts (10)

 Test Files  41 passed (41)
      Tests  315 passed (315)
   Start at  17:17:48
   Duration  5.74s (transform 1.52s, setup 0ms, collect 6.91s, tests 9.80s, environment 12.50s, prepare 2.98s)

=== [5/5] Build thử nghiệm dự án frontend (Next.js) ===
> frontend@1.0.0 build
> next build

   ▲ Next.js 15.0.4
   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types     ✓ Linting and checking validity of types 
   Collecting page data     ✓ Collecting page data 
 ✓ Generating static pages (14/14)
   Collecting build traces     ✓ Collecting build traces 
   Finalizing page optimization     ✓ Finalizing page optimization 

Route (app)                              Size     First Load JS
├ ○ /approvals                           5.14 kB         126 kB
├ ƒ /cases/[id]/tasks                    9.85 kB         121 kB
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

=== TẤT CẢ KIỂM TRA ĐÃ ĐẠT CHO TASK-024 ===
KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
