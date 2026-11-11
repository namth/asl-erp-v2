# TASK-012 — Màn hình CRM frontend: khách hàng & pipeline cơ hội (SCR-03, 04, 05)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không

## 1. Mục tiêu
Dựng 3 màn hình CRM trên khung `frontend/` đã có (TASK-009), gọi API đúng hợp đồng. Backend CRM chưa có (M2) → test dùng `fetch` giả lập theo hợp đồng.

## 2. Tài liệu bắt buộc đọc
- `docs/03-screens-and-ui.md` dòng SCR-03, SCR-04, SCR-05 và mục 4 trạng thái UI
- `docs/07-api-contracts.md` §1.2 (phong bì, `meta` phân trang), §1.3, §2 (dòng Khách hàng, Cơ hội), §3.3
- `docs/06-database-schema.md` bảng `clients`, `opportunities`; `docs/12-business-rules.md` §1.1 (máy trạng thái cơ hội)
- `docs/14-decisions.md` DEC-01 (người mang khách về), DEC-04 (Kế toán chỉ xem)
- Giao diện mẫu: `prototype/crm/customers.html`, `prototype/crm/detail.html`, `prototype/crm/index.html`, `prototype/crm/create-lead.html`
- Code có sẵn: `frontend/src/lib/api-client.ts`, `frontend/src/hooks/use-auth.ts`, `frontend/src/components/ui/`

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `frontend/src/app/(dashboard)/crm/`
- `frontend/src/components/crm/`
- `frontend/src/hooks/use-crm.ts`, `frontend/src/types/crm.ts`, `frontend/src/lib/format.ts`

**Người viết test:** `frontend/tests/crm/` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; các file khác của `frontend/src` (api-client, layout, menu…); `backend/`, `docs/`, `prototype/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- Kiểu dữ liệu trong `types/crm.ts` theo bảng `clients`/`opportunities`; tiền tệ là **chuỗi** (`"150000000"`), hiển thị qua `lib/format.ts` `formatVnd("150000000") → "150.000.000 ₫"` — không đổi sang `number` để tính.
- `hooks/use-crm.ts` (TanStack Query): `useClients({ q, category_group, page })` → `GET /crm/clients?q=&category_group=&page=&limit=20` (đọc `meta`); `useClient(id)`; `useCreateClient()` → `POST /crm/clients`; `useOpportunities()` → `GET /crm/opportunities`; `useUpdateOpportunityStage()` → `PATCH /crm/opportunities/{id}` `{stage, lost_reason?}`; `useConvertOpportunity()` → `POST /crm/opportunities/{id}/convert` kèm header `Idempotency-Key` (UUID sinh một lần cho mỗi lần mở hộp thoại, gửi lại đúng khoá khi thử lại).
- **SCR-03** `crm/clients/page.tsx`: bảng, tìm theo tên/MST (debounce 300 ms), lọc nhóm, phân trang theo `meta`; form tạo mới: `ENTERPRISE` bắt buộc MST 10 hoặc 13 số, `INDIVIDUAL` nhập `identity_no` thay MST; `409 DUPLICATE_TAX_CODE`/`DUPLICATE_IDENTITY_NO` hiện lỗi ngay dưới ô; `201` có `warnings` `CONFLICT_OF_INTEREST` → hiện cảnh báo vàng liệt kê `case_codes` (không chặn). Vai trò `ACCOUNTANT`: không có nút tạo/sửa.
- **SCR-04** `crm/clients/[id]/page.tsx`: thông tin liên hệ, `identity_no` chỉ hiện dạng che như API trả về, danh sách vụ việc từ dữ liệu trả về (không tự lọc thêm).
- **SCR-05** `crm/opportunities/page.tsx`: kanban 5 cột theo `stage`; chỉ cho chuyển theo đúng máy trạng thái §1.1 (vd không kéo `NEW_LEAD` → `WON`); sang `LOST` bắt buộc nhập lý do; nút "Chuyển thành vụ việc" chỉ bật ở `WON`; hộp thoại chuyển đổi kiểm tổng `milestones.amount` ≤ `contract_value` trước khi gửi; lỗi `MILESTONES_EXCEED_CONTRACT`, `OPPORTUNITY_ALREADY_CONVERTED`, `NO_PUBLISHED_TEMPLATE` hiện thông điệp tiếng Việt; thành công hiện `case_code` và chuyển tới `/cases/{case_id}`.
- Mỗi màn hình đủ 4 trạng thái: Empty, Skeleton loading, Success, Validation error/ErrorState — dùng `components/ui/` có sẵn.

## 5. Tiêu chí nghiệm thu (đầu vào để viết test)
- [ ] `verify.sh`: `npm --prefix frontend install`, `lint`, `typecheck`, `test`, `build` đều exit 0; toàn bộ test cũ của `frontend/tests` vẫn xanh.
- [ ] `formatVnd` đúng với chuỗi lớn (`"123456789012"`), `"0"`, số lẻ `"1500.50"`; không dùng `parseFloat`/`Number(` cho tiền trong `frontend/src/**/crm*` và `lib/format.ts`.
- [ ] SCR-03: tìm kiếm gửi đúng query sau debounce; phân trang theo `meta`; MST sai độ dài → lỗi, không gọi API; 409 hiện dưới ô; `warnings` hiện cảnh báo; ACCOUNTANT không thấy nút tạo.
- [ ] SCR-04: hiển thị `identity_no` che; Empty khi không có vụ việc.
- [ ] SCR-05: chuyển giai đoạn trái máy trạng thái bị chặn ở client; `LOST` thiếu lý do bị chặn; nút chuyển đổi chỉ bật ở `WON`; tổng đợt > giá trị hợp đồng bị chặn; thử lại sau lỗi mạng gửi **cùng** `Idempotency-Key`; thành công điều hướng `/cases/{case_id}`.
- [ ] Mỗi trang có Empty + Skeleton + Error.

## 6. Ràng buộc & bẫy cần tránh
- Không sửa file ngoài mục 3; cần đổi `api-client`/menu → ghi `report.md` mục câu hỏi.
- Không lưu dữ liệu khách hàng vào `localStorage`. Không mã đặc tả (`SCR-`, `TSK-`) trong text hiển thị; không emoji trong nút/nhãn.
- Chạy test chỉ qua `python3 scripts/handoff.py verify TASK-012`. Mọi file tạm/ghi chú ghi **trong** thư mục dự án (ghi ra ngoài bị từ chối quyền); không dùng lệnh có `|`/`xargs`.
