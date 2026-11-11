# TASK-016 — Màn hình nhật ký kiểm toán (SCR-13)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không (chỉ đọc; quyền do backend kiểm)

## 1. Mục tiêu
Màn hình cho Quản trị viên tra cứu nhật ký kiểm toán bất biến: lọc theo người thực hiện/hành động/đối tượng/thời gian, xem khác biệt trước–sau, xem trạng thái toàn vẹn chuỗi băm. Backend làm sau → test dùng `fetch` giả lập theo hợp đồng.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` §1.2, §1.3, **§3.2a** (hợp đồng màn hình này)
- `docs/03-screens-and-ui.md` dòng SCR-13 và mục 4 trạng thái UI
- Giao diện mẫu: `prototype/audit-logs/index.html`
- Code có sẵn: `frontend/src/lib/api-client.ts`, `frontend/src/hooks/use-auth.ts`, `frontend/src/components/ui/`, cách làm ở `frontend/src/app/(dashboard)/admin/users/`

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `frontend/src/app/(dashboard)/admin/audit-logs/`
- `frontend/src/components/audit/`
- `frontend/src/hooks/use-audit-logs.ts`, `frontend/src/types/audit.ts`

**Người viết test:** `frontend/tests/audit/` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; các file khác của `frontend/src`; `backend/`, `docs/`, `prototype/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- `use-audit-logs.ts`: `useAuditLogs(filters)` → `GET /audit-logs` với đúng tên tham số §3.2a, bỏ tham số rỗng; `useAuditIntegrity()`; `useRecheckIntegrity()` → `GET /audit-logs/integrity?recheck=true`.
- Bộ lọc giữ trong query string của URL (`?action=…&page=…`) để sao chép link được; đổi bộ lọc → về trang 1.
- Bảng: thời gian (giờ Việt Nam `dd/MM/yyyy HH:mm:ss`), người thực hiện (`actor.full_name`, hoặc "Hệ thống" khi `actor_type = SYSTEM`, "Không xác định" khi `actor = null` mà `actor_type = USER`), hành động, đối tượng, IP.
- Bấm một dòng → ngăn bên hiện diff `before_state`/`after_state`: khoá thêm (xanh), bỏ (đỏ), đổi (vàng, hiện cũ → mới); JSON lồng nhau hiển thị theo đường dẫn `a.b.c`; `row_hash` hiển thị font mono rút gọn 12 ký tự kèm nút sao chép đầy đủ.
- Huy hiệu toàn vẹn: `OK` (xanh, "Chuỗi băm toàn vẹn", kèm `verified_at`, `checked_rows`), `BROKEN` (đỏ, kèm `first_broken_id` và nút chuyển tới dòng đó), `NEVER_CHECKED` (xám). Nút "Kiểm tra ngay" gọi recheck; `429 RATE_LIMITED` → thông báo "Vừa kiểm tra, thử lại sau ít phút".
- Không có bất kỳ nút sửa/xoá nào. Vai trò khác ADMIN → ErrorState "Không có quyền truy cập".
- Đủ Empty, Skeleton loading, Success, ErrorState.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test)
- [ ] `verify.sh`: `npm --prefix frontend install`, `lint`, `typecheck`, `test`, `build` exit 0; test cũ trong `frontend/tests` vẫn xanh.
- [ ] Bộ lọc gửi đúng tham số, bỏ tham số rỗng, đổi lọc về trang 1, đọc lại được từ URL.
- [ ] Hiển thị người thực hiện đúng 3 trường hợp (người dùng / Hệ thống / Không xác định); thời gian theo giờ Việt Nam.
- [ ] Diff đúng cho thêm / bỏ / đổi / lồng nhau; `before_state` hoặc `after_state` = `null` không lỗi.
- [ ] Huy hiệu đúng 3 trạng thái; `BROKEN` có nút tới dòng hỏng; recheck 429 hiện thông báo.
- [ ] Không có nút sửa/xoá; vai trò khác ADMIN thấy ErrorState.
- [ ] Không `localStorage`/`sessionStorage`; không chuỗi `SCR-`/`TSK-` trong text hiển thị.

## 6. Ràng buộc & bẫy cần tránh
- Không sửa file ngoài mục 3; cần đổi menu/api-client → ghi `report.md` mục câu hỏi.
- Chạy test chỉ qua `python3 scripts/handoff.py verify TASK-016`. File tạm ghi trong thư mục dự án; không dùng `|`/`xargs`.
