# TASK-040 — Frontend đọc danh sách theo hợp đồng `data[]` + `meta`

> Người giao: Claude (Trưởng phòng) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không

## 1. Mục tiêu
Khi chạy với backend thật, các trang danh sách **trống**: FE đang chờ `data = { items: [...], total… }` nhưng backend trả đúng hợp đồng `docs/07-api-contracts.md` §1.2: `data` là **mảng**, phân trang nằm ở `meta` (`page, limit, total_records, total_pages`) cạnh `data`. `apiFetch` hiện chỉ trả `json.data` nên mất `meta`.
Sửa FE cho khớp backend; **không** sửa backend.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` §1.2 và mục của từng endpoint FE đang gọi
- `frontend/src/lib/api-client.ts`, `frontend/tests/api-client.test.ts`
- Với mỗi endpoint: đọc **router backend thật** trong `backend/app/api/*.py` (+ `backend/app/services/*.py`) để biết chính xác dạng phản hồi. Một số endpoint không phải danh sách phân trang (vd `GET /reports/operations` có thể trả object chứa mảng con; `/notifications` có `meta.unread_count`) — giữ nguyên chỗ nào đã khớp, chỉ sửa chỗ lệch.

## 3. Phạm vi file
**Được tạo/sửa:**
- `frontend/src/lib/api-client.ts` — thêm `apiFetchList<T>(path, init?) : Promise<{ data: T[]; meta: ListMeta }>` (giữ nguyên `apiFetch`; dùng chung logic lỗi/CSRF/refresh, không nhân bản code)
- `frontend/src/types/` — kiểu `ListMeta` và các kiểu `*ListResponse` đang khai báo `items`
- `frontend/src/hooks/` — các hook gọi endpoint danh sách
- `frontend/src/app/(dashboard)/` và `frontend/src/components/` — các chỗ đọc `.items` / `.total` của dữ liệu API
- `frontend/tests/` — chỉ người viết test

**Không được sửa:** `backend/`, `docs/`, `prototype/`, file trong `tests.lock`.

## 4. Đặc tả
- Đã biết lệch (dò bằng `grep -rnE "\.items\b|items:" frontend/src`): `accounting`, `admin/audit-logs`, `admin/departments`, `admin/users`, `cases`, `crm/clients`, `finance`, `(dashboard)/layout.tsx`, `(dashboard)/page.tsx`, `components/dashboard/*` (accountant-inbox, approvals, my-cases), `components/reports/operations-tab.tsx`, `hooks/use-my-tasks.ts`, các kiểu trong `types/{admin,audit,cases,crm,finance,reports}.ts`. Danh sách này có thể thiếu/thừa — đối chiếu backend.
- Hook danh sách phân trang trả `{ data, meta }` (hoặc tên tương đương thống nhất) để trang hiển thị tổng số và phân trang từ `meta.total_records` / `meta.total_pages`. Tham số phân trang gửi lên là `page` và `limit` (không phải `page_size`) trừ khi backend endpoint đó dùng tên khác.
- Trạng thái Empty/Skeleton/Error của các trang giữ nguyên hành vi.
- Mock trong test hiện có (MSW/fetch mock) trả dạng cũ `items` phải đổi sang dạng thật của backend.

## 5. Tiêu chí nghiệm thu (đo được)
1. `apiFetchList` trả cả `data` (mảng) và `meta` từ phản hồi `{success, data:[…], meta:{…}}`; lỗi `success:false` vẫn ném `ApiError` đúng `code`; 401 vẫn tự refresh 1 lần như `apiFetch`.
2. Với mock phản hồi đúng dạng backend, mỗi trang: Vụ việc, Khách hàng, Người dùng, Phòng ban, Nhật ký kiểm toán, Hòm thư Kế toán, Sổ hoa hồng (finance) **hiển thị đúng số dòng** và tổng số bản ghi lấy từ `meta.total_records`.
3. Bàn làm việc (`(dashboard)/page.tsx` + thẻ dashboard) hiển thị dữ liệu khi API trả mảng.
4. `grep -rnE "\.items\b" frontend/src` không còn chỗ đọc `.items` từ phản hồi API của endpoint trả mảng (chỉ còn chỗ backend thật trả `items`, có comment dẫn endpoint).
5. `cd frontend && npx tsc --noEmit -p tsconfig.json && npx vitest run` xanh; `npx next lint` không lỗi mới.

## 6. Bẫy cần tránh
- Không đổi backend hay hợp đồng cho khớp FE.
- Không để cả hai dạng (`items` lẫn mảng) bằng cách "đoán" lúc chạy (`data.items ?? data`) — chọn đúng dạng theo backend.
- Không xoá/skip test cũ để né; cập nhật mock cho đúng dạng thật.
- Không lưu dữ liệu nghiệp vụ vào localStorage; server state vẫn qua TanStack Query.
