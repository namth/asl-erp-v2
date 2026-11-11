# TASK-024 — Bảng tác vụ, yêu cầu bổ sung & hàng chờ duyệt (SCR-09, SCR-10, SCR-16)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không (giao diện; quyền thật do backend kiểm)

## 1. Mục tiêu
Trong vụ việc: bảng tác vụ Kanban/Danh sách đổi trạng thái đúng máy trạng thái, hiện rõ phụ thuộc và khoá; chi tiết task với bình luận; gửi yêu cầu bổ sung (vụ việc Linh hoạt). Toàn hệ thống: hàng chờ duyệt của người xem và hộp thoại duyệt/trả về. Backend làm sau → test dùng `fetch` giả lập.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` **§3.4** (bảng endpoint, `PATCH …/status`, `POST …/change-requests`, `GET /approvals`, `POST /approvals/{id}/decide`), §1.3
- `docs/12-business-rules.md` §1.4 (task), §2.1 (phụ thuộc), §2.2 (ai được duyệt), §2.3 (khoá chờ thu tiền), §2.4 (DEC-07)
- `docs/14-decisions.md` DEC-07; `docs/03-screens-and-ui.md` dòng SCR-09, SCR-10, SCR-16
- Giao diện mẫu: `prototype/tasks/index.html`, `tasks/list.html`, `tasks/detail.html`, `prototype/approvals/index.html`
- Code có sẵn: `frontend/src/lib/api-client.ts`, `frontend/src/hooks/use-auth.ts`, `frontend/src/components/ui/`

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `frontend/src/app/(dashboard)/cases/[id]/tasks/`
- `frontend/src/app/(dashboard)/approvals/`
- `frontend/src/components/cases/tasks/`, `frontend/src/components/approvals/`
- `frontend/src/hooks/use-tasks.ts`, `frontend/src/hooks/use-approvals.ts`, `frontend/src/types/tasks.ts`, `frontend/src/lib/task-state.ts`

**Người viết test:** `frontend/tests/tasks/` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; `frontend/src/app/(dashboard)/cases/page.tsx`, `cases/[id]/page.tsx`, `cases/[id]/layout.tsx`, các file khác trong `frontend/src/components/cases/` (thuộc TASK-023); các file khác của `frontend/src`; `backend/`, `docs/`, `prototype/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- `lib/task-state.ts` (hàm thuần): `nextStatuses(task, {stageStatus, caseStatus}) → TaskStatus[]` theo `12` §1.4 — rỗng khi stage khác `ACTIVE` hoặc vụ việc `PAUSED`/`is_legacy`; `IN_PROGRESS → WAITING_APPROVAL` khi `requires_approval`, `IN_PROGRESS → COMPLETED` khi không; `TODO → IN_PROGRESS` chỉ khi `blocked_by` rỗng.
- **SCR-09** `cases/[id]/tasks/page.tsx`: chuyển Kanban (4 cột theo trạng thái) ↔ Danh sách; lọc theo stage, người làm. Thẻ task: tiêu đề, người làm, hạn (đỏ khi quá hạn), huy hiệu "Bổ sung" khi `is_ad_hoc`, biểu tượng khoá + "Chờ: <tên task>" khi `blocked_by` khác rỗng. Đổi trạng thái bằng menu trên thẻ chỉ gồm `nextStatuses` (không kéo-thả). Trả về từ `WAITING_APPROVAL` → `IN_PROGRESS` (khi người xem là người duyệt) bắt buộc lý do. Lỗi `PREREQUISITE_TASK_NOT_COMPLETED`, `STAGE_LOCKED`, `CASE_PAUSED`, `INVALID_STATE_TRANSITION` hiện thông điệp tiếng Việt.
- **Chi tiết task** (ngăn bên): mô tả, phụ thuộc, sửa người làm/hạn (`PATCH`; `ASSIGNEE_NOT_IN_CASE` hiện lỗi), bình luận (mới nhất trước, 1–5000 ký tự).
- **Yêu cầu bổ sung:** nút "Đề xuất thêm tác vụ" chỉ hiện khi vụ việc `FLEXIBLE`; hộp thoại theo mẫu `POST …/change-requests` (chọn stage, tiêu đề, người làm, hạn, trọng số 1–4, lý do bắt buộc); thành công hiện "Đã gửi, chờ Quản lý duyệt" và danh sách yêu cầu kèm trạng thái. Vụ việc `STRICT` không có nút; nếu server vẫn trả `STRICT_GOVERNANCE_VIOLATION` → thông báo rõ.
- **SCR-16** `approvals/page.tsx`: hàng chờ từ `GET /approvals?status=PENDING`, lọc theo loại (Task / Cổng giai đoạn / Yêu cầu bổ sung), mỗi dòng link tới vụ việc. **SCR-10** hộp thoại duyệt: Duyệt / Trả về; Trả về bắt buộc lý do; `APPROVAL_NOT_ALLOWED` → "Bạn không thể duyệt yêu cầu của chính mình"; xong thì làm mới hàng chờ.
- Đủ Empty/Skeleton/Success/ErrorState.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test)
- [ ] `verify.sh`: `npm --prefix frontend install`, `lint`, `typecheck`, `test`, `build` exit 0; test cũ vẫn xanh.
- [ ] `nextStatuses` đúng mọi nhánh: phụ thuộc chưa xong, stage khoá, vụ việc tạm dừng/lịch sử, có/không cần duyệt.
- [ ] Kanban/Danh sách hiển thị đúng cột; thẻ bị chặn hiện khoá + tên task chờ; menu chỉ có trạng thái hợp lệ; gửi đúng body `PATCH …/status`; các mã lỗi hiện đúng thông điệp.
- [ ] Trả về thiếu lý do bị chặn; bình luận rỗng hoặc > 5000 ký tự bị chặn; `ASSIGNEE_NOT_IN_CASE` hiện lỗi.
- [ ] Nút đề xuất chỉ có ở vụ việc `FLEXIBLE`; thiếu lý do bị chặn; gửi đúng body; thành công hiện trạng thái chờ duyệt.
- [ ] Hàng chờ lọc đúng loại; Trả về thiếu lý do bị chặn; `APPROVAL_NOT_ALLOWED` hiện đúng thông điệp; xong làm mới danh sách.
- [ ] Không `localStorage`; không chuỗi `SCR-`/`TSK-`; không emoji trong nút.

## 6. Ràng buộc & bẫy cần tránh
- Không sửa file ngoài mục 3 (TASK-023 làm song song phần danh sách/tổng quan vụ việc). Cần đổi menu/api-client → ghi `report.md` mục câu hỏi.
- Không thêm thư viện kéo-thả.
- Chạy test chỉ qua `python3 scripts/handoff.py verify TASK-024` hoặc `npm --prefix frontend run test`. Ghi file bằng công cụ ghi file (tự tạo thư mục cha) — `mkdir`, `npx`, `;`, `||`, `|`, `xargs` bị từ chối.
