# TASK-023 — Danh sách vụ việc & không gian vụ việc (SCR-07, SCR-08)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không (giao diện; quyền thật do backend kiểm)

## 1. Mục tiêu
Danh sách vụ việc theo phạm vi của người xem và không gian một vụ việc: tổng quan, dòng thời gian giai đoạn (kể cả khoá chờ thu tiền), phân công nhân sự, đổi trạng thái vòng đời. Backend làm sau → test dùng `fetch` giả lập theo hợp đồng.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` **§3.4** (bảng endpoint + `GET /cases/{id}`), §1.2, §1.3
- `docs/12-business-rules.md` §1.2 (vòng đời vụ việc), §1.3 (stage), §2.3 (khoá chờ thu tiền), §2.5 (phân công), §2.6 (vụ việc lịch sử)
- `docs/14-decisions.md` DEC-04 (Kế toán chỉ thấy phần tài chính/tiến độ); `docs/03-screens-and-ui.md` dòng SCR-07, SCR-08
- Giao diện mẫu: `prototype/cases/index.html`, `prototype/cases/detail.html`, `prototype/cases/edit.html`
- Code có sẵn: `frontend/src/lib/api-client.ts`, `frontend/src/hooks/use-auth.ts`, `frontend/src/lib/format.ts`, `frontend/src/components/ui/`

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `frontend/src/app/(dashboard)/cases/page.tsx`, `frontend/src/app/(dashboard)/cases/[id]/page.tsx`, `frontend/src/app/(dashboard)/cases/[id]/layout.tsx`
- `frontend/src/components/cases/` (trừ `components/cases/tasks/`)
- `frontend/src/hooks/use-cases.ts`, `frontend/src/types/cases.ts`

**Người viết test:** `frontend/tests/cases/` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; `frontend/src/app/(dashboard)/cases/[id]/tasks/`, `frontend/src/components/cases/tasks/` (thuộc TASK-024); các file khác của `frontend/src`; `backend/`, `docs/`, `prototype/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- `use-cases.ts`: `useCases(filters)`, `useCase(id, {view})`, `useCaseStages(id)`, `useAssignments(id)`, `useSetAssignments(id)`, `useChangeCaseStatus(id)`.
- **SCR-07** `cases/page.tsx`: bảng mã, tên, khách hàng, giai đoạn hiện tại (huy hiệu theo trạng thái stage), tiến độ `%` (thanh), hạn gần nhất, vai trò của tôi; lọc trạng thái, phòng ban, "Chỉ vụ việc của tôi" (`mine=true`), tìm; phân trang `meta`; giữ bộ lọc trên URL.
- **SCR-08** `cases/[id]`: layout có thanh tab `Tổng quan` · `Tác vụ` (link tới `/cases/{id}/tasks` — TASK-024 làm trang đó) · `Tài chính` (để trống, M4).
  - **Tổng quan:** thông tin vụ việc, `custom_data` hiển thị theo nhãn; dòng thời gian stage từ `GET /cases/{id}/stages` — stage `WAITING_PAYMENT` hiện biểu tượng khoá + tên đợt thu chặn và dòng "Chờ Kế toán xác nhận thu tiền"; `WAITING_APPROVAL` hiện "Chờ duyệt cổng giai đoạn".
  - **Phân công:** danh sách theo vai trò; Quản lý thấy nút "Sửa phân công" → hộp thoại chọn người cho `CASE_MANAGER` (bắt buộc đúng 1), `SUPERVISOR` (≤ 1), `EXECUTOR`/`ASSISTANT` (nhiều); lỗi `ASSIGNEE_HAS_OPEN_TASKS` hiện danh sách task cần chuyển giao trước.
  - **Đổi trạng thái** (Quản lý): nút theo trạng thái hiện tại đúng `12` §1.2 (vd `INITIALIZING` → "Bắt đầu" chỉ bật khi có CASE_MANAGER và ≥ 1 EXECUTOR); `PAUSED`/`TERMINATED` bắt buộc lý do; `TERMINATED` có cảnh báo "các đợt thu chưa thu sẽ bị huỷ".
  - `is_legacy`: biểu ngữ "Vụ việc lịch sử — chỉ đọc", ẩn mọi nút ghi.
  - Vai trò `ACCOUNTANT` hoặc phản hồi `?view=progress`: chỉ hiện mã, tên, trạng thái, tiến độ, tình trạng đợt thu; không tab Tác vụ, không phân công.
- Đủ Empty/Skeleton/Success/ErrorState; 403 `NEED_TO_KNOW_DENIED` → ErrorState "Bạn không thuộc phạm vi vụ việc này".

## 5. Tiêu chí nghiệm thu (đầu vào để viết test)
- [ ] `verify.sh`: `npm --prefix frontend install`, `lint`, `typecheck`, `test`, `build` exit 0; test cũ vẫn xanh.
- [ ] SCR-07: gửi đúng tham số lọc, bỏ tham số rỗng, đọc lại từ URL; hiển thị huy hiệu stage và tiến độ; Empty khi không có vụ việc.
- [ ] Dòng thời gian: `WAITING_PAYMENT` hiện khoá + tên đợt thu; `WAITING_APPROVAL` hiện chờ duyệt; thứ tự theo `order_index`.
- [ ] Phân công: chặn lưu khi 0 hoặc 2 `CASE_MANAGER`, > 1 `SUPERVISOR`; gửi đúng body; `ASSIGNEE_HAS_OPEN_TASKS` liệt kê task; người không phải Quản lý không thấy nút sửa.
- [ ] Đổi trạng thái: nút đúng theo trạng thái; "Bắt đầu" bị khoá khi thiếu nhân sự; thiếu lý do khi tạm dừng/huỷ bị chặn.
- [ ] `is_legacy` ẩn mọi nút ghi; ACCOUNTANT chỉ thấy phần tiến độ; 403 hiện ErrorState đúng thông điệp.
- [ ] Tiền hiển thị qua `formatVnd` (không `Number(`/`parseFloat`); không `localStorage`; không chuỗi `SCR-`/`TSK-`.

## 6. Ràng buộc & bẫy cần tránh
- Không sửa file ngoài mục 3 (TASK-024 làm song song phần tác vụ). Cần đổi menu/api-client → ghi `report.md` mục câu hỏi.
- Chạy test chỉ qua `python3 scripts/handoff.py verify TASK-023` hoặc `npm --prefix frontend run test`. Ghi file bằng công cụ ghi file (tự tạo thư mục cha) — `mkdir`, `npx`, `;`, `||`, `|`, `xargs` bị từ chối.
