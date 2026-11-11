# TASK-030 — Tài liệu vụ việc (SCR-17)

> Người giao: Claude (Trưởng phòng / Giám đốc sản phẩm) · Người thực hiện: Antigravity
> **Độ khó:** LOW · **Nhạy cảm:** không (giao diện; phạm vi, quét virus, mã hoá do backend làm)

## 1. Mục tiêu
Tab Tài liệu trong không gian vụ việc: 4 thư mục cố định, danh sách tài liệu, tải lên, tải phiên bản mới, xem lịch sử phiên bản, tải xuống, lưu trữ (không xoá). Backend làm sau → test dùng `fetch` giả lập.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` **§3.8** (toàn bộ), §1.3 (mã lỗi `FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`, `FILE_NOT_AVAILABLE`, `FOLDER_NOT_ALLOWED`, `DOCUMENT_ARCHIVED`, `LEGACY_CASE_READ_ONLY`)
- `docs/02-modules-and-features.md` Phân hệ 9; `docs/03-screens-and-ui.md` dòng SCR-17 và 4 trạng thái UI; `docs/13-test-cases-and-qa.md` §2.7
- Giao diện mẫu: `prototype/documents/index.html`, `detail.html`, `create.html`
- Code có sẵn: `frontend/src/lib/api-client.ts`, `frontend/src/lib/format.ts`, `frontend/src/components/ui/`, layout vụ việc `frontend/src/app/(dashboard)/cases/[id]/layout.tsx` (đã có tab Tài liệu trỏ `/cases/{id}/documents` — không sửa)

## 3. Phạm vi file
**Được tạo/sửa (người code):**
- `frontend/src/app/(dashboard)/cases/[id]/documents/`
- `frontend/src/components/documents/`
- `frontend/src/hooks/use-documents.ts`, `frontend/src/types/documents.ts`, `frontend/src/lib/file-rules.ts`

**Người viết test:** `frontend/tests/documents/` và `verify.sh` của task.

**Không được sửa:** mọi file trong `tests.lock`; các file khác của `frontend/src` (kể cả `api-client.ts`, layout vụ việc); `backend/`, `docs/`, `prototype/`.

## 4. Đặc tả chi tiết (chỉ phần docs chưa có)
- `lib/file-rules.ts` (hàm thuần): `MAX_FILE_BYTES = 52428800`; `checkFile({ name, size, type }) → { ok: true } | { ok: false, code: 'FILE_TYPE_NOT_ALLOWED' | 'FILE_TOO_LARGE' }` — nhận đuôi `.pdf .docx .xlsx .jpg .jpeg .png` (không phân biệt hoa thường) **và** MIME tương ứng (`application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `image/jpeg`, `image/png`); đúng 50 MB vẫn nhận, hơn 1 byte bị chặn. `formatBytes(n)` → `"471 KB"`, `"1,2 MB"` (dấu phẩy thập phân kiểu Việt). Kiểm ở client chỉ để báo sớm — server vẫn là nơi quyết định.
- `page.tsx`: cột trái 4 thư mục (nhãn tiếng Việt theo §3.8, số tài liệu mỗi thư mục), chỉ hiện thư mục có trong `meta.allowed_folders`; mặc định chọn thư mục đầu tiên được phép; đổi thư mục gửi `?folder=`. Bảng: tiêu đề, task gắn kèm, phiên bản `v{n}`, tên tệp, dung lượng, người tải, thời điểm, trạng thái quét (`PENDING` "Đang quét", `CLEAN` không huy hiệu, `INFECTED` đỏ "Nhiễm virus"). Công tắc "Hiện tài liệu đã lưu trữ" → `include_archived=true`, dòng lưu trữ mờ + huy hiệu "Đã lưu trữ".
- Tải lên (chỉ khi `meta.can_upload`): hộp thoại chọn thư mục (trong `allowed_folders`), tiêu đề bắt buộc 1–255, gắn task tuỳ chọn (danh sách từ `GET /cases/{id}/tasks`), chọn tệp; `checkFile` sai → chặn và báo; gửi `FormData` (không đặt `Content-Type` thủ công); lỗi server `FILE_TYPE_NOT_ALLOWED`/`FILE_TOO_LARGE` hiện dưới ô tệp, `FOLDER_NOT_ALLOWED`/`LEGACY_CASE_READ_ONLY` hiện thông báo; thành công → làm mới danh sách, dòng mới hiện "Đang quét".
- Ngăn chi tiết tài liệu: lịch sử phiên bản (`GET /documents/{id}/versions`, mới nhất trước), nút "Tải phiên bản mới" (ẩn khi lưu trữ hoặc không `can_upload`; `DOCUMENT_ARCHIVED` → thông báo), nút "Tải xuống" từng phiên bản — chỉ bật khi `scan_status = CLEAN`, gọi `…/download` bằng `fetch` (gửi cookie), lấy `Blob` và tên tệp từ `Content-Disposition` (`filename*=UTF-8''` ưu tiên), tạo link tạm `URL.createObjectURL` rồi thu hồi; `409 FILE_NOT_AVAILABLE` → "Tệp chưa sẵn sàng để tải". "Lưu trữ" (chỉ `can_upload`): hộp thoại lý do bắt buộc 1–500 → `POST …/archive`.
- Đủ Empty ("Chưa có tài liệu trong thư mục này") / Skeleton / Success / ErrorState; `403 NEED_TO_KNOW_DENIED` → ErrorState "Không có quyền truy cập".

## 5. Tiêu chí nghiệm thu (đầu vào để viết test)
- [ ] `verify.sh`: `npm --prefix frontend install`, `lint`, `typecheck`, `test`, `build` exit 0; test cũ vẫn xanh.
- [ ] `checkFile`: đuôi `.exe`, đuôi `.pdf` nhưng MIME `application/x-msdownload`, 50 MB + 1 byte → chặn đúng mã; `.PDF` hoa, đúng 50 MB → nhận. `formatBytes` đúng.
- [ ] Chỉ hiện thư mục trong `allowed_folders` (Kế toán chỉ thấy Hợp đồng dịch vụ, không có nút tải lên/lưu trữ); đổi thư mục gửi đúng `folder`; công tắc lưu trữ gửi `include_archived=true`.
- [ ] Tải lên: thiếu tiêu đề/tệp sai bị chặn, không gọi API; gửi `FormData` đúng trường (`folder`, `title`, `task_id`, `file`); lỗi server hiện đúng chỗ; thành công làm mới danh sách.
- [ ] Phiên bản: lịch sử mới nhất trước; tải phiên bản mới gửi đúng URL; nút tải xuống tắt khi `PENDING`/`INFECTED`; tải xuống dùng tên tệp từ `Content-Disposition`; `409` đúng thông điệp.
- [ ] Lưu trữ thiếu lý do bị chặn; gửi đúng body; xong làm mới.
- [ ] Không `localStorage`; không chuỗi `SCR-`/`TSK-`; không emoji trong nút.

## 6. Ràng buộc & bẫy cần tránh
- Không thêm thư viện upload. Không mở tệp bằng `window.open(url)` (cần cookie + xử lý 409).
- Chạy test qua `python3 scripts/handoff.py verify TASK-030` hoặc `npm --prefix frontend run test`. Ghi file bằng công cụ ghi file (tự tạo thư mục cha); `mkdir`, `;`, `||`, `|`, `xargs` bị từ chối.
- **Người viết test:** không tạo `declarations.d.ts` khai báo module của code sản phẩm (để typecheck đỏ đúng lúc chưa có code là chấp nhận được — kiểm đỏ bằng `vitest`).
