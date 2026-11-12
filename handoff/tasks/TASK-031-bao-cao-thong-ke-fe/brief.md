# TASK-031 — Báo cáo & thống kê (SCR-18)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không (giao diện; phạm vi dữ liệu và số liệu do backend tính)

## 1. Mục tiêu
Trang `/reports` gồm 3 tab: Doanh thu thực thu, Hoa hồng, Vận hành; bộ lọc kỳ và phòng ban; xuất Excel. Backend làm sau → test dùng `fetch` giả lập.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` **§3.9** (toàn bộ, gồm bảng phạm vi theo vai trò), §1.2, §1.3
- `docs/02-modules-and-features.md` Phân hệ 10 và dòng "Báo cáo doanh thu & hoa hồng" trong ma trận phân quyền; `docs/14-decisions.md` DEC-04
- `docs/03-screens-and-ui.md` dòng SCR-18 và 4 trạng thái UI
- Giao diện mẫu: `prototype/reports/index.html` (chỉ lấy bố cục thẻ chỉ số, bảng, biểu đồ thanh; **bỏ** phần giờ tính phí/billable, SLA — không có trong phạm vi)
- Code có sẵn: `frontend/src/lib/api-client.ts`, `frontend/src/lib/format.ts`, `frontend/src/hooks/use-auth.ts` (`useMe`), `frontend/src/components/ui/`, `frontend/src/lib/menu.ts` (mục `/reports` đã có)

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `frontend/src/app/(dashboard)/reports/`
- `frontend/src/components/reports/`
- `frontend/src/hooks/use-reports.ts`, `frontend/src/types/reports.ts`, `frontend/src/lib/reports.ts`

**Người viết test:** `frontend/tests/reports/` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; các file khác của `frontend/src` (kể cả `api-client.ts`, `layout.tsx`, `menu.ts`); `backend/`, `docs/`, `prototype/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- `lib/reports.ts` (hàm thuần):
  - `defaultRange(today: Date) → { from, to }`: đầu quý chứa `today` → `today`, dạng `YYYY-MM-DD` theo giờ địa phương (vd 2026-11-11 → `2026-10-01`…`2026-11-11`; 2026-01-01 → `2026-01-01`…`2026-01-01`).
  - `validateRange(from, to) → null | 'Ngày bắt đầu phải trước ngày kết thúc' | 'Khoảng thời gian tối đa 366 ngày'` (bằng nhau hợp lệ; 366 ngày tính cả hai đầu là 367 ngày → chặn, `2026-01-01`…`2027-01-01` là 366 ngày → nhận).
  - `formatVnd(s: string) → "5.280.000.000 ₫"` (dấu chấm hàng nghìn, xử lý chuỗi số lớn không mất chính xác — **không** `Number()` với số > 2^53; dùng `BigInt` hoặc thao tác chuỗi); `formatPct("71.35") → "71,35%"`.
  - `barWidths(values: string[]) → number[]` tỷ lệ % so với giá trị lớn nhất (0–100, mọi giá trị 0 → toàn 0).
  - `exportFilename(name, from, to) → "bao-cao-{name}-{from}-{to}.xlsx"`.
