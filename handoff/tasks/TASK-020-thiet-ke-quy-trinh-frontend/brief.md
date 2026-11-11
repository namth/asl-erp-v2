# TASK-020 — Màn hình thiết kế quy trình (SCR-06)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không (giao diện; kiểm tra thật do backend)

## 1. Mục tiêu
Quản trị viên tạo template quy trình cho từng loại vụ việc, chọn chế độ Khung cứng/Linh hoạt, soạn stage–task–phụ thuộc trên bản nháp, phát hành phiên bản; khai báo trường động và ngày nghỉ lễ. Backend làm sau (TSK-06) → test dùng `fetch` giả lập theo hợp đồng.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` **§3.3a** (hợp đồng màn hình này), §1.2, §1.3 (mã `ACTIVE_TEMPLATE_EXISTS`, `DRAFT_VERSION_EXISTS`, `VERSION_NOT_DRAFT`, `DEPENDENCY_CYCLE`, `INVALID_DEPENDENCY`)
- `docs/14-decisions.md` DEC-07; `docs/03-screens-and-ui.md` dòng SCR-06 và 4 trạng thái UI
- Giao diện mẫu: `prototype/workflows/index.html`, `create.html`, `edit.html`, `detail.html`
- Code có sẵn: `frontend/src/lib/api-client.ts`, `frontend/src/components/ui/`, cách làm ở `frontend/src/app/(dashboard)/admin/users/`

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `frontend/src/app/(dashboard)/admin/workflows/`
- `frontend/src/app/(dashboard)/admin/holidays/`
- `frontend/src/components/workflow/`
- `frontend/src/hooks/use-workflows.ts`, `frontend/src/types/workflow.ts`, `frontend/src/lib/workflow-graph.ts`

**Người viết test:** `frontend/tests/workflow/` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; các file khác của `frontend/src`; `backend/`, `docs/`, `prototype/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- `lib/workflow-graph.ts` (hàm thuần, dùng chung cho kiểm phía client): `findCycle(stages) → string[] | null` (danh sách `key` của một chu trình), `findForwardDependency(stages) → {task, dependsOn} | null` (task phụ thuộc task ở stage sau), `validateDraft(stages) → {field, message}[]` theo đủ các luật `PUT` ở §3.3a.
- **Danh sách** `admin/workflows/page.tsx`: theo loại vụ việc, huy hiệu chế độ (Khung cứng / Linh hoạt), số phiên bản phát hành, có bản nháp hay không; tạo template (chọn loại vụ việc, tên, chế độ) — `ACTIVE_TEMPLATE_EXISTS` hiện lỗi rõ.
- **Trình soạn** `admin/workflows/[id]/page.tsx`: hiện bản nháp nếu có, không thì bản phát hành (chỉ đọc) kèm nút "Tạo phiên bản mới". Thêm/xoá/sắp xếp stage (nút lên/xuống), thêm/xoá task trong stage, sửa các trường task theo §3.3a, chọn phụ thuộc (chỉ liệt kê task ở stage hiện tại hoặc trước). `key` sinh ổn định khi thêm (vd `s3`, `t7`). Lưu = `PUT` toàn bộ cây; lỗi `details.fields` gắn vào đúng ô.
- **Phát hành:** chạy `validateDraft` + `findCycle` + `findForwardDependency` trước; có lỗi thì hiện danh sách lỗi và không gọi API; hộp xác nhận nói rõ "vụ việc đang chạy giữ phiên bản cũ". Server trả `DEPENDENCY_CYCLE` → tô đỏ các task trong `details.cycle`.
- Chế độ: đổi Khung cứng ↔ Linh hoạt có hộp xác nhận "chỉ áp cho vụ việc tạo sau lần phát hành kế tiếp".
- **Trường động** (thẻ trong trình soạn, gọi `PUT /workflows/matter-types/{id}/custom-fields`): thêm/sửa/xoá trường; `key` snake_case duy nhất; `select` bắt buộc ≥ 1 lựa chọn.
- **Ngày nghỉ** `admin/holidays/page.tsx`: chọn năm, thêm/xoá ngày (ngày + tên), không trùng ngày, lưu bằng `PUT /settings/holidays`.
- `MANAGER`: xem được mọi thứ ở chế độ chỉ đọc. Vai trò khác → ErrorState "Không có quyền truy cập". Đủ Empty/Skeleton/Success/Validation error.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test)
- [ ] `verify.sh`: `npm --prefix frontend install`, `lint`, `typecheck`, `test`, `build` exit 0; test cũ vẫn xanh.
- [ ] `findCycle`: không chu trình → `null`; chu trình 2 và 3 task → đúng các `key`; tự phụ thuộc bị `validateDraft` bắt. `findForwardDependency` bắt phụ thuộc sang stage sau. `validateDraft` bắt đủ: `order_index` không liên tục, `key` trùng, SLA ≤ 0, trọng số ngoài 1–4, `depends_on` trỏ `key` lạ, `triggers_milestone_order` trùng.
- [ ] Lưu gửi đúng cây §3.3a (đúng `key`, `depends_on`, thứ tự); `details.fields` từ 422 hiện ở đúng ô.
- [ ] Phát hành: lỗi phía client → không gọi API; `DEPENDENCY_CYCLE` từ server tô đúng task; thành công tải lại phiên bản.
- [ ] Bản phát hành chỉ đọc; "Tạo phiên bản mới" gọi đúng endpoint; `DRAFT_VERSION_EXISTS` hiện thông báo.
- [ ] Danh sách phụ thuộc chỉ gồm task ở stage hiện tại hoặc trước.
- [ ] Trường động: `key` không snake_case/trùng bị chặn; `select` thiếu lựa chọn bị chặn. Ngày nghỉ: trùng ngày bị chặn, gửi đúng body.
- [ ] MANAGER chỉ đọc (không có nút ghi); ATTORNEY → ErrorState. Không `localStorage`; không chuỗi `SCR-`/`TSK-`.

## 6. Ràng buộc & bẫy cần tránh
- Không sửa file ngoài mục 3; cần đổi menu/api-client → ghi `report.md` mục câu hỏi.
- Không thêm thư viện kéo-thả; dùng nút lên/xuống.
- Chạy test chỉ qua `python3 scripts/handoff.py verify TASK-020` hoặc `npm --prefix frontend run test`. Ghi file bằng công cụ ghi file (tự tạo thư mục cha) — `mkdir`, `npx`, `|`, `xargs` bị từ chối.
