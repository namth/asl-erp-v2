# TASK-028 — Văn phòng số trực quan (SCR-15, FEAT-01)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không (giao diện; quyền thật do backend kiểm)

## 1. Mục tiêu
Quản lý xem phòng ban của mình như một văn phòng 2.5D: bàn Trưởng phòng, hàng chờ duyệt trước bàn, các bàn nhân viên kèm huy hiệu số việc; bấm vào người để mở ngăn chi tiết; duyệt nhanh ngay trên phòng; cập nhật thời gian thực qua WebSocket. Backend làm sau → test dùng `fetch`/`WebSocket` giả lập.

## 2. Tài liệu bắt buộc đọc
- `docs/features/virtual-office-floorplan.md` (toàn bộ, đặc biệt §3, §5.2, §6, §7)
- `docs/07-api-contracts.md` **§3.7** (`GET /operations/floorplan`), §3.2 (`GET /departments`), §3.4 (`POST /approvals/{id}/decide`), §1.3
- `docs/03-screens-and-ui.md` dòng SCR-15 và 4 trạng thái UI; `docs/14-decisions.md` DEC-01
- Giao diện mẫu: `prototype/operations/floorplan.html`
- Code có sẵn: `frontend/src/lib/api-client.ts`, `frontend/src/hooks/use-auth.ts` (`useMe`), `frontend/src/hooks/use-approvals.ts` (chỉ dùng, không sửa), `frontend/src/components/ui/`

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `frontend/src/app/(dashboard)/operations/floorplan/`
- `frontend/src/components/floorplan/`
- `frontend/src/hooks/use-floorplan.ts`, `frontend/src/hooks/use-floorplan-live.ts`, `frontend/src/types/floorplan.ts`, `frontend/src/lib/floorplan.ts`

**Người viết test:** `frontend/tests/floorplan/` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; các hook có sẵn; các file khác của `frontend/src` (menu/sidebar, api-client); `backend/`, `docs/`, `prototype/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- `lib/floorplan.ts` (hàm thuần): `splitSeats(data) → { queue, desks }` — người có `pending_count > 0` trong `approval_queue` đứng ở hàng chờ (theo thứ tự `approval_queue`), bàn của họ hiện "Đang trình duyệt" mờ; `applyLiveEvent(data, event) → data` mới (không sửa tại chỗ) cho 3 sự kiện `EVENT_TASK_STATUS_UPDATED` (`{user_id, in_progress_count, todo_count}` → cập nhật bàn, `is_idle = in_progress_count == 0`), `EVENT_APPROVAL_SUBMITTED` (`{user_id, request}` → thêm vào hàng chờ, tăng `pending_count` và `stats.pending_approvals_count`), `EVENT_APPROVAL_DECIDED` (`{user_id, request_id}` → bớt; về 0 thì rời hàng chờ).
- `page.tsx` (chỉ `MANAGER`; vai trò khác → ErrorState "Không có quyền truy cập", không gọi API):
  - Giám đốc (`useMe().is_executive`): dropdown phòng ban từ `GET /departments`, đổi phòng → gọi lại `GET /operations/floorplan?department_id=`. Trưởng phòng: không dropdown, gọi không kèm `department_id`. `403 NEED_TO_KNOW_DENIED` → ErrorState rõ ràng.
  - Thanh chỉ số: tổng nhân sự, tỷ lệ đang làm (`working_count / total_staff`, làm tròn %, 0 nhân sự → `0%`), số hồ sơ chờ duyệt.
  - Bàn nhân viên: tên + chức danh; huy hiệu "X Đang làm" và "Y Chờ xử lý"; `is_idle` → huy hiệu `☕ Đang nghỉ ngơi` (huy hiệu trạng thái đã định nghĩa trong spec, được phép emoji). Ảnh: dùng `avatar_url` nếu có, không có thì chữ cái đầu.
  - Bấm vào người (bàn hoặc hàng chờ) → ngăn bên phải: thông tin, số việc, danh sách yêu cầu chờ duyệt của người đó; nút "Duyệt" / "Trả về" cho từng yêu cầu dùng `POST /approvals/{id}/decide` (Trả về bắt buộc lý do; `APPROVAL_NOT_ALLOWED` → "Bạn không thể duyệt yêu cầu của chính mình"); xong thì làm mới floorplan. Không làm nút "Giao việc nhanh"/"Nhắn tin" (chưa có API).
  - Live Sync: công tắc bật/tắt (mặc định bật) mở `WebSocket` tới `/ws/operations/floorplan?department_id=` (URL tương đối theo `window.location`, `ws:`/`wss:` theo giao thức trang); mỗi tin nhắn JSON `{type, payload}` → `applyLiveEvent` vào cache TanStack Query (`setQueryData`), không gọi lại API. Mất kết nối → banner cam "Mất kết nối thời gian thực" + nút "Kết nối lại". Tắt công tắc / rời trang / đổi phòng → đóng socket cũ.
- Đủ Empty ("Chưa có nhân sự nào được phân công vào phòng ban này") / Skeleton / Success / ErrorState; Light & Dark.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test)
- [ ] `verify.sh`: `npm --prefix frontend install`, `lint`, `typecheck`, `test`, `build` exit 0; test cũ vẫn xanh.
- [ ] `splitSeats`, `applyLiveEvent` đúng cả 3 sự kiện, kể cả về 0 thì rời hàng chờ; không đổi đối tượng đầu vào.
- [ ] Giám đốc có dropdown, đổi phòng gửi đúng `department_id`; Trưởng phòng không có dropdown, không gửi `department_id`; vai trò khác không gọi API; 403 hiện ErrorState.
- [ ] Huy hiệu số việc đúng (TC-FL-03), `☕ Đang nghỉ ngơi` khi rảnh (TC-FL-04), người có yêu cầu chờ ở hàng chờ và bàn mờ (TC-FL-05); tỷ lệ đang làm đúng, 0 nhân sự → `0%`.
- [ ] Ngăn chi tiết mở khi bấm người; Duyệt gửi đúng body; Trả về thiếu lý do bị chặn; `APPROVAL_NOT_ALLOWED` đúng thông điệp; xong làm mới (TC-FL-06).
- [ ] WebSocket: sự kiện cập nhật màn hình không gọi lại `fetch` (TC-FL-07); `onclose` hiện banner + "Kết nối lại" mở socket mới; tắt công tắc đóng socket; đổi phòng đóng socket cũ.
- [ ] Không `localStorage`; không chuỗi `SCR-`/`TSK-`/`FEAT-`; không emoji trong nút.

## 6. Ràng buộc & bẫy cần tránh
- Không thêm thư viện (không three.js/canvas lib); 2.5D bằng CSS transform như prototype.
- Không sửa file ngoài mục 3; cần thêm mục menu → ghi `report.md` mục câu hỏi.
- Chạy test qua `python3 scripts/handoff.py verify TASK-028` hoặc `npm --prefix frontend run test`. Ghi file bằng công cụ ghi file (tự tạo thư mục cha); `mkdir`, `;`, `||`, `|`, `xargs` bị từ chối.
