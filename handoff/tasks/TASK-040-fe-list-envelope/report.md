# Báo cáo TASK-040

## Đã làm
- **Tiêu chí 1:** Hiện thực `apiFetchList<T>` trong `frontend/src/lib/api-client.ts`, trả về `{ data: T[]; meta: ListMeta }` từ phản hồi chuẩn `{ success: true, data: [...], meta: {...} }`. Tái sử dụng toàn bộ luồng xử lý lỗi `ApiError`, CSRF token và refresh token 401 tự động qua helper `requestJson`. Đã xoá toàn bộ monkey-patch `Object.defineProperty` trên module namespace.
- **Tiêu chí 2:** Cập nhật các kiểu dữ liệu `*ListResponse` trong `frontend/src/types/` (`cases.ts`, `crm.ts`, `admin.ts`, `audit.ts`, `finance.ts`) sang định dạng `data: T[]` + `meta: ListMeta / PaginationMeta`. Cập nhật các hook `useCases`, `useClients`, `useUsers`, `useDepartments`, `useAccountingInbox`, `useCommissions` sử dụng `apiFetchList`. Cập nhật các trang tương ứng (`cases`, `crm/clients`, `admin/users`, `admin/departments`, `admin/audit-logs`, `accounting`, `finance`) đọc `data.data` và tổng số bản ghi từ `meta.total_records` / `meta.total_pages`. Xoá toàn bộ fallback đoán dạng `rawAudit?.data || rawAudit?.[items]`, `rawData?.data || rawData?.[items]`, không dùng `as any`.
- **Tiêu chí 3:** Bàn làm việc (`(dashboard)/page.tsx`) hiển thị đầy đủ dữ liệu khi API trả dạng mảng (`inboxData?.data`, `casesData?.data`, `myTasksData?.data`), hiển thị đúng các khối độc lập kể cả khi 1 khối lỗi 500 (`dashboard-page.test.tsx`).
- **Tiêu chí 4:** Rà soát và loại bỏ việc đọc `.items` từ phản hồi API của các endpoint trả mảng. `grep -rnE "\.items\b" frontend/src` chỉ còn lại `layout.tsx` (menu navigation) và `operations-tab.tsx` (backend `GET /reports/operations` trả object `{ overdue_tasks: { count, items } }`).
- **Tiêu chí 5:** `npx tsc --noEmit -p tsconfig.json`, `npx vitest run` đều vượt qua 100% (80 test files passed, 708 tests passed). `npx next lint` kiểm tra không còn bất kỳ warning hay error nào.

## Sửa sau nghiệm thu chéo (review.md)
1. `frontend/src/hooks/use-audit-logs.ts`: Bỏ import thừa `apiFetchList`.
2. `frontend/src/lib/api-client.ts`: Xoá bỏ hoàn toàn khối monkey-patch `Object.defineProperty` và import `selfModule`, sạch kiểu và chuẩn ES module.
3. `frontend/src/hooks/use-my-tasks.ts`: Bỏ khai báo `items?: MyTaskItem[]` trong `MyTasksResponse`, chỉ giữ `data: MyTaskItem[]`.
4. `frontend/src/app/(dashboard)/page.tsx`: Dùng trực tiếp `myTasksData?.data`, tương thích an toàn với mock dữ liệu kiểm thử.

## File đã tạo/sửa
- `frontend/src/lib/api-client.ts`: Thêm `apiFetchList<T>` và helper dùng chung `requestJson`.
- `frontend/src/types/cases.ts`: Chuyển `CaseListResponse` sang `data: CaseListItem[]` + `meta: ListMeta`.
- `frontend/src/types/crm.ts`: Chuyển `ClientListResponse` sang `data: ClientListItem[]` + `meta: ListMeta`.
- `frontend/src/types/admin.ts`: Chuyển `UserListResponse` và `DepartmentListResponse` sang `data[]` + `meta: ListMeta`.
- `frontend/src/types/audit.ts`: Chuyển `AuditLogsResponse` sang `data: AuditLogItem[]` + `meta: ListMeta`.
- `frontend/src/types/finance.ts`: Chuyển `AccountingInboxResponse` và `CommissionListResponse` sang `data[]` + `meta: ListMeta`.
- `frontend/src/hooks/use-my-tasks.ts`: Cập nhật `MyTasksResponse` chuẩn hóa trường `data: MyTaskItem[]`.
- `frontend/src/hooks/use-cases.ts`: Chuyển sang gọi `apiFetchList`.
- `frontend/src/hooks/use-crm.ts`: Chuyển sang gọi `apiFetchList`.
- `frontend/src/hooks/use-admin.ts`: Chuyển sang gọi `apiFetchList`.
- `frontend/src/hooks/use-accounting.ts`: Chuyển sang gọi `apiFetchList`.
- `frontend/src/hooks/use-audit-logs.ts`: Giữ `apiFetch` theo hợp đồng kiểm toán, trả `{ data, meta }`, bỏ import thừa.
- `frontend/src/hooks/use-finance.ts`: Giữ `apiFetch` theo hợp đồng tài chính, trả `{ data, meta }`.
- `frontend/src/app/(dashboard)/cases/page.tsx`: Dùng `data?.data`, type hóa `item: CaseListItem`, hiển thị phân trang và empty state theo `total_records`.
- `frontend/src/app/(dashboard)/crm/clients/page.tsx`: Dùng `data.data` và `meta.total_records`.
- `frontend/src/app/(dashboard)/admin/users/page.tsx`: Dùng `usersData.data` và `meta.total_records`.
- `frontend/src/app/(dashboard)/admin/departments/page.tsx`: Dùng `usersData.data`.
- `frontend/src/app/(dashboard)/admin/audit-logs/page.tsx`: Dùng `auditData.data` và `meta.total_records`.
- `frontend/src/app/(dashboard)/accounting/page.tsx`: Dùng `inboxData.data`.
- `frontend/src/app/(dashboard)/finance/page.tsx`: Dùng `commissionsData.data`.
- `frontend/src/app/(dashboard)/page.tsx`: Dùng `inboxData?.data`, `casesData?.data`, và liên kết các khối độc lập.
- `frontend/src/components/reports/operations-tab.tsx`: Thêm chú thích cấu trúc backend trả về `overdue_tasks.items`.
- `frontend/tests/audit/audit-diff.test.tsx`: Cập nhật mock test nội bộ sang chuẩn `{ data: [...] }`.
- `frontend/tests/audit/audit-integrity.test.tsx`: Cập nhật mock test nội bộ sang chuẩn `{ data: [...] }`.

## Kết quả tự kiểm
```
 Test Files  80 passed (80)
      Tests  708 passed (708)
   Start at  16:37:59
   Duration  10.38s (transform 2.83s, setup 0ms, collect 12.95s, tests 16.87s, environment 24.88s, prepare 5.69s)

KẾT QUẢ: khoá test OK, verify.sh exit 0
```
```
$ cd frontend && npx next lint
✔ No ESLint warnings or errors
```

## Điểm lệch / câu hỏi cho trưởng phòng
- Không. Toàn bộ 80 test files và 708 tests trong hệ thống đã chạy qua thành công và khớp hoàn toàn với các quy định trong brief.md.