- `page.tsx`:
  - Vai trò `ADMIN` → ErrorState "Không có quyền truy cập", không gọi API. Tab Vận hành ẩn với `ACCOUNTANT`. Mặc định mở tab đầu tiên được phép.
  - Bộ lọc: 2 ô ngày (mặc định `defaultRange`), sai → báo dưới ô, **không** gọi API; dropdown phòng ban chỉ hiện khi `meta.departments.length > 1` (lấy từ phản hồi lần đầu), có mục "Tất cả phòng ban" (không gửi `department_id`). Tab Doanh thu có chọn nhóm theo tháng/quý (`group_by`). Tab Hoa hồng có lọc trạng thái chi trả (`payout_status`, mặc định không gửi).
  - Nhãn phạm vi theo `meta.scope`: `FIRM` "Toàn hãng", `DEPARTMENT` "Phòng ban", `SELF` "Số liệu của tôi".
  - Doanh thu: 3 thẻ (`received_total`, `contract_value_total`, `collection_rate_pct`) + số khoản thu; biểu đồ thanh ngang theo kỳ (CSS, rộng theo `barWidths`); bảng theo phòng ban và theo loại vụ việc.
  - Hoa hồng: 3 thẻ (tổng, tích luỹ, đã chi); bảng theo nhân sự với cột từng vai trò (`ORIGINATOR` "Mang khách về", `SUPERVISOR` "Giám sát", `CASE_MANAGER` "Quản lý vụ việc", `EXECUTOR` "Thực hiện", `ASSISTANT` "Hỗ trợ").
  - Vận hành: thẻ số vụ việc theo 5 trạng thái (nhãn tiếng Việt: Khởi tạo, Đang thực hiện, Tạm dừng, Đã đóng, Chấm dứt); bảng task quá hạn (mã vụ việc là link `/cases/{id}`, số ngày quá hạn); bảng thời gian xử lý trung bình theo stage; tỷ lệ chuyển đổi cơ hội.
  - Nút "Xuất Excel" của tab đang mở: `fetch` (gửi cookie) `GET /reports/{name}/export` cùng tham số đang lọc → `Blob` → link tạm `URL.createObjectURL` với tên từ `Content-Disposition` (`filename*=UTF-8''` ưu tiên), không có thì `exportFilename`; thu hồi URL sau khi bấm; đang tải → khoá nút; lỗi → thông báo "Không xuất được báo cáo, thử lại sau".
  - `403 NEED_TO_KNOW_DENIED` / `403 FORBIDDEN_ROLE` → ErrorState "Không có quyền truy cập"; `422` → báo lỗi bộ lọc.
- Server state bằng TanStack Query (query key gồm tên báo cáo và mọi tham số); trạng thái tab/bộ lọc trong component hoặc URL search params, **không** `localStorage`.
- Đủ Empty (dữ liệu toàn 0 / danh sách rỗng: "Chưa có số liệu trong kỳ này") / Skeleton / Success / ErrorState; Light & Dark.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test)
- [ ] `verify.sh`: `npm --prefix frontend install`, `lint`, `typecheck`, `test`, `build` exit 0; test cũ vẫn xanh.
- [ ] Hàm thuần đúng mọi nhánh: `defaultRange` (giữa quý, ngày đầu quý), `validateRange` (đảo ngược, bằng nhau, 366/367 ngày), `formatVnd` với `"12345678901234567890"` không mất chữ số, `formatPct`, `barWidths` (toàn 0), `exportFilename`.
- [ ] ADMIN không gọi API; ACCOUNTANT không thấy tab Vận hành; nhãn phạm vi đúng theo `meta.scope`.
- [ ] Bộ lọc gửi đúng `from`, `to`, `group_by`, `payout_status`, `department_id` (chọn "Tất cả" thì không gửi); khoảng ngày sai không gọi API; dropdown phòng ban chỉ hiện khi > 1 phòng.
- [ ] Số liệu hiện đúng định dạng tiền và %; task quá hạn có link đúng `/cases/{id}`.
- [ ] Xuất Excel gọi đúng URL kèm tham số, dùng tên từ `Content-Disposition`, thu hồi object URL; lỗi hiện đúng thông điệp.
- [ ] 403 hiện ErrorState; Empty đúng thông điệp.
- [ ] Không `localStorage`/`sessionStorage`; không chuỗi `SCR-`/`TSK-`/`DEC-`; không emoji trong nút; không thêm thư viện biểu đồ/Excel.

## 6. Ràng buộc & bẫy cần tránh
- Không thêm thư viện (biểu đồ bằng CSS). Không tự tính lại tổng ở client — hiện đúng số server trả.
- Không mở tệp bằng `window.open(url)` (cần cookie + xử lý lỗi).
- Chạy test qua `python3 scripts/handoff.py verify TASK-031` hoặc `npm --prefix frontend run test`. Ghi file bằng công cụ ghi file (tự tạo thư mục cha); `mkdir`, `;`, `||`, `|`, `xargs` bị từ chối.
- **Người viết test:** không tạo `declarations.d.ts` khai báo module của code sản phẩm (typecheck đỏ lúc chưa có code là chấp nhận được — kiểm đỏ bằng `vitest`).
