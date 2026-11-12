# TASK-042 — Huy hiệu menu đếm thật từ API thay số cứng

> Người giao: Claude (Trưởng phòng) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không

## 1. Mục tiêu
`frontend/src/lib/menu.ts` đang ghi cứng số trên huy hiệu menu (`'4'`, `'8'`, `'18'`, `'48'`, `'12'`) — dữ liệu giả, trái quy ước "product-ready" trong `CLAUDE.md`. Thay bằng số đếm thật từ API; không có số liệu (đang tải, lỗi, bằng 0, vai trò không gọi được API) thì **ẩn** huy hiệu. Huy hiệu chữ (`'Mới'`, `'TRỰC QUAN'`, `'MÔ PHỎNG'`) giữ nguyên.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` §1.2 (`meta.total_records`), bảng §2–§3.4: `GET /approvals?status=PENDING`, `GET /cases?mine=true`, `GET /me/tasks` (`meta.summary`)
- `frontend/src/lib/menu.ts`, `frontend/src/app/(dashboard)/layout.tsx` (chỗ render `item.badge`), `frontend/src/hooks/use-approvals.ts`, `use-cases.ts`, `use-my-tasks.ts`, `frontend/src/lib/api-client.ts` (`apiFetch`, `apiFetchList`)

## 3. Phạm vi file
**Được tạo/sửa:**
- `frontend/src/lib/menu.ts`
- `frontend/src/app/(dashboard)/layout.tsx`
- `frontend/src/hooks/use-menu-counts.ts` (mới)
- `frontend/tests/` — chỉ người viết test

**Không được sửa:** `backend/`, `docs/`, file trong `tests.lock`, các hook khác ngoài việc import dùng lại.

## 4. Đặc tả
- `menu.ts`: bỏ `badge` số cứng; mục cần đếm khai báo `countKey: 'approvals' | 'cases' | 'tasks'` (giữ `badgeClass`).
  - Mục `href: '/approvals'` → `approvals` = số phần tử `GET /approvals?status=PENDING`.
  - Mục `href: '/cases'` → `cases` = `meta.total_records` của `GET /cases?mine=true&limit=1`.
  - Mục `href: '/tasks'` → `tasks` = `summary.todo + summary.in_progress` từ `useMyTasks()` (`meta.summary`).
- `useMenuCounts(role)` dùng TanStack Query (dùng lại hook có sẵn nếu hợp); `staleTime` ≥ 60 giây; vai trò không có quyền gọi API đó (vd `ADMIN` với `/cases`, `/me/tasks`; `ACCOUNTANT` với `/approvals`) thì **không gọi** và không hiện huy hiệu.
- `layout.tsx`: huy hiệu = huy hiệu chữ tĩnh nếu có, nếu không thì số đếm theo `countKey` khi > 0; > 99 hiển thị `99+`. Lỗi API của một số đếm không làm hỏng sidebar.

## 5. Tiêu chí nghiệm thu (đo được)
1. `grep -nE "badge: '[0-9]+'" frontend/src/lib/menu.ts` không còn kết quả.
2. Với mock API: approvals trả 3 phần tử → mục Duyệt hiện `3`; cases `meta.total_records = 120` → hiện `99+`; me/tasks summary todo 2 + in_progress 1 → hiện `3`.
3. Số đếm bằng 0, đang tải, hoặc API lỗi 500 → không có huy hiệu số cho mục đó, các mục khác vẫn hiện đúng.
4. Vai trò `ADMIN` không gọi `/cases`, `/me/tasks`; `ACCOUNTANT` không gọi `/approvals` (kiểm qua spy).
5. Huy hiệu chữ `Mới` vẫn hiện.
6. `cd frontend && npx tsc --noEmit -p tsconfig.json && npx vitest run && npx next lint` xanh.

## 6. Bẫy cần tránh
- Không để số mặc định/giả khi chưa có dữ liệu.
- Không sửa test khoá; không thêm code sản phẩm chỉ để chiều test (vd gán đè module export).
- Mock trong test phải đúng dạng backend thật (`data[]` + `meta`, `/me/tasks` có `meta.summary`).
- Không `python3 -c` nhiều dòng, không `rm`, không ghép lệnh bằng `&&`; file tạm để ở `handoff/tasks/TASK-042-menu-live-badges/scratch/`.
