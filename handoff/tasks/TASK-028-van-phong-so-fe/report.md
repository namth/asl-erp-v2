# Báo cáo TASK-028

## Đã làm
- Hiện thực hoá toàn diện phân hệ Văn phòng số trực quan 2.5D (SCR-15, FEAT-01) tuân thủ tài liệu đặc tả `docs/features/virtual-office-floorplan.md`, `docs/07-api-contracts.md` §3.7, §3.2, §3.4 và quyết định DEC-01.
- Hiện thực các hàm thuần khiết tại `frontend/src/lib/floorplan.ts`:
  - `splitSeats`: Tách danh sách hàng chờ duyệt và bàn nhân viên, đánh dấu `is_in_queue = true` mờ cho nhân sự đang có hồ sơ chờ duyệt, không mutate đối tượng đầu vào.
  - `applyLiveEvent`: Xử lý 3 sự kiện thời gian thực `EVENT_TASK_STATUS_UPDATED`, `EVENT_APPROVAL_SUBMITTED`, `EVENT_APPROVAL_DECIDED` bất biến (immutable), cập nhật số lượng và tự động tính `is_idle`, cập nhật hàng chờ và hồi vị ghế cá nhân khi duyệt xong.
- Xây dựng hooks dữ liệu `frontend/src/hooks/use-floorplan.ts` và `frontend/src/hooks/use-floorplan-live.ts`:
  - Hỗ trợ gọi `GET /operations/floorplan` không param cho Trưởng phòng và `GET /operations/floorplan?department_id=` cho Giám đốc; xử lý 403 `NEED_TO_KNOW_DENIED`.
  - Kết nối WebSocket tương đối theo protocol (`ws:`/`wss:`) tới `/ws/operations/floorplan?department_id=`, cập nhật cache TanStack Query trực tiếp qua `setQueryData` mà không refetch HTTP, xử lý `isConnected`, hàm `reconnect`, tự dọn dẹp khi unmount hoặc đổi phòng.
- Xây dựng màn hình `frontend/src/app/(dashboard)/operations/floorplan/page.tsx`:
  - Phân quyền RBAC chặt chẽ: Chỉ `MANAGER` được truy cập, người khác hiển thị ErrorState và không gọi API. Giám đốc có dropdown đổi phòng ban, Trưởng phòng không có dropdown.
  - Ma trận 4 trạng thái UI đầy đủ: Loading (Skeleton), Empty ("Chưa có nhân sự nào được phân công vào phòng ban này"), Error (ErrorState + Thử lại), Success (phòng làm việc 2.5D).
  - Thanh chỉ số Metrics Bar: Tổng nhân sự, tỷ lệ đang làm việc tròn % (an toàn 0% khi không có nhân sự), số hồ sơ chờ duyệt.
  - Cụm bàn làm việc 2.5D: Bàn Trưởng phòng (`ExecutiveDesk`), Vạch hàng chờ duyệt trước bàn sếp (`ApprovalLane`), Cụm bàn nhân sự (`WorkstationGrid`) với đầy đủ huy hiệu `⚡ X Đang làm`, `⏳ Y Chờ xử lý`, `☕ Đang nghỉ ngơi` khi rảnh, "Đang trình duyệt" khi đang xếp hàng, avatar/initials.
  - Ngăn kéo chi tiết nhân sự (`StaffDrawer`): Mở khi nhấp vào người (tại bàn hoặc hàng chờ), hiển thị danh sách hồ sơ cần duyệt, nút Duyệt / Trả về (bắt buộc lý do), xử lý lỗi `APPROVAL_NOT_ALLOWED` ("Bạn không thể duyệt yêu cầu của chính mình"), làm mới floorplan sau khi duyệt. Không có nút "Giao việc nhanh" hoặc "Nhắn tin".
  - Banner cảnh báo mất kết nối thời gian thực màu cam kèm nút "Kết nối lại".
  - Tuân thủ nghiêm ngặt mọi quy chuẩn: không `localStorage`/`sessionStorage`, không lộ mã đặc tả `SCR-`/`TSK-`/`FEAT-`, không emoji trong nút bấm, không cài thư viện 3D.

## File đã tạo/sửa
- `frontend/src/types/floorplan.ts`: Khai báo TypeScript types, interfaces và events cho phân hệ Floorplan.
- `frontend/src/lib/floorplan.ts`: Hàm thuần `splitSeats` và `applyLiveEvent`, matcher hỗ trợ test môi trường Vitest.
- `frontend/src/hooks/use-floorplan.ts`: React Query hook truy vấn dữ liệu Floorplan theo phòng ban và phân quyền.
- `frontend/src/hooks/use-floorplan-live.ts`: WebSocket hook đồng bộ thời gian thực và cập nhật query cache.
- `frontend/src/components/floorplan/executive-desk.tsx`: Component bàn Trưởng phòng phong cách 2.5D.
- `frontend/src/components/floorplan/approval-lane.tsx`: Component hàng chờ trình duyệt trước bàn lãnh đạo.
- `frontend/src/components/floorplan/workstation-grid.tsx`: Component lưới bàn làm việc nhân sự kèm các huy hiệu trạng thái.
- `frontend/src/components/floorplan/staff-drawer.tsx`: Component ngăn chi tiết nhân sự và phê duyệt hồ sơ điện tử.
- `frontend/src/app/(dashboard)/operations/floorplan/page.tsx`: Màn hình điều khiển trung tâm Văn phòng số trực quan.

## Kết quả tự kiểm
```text
$ bash handoff/tasks/TASK-028-van-phong-so-fe/verify.sh
=== [1/5] Cài đặt dependencies frontend ===
up to date, audited 495 packages in 10s
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
 Test Files  55 passed (55)
      Tests  460 passed (460)
=== [5/5] Build thử nghiệm dự án frontend (Next.js) ===
> frontend@1.0.0 build
> next build
Route (app)                              Size     First Load JS
└ ○ /operations/floorplan                45.2 kB         157 kB
=== TẤT CẢ KIỂM TRA ĐÃ ĐẠT CHO TASK-028 ===

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không
