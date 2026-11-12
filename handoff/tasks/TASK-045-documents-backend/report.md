# Báo cáo TASK-045

## Đã làm
- Hiện thực hoá 6 endpoint REST API cho phân hệ Tài liệu vụ việc (SCR-17, TSK-20) theo đúng hợp đồng `docs/07-api-contracts.md` §3.8:
  1. `GET /api/v1/cases/{id}/documents`: Liệt kê tài liệu theo thư mục (`folder`), hỗ trợ lọc tài liệu đã lưu trữ (`include_archived`), trả về `meta.allowed_folders` và `meta.can_upload` chuẩn phân quyền.
  2. `POST /api/v1/cases/{id}/documents`: Tải lên tài liệu lần đầu dạng multipart/form-data (`folder`, `title`, `task_id`, `file`), sinh phiên bản 1 với `scan_status = 'PENDING'`, ghi nhận audit `DOCUMENT_UPLOADED`.
  3. `GET /api/v1/documents/{id}/versions`: Trả về toàn bộ lịch sử phiên bản của tài liệu, sắp xếp mới nhất trước (`version_no DESC`).
  4. `POST /api/v1/documents/{id}/versions`: Thêm phiên bản mới cho tài liệu (khoá hàng `documents FOR UPDATE`, tự tăng `version_no`, cập nhật `current_version_id`, ghi nhận audit `DOCUMENT_VERSION_UPLOADED`).
  5. `GET /api/v1/documents/{id}/versions/{vid}/download`: Giải mã AES-256-GCM từ NAS trong bộ nhớ, kiểm tra `scan_status == 'CLEAN'`, trả tệp đính kèm với `Content-Disposition: attachment; filename*=UTF-8''...`, ghi nhận audit `DOCUMENT_DOWNLOADED` mỗi lượt tải.
  6. `POST /api/v1/documents/{id}/archive`: Lưu trữ mềm tài liệu với lý do `reason` (1–500 ký tự), đánh dấu `is_archived = true`, chặn thêm phiên bản mới, ghi nhận audit `DOCUMENT_ARCHIVED`.
- Phân quyền Need-to-know đa tầng:
  * Phạm vi `professional`: toàn quyền xem mọi thư mục và tải lên / thêm phiên bản (`can_upload = true`).
  * Phạm vi `finance` (Kế toán): chỉ xem và tải tệp trong thư mục `LEGAL_CONTRACTS` (`meta.can_upload = false`), từ chối thao tác ghi hoặc truy cập thư mục khác bằng mã `403 FOLDER_NOT_ALLOWED`.
  * Không thuộc cả hai phạm vi (luật sư ngoài vụ, admin): từ chối bằng `403 NEED_TO_KNOW_DENIED` và ghi log audit `ACCESS_DENIED`.
  * Không có token: từ chối `401 UNAUTHENTICATED`.
- Nhận diện định dạng tệp chuẩn xác theo nội dung nhị phân (bỏ qua phần mở rộng và mime do client gửi):
  * Nhận diện magic bytes: PDF (`%PDF-`), PNG (`\x89PNG\r\n\x1a\n`), JPEG (`\xff\xd8\xff`).
  * Kiểm tra cấu trúc ZIP chứa `[Content_Types].xml` kết hợp tiền tố `word/` cho DOCX và `xl/` cho XLSX. Các tệp khác trả về `415 FILE_TYPE_NOT_ALLOWED`.
- Kiểm soát kích cỡ tệp tải lên:
  * Đọc theo khối (chunked stream), ngắt ngay lập tức khi kích thước vượt quá `MAX_UPLOAD_SIZE_MB` (50MB) và trả về `413 FILE_TOO_LARGE` mà không ghi dữ liệu ra đĩa hay DB.
- Mã hoá dữ liệu theo mô hình phong bì (Envelope Encryption):
  * Mỗi phiên bản tệp sinh khoá DEK 32 bytes ngẫu nhiên.
  * Tệp được mã hoá bằng DEK qua thuật toán AES-256-GCM.
  * DEK được bọc bằng khoá chủ `FILE_ENCRYPTION_MASTER_KEY` (AES-256-GCM).
  * Định dạng tệp nhị phân trên NAS: `b"ASLV1" + nonce_bọc(12) + DEK_bọc(48) + nonce(12) + bản_mã`. Không lưu bản rõ ra đĩa dưới bất kỳ hình thức nào.
- Quét virus bất đồng bộ với ClamAV:
  * Client clamd kết nối `CLAMAV_HOST:CLAMAV_PORT` (timeout 10s) bằng lệnh `zINSTREAM\0`.
  * Tự động cập nhật `scan_status` sang `CLEAN` hoặc `INFECTED`. Nếu mất kết nối hoặc timeout thì giữ `PENDING` và ghi log, không tự tiện coi là sạch.
  * Ngăn chặn tải xuống khi tệp chưa quét sạch (`409 FILE_NOT_AVAILABLE`).
- Ràng buộc nghiệp vụ và kiểm tra biên:
  * Kiểm tra vụ việc lịch sử (`is_legacy = true`) -> `409 LEGACY_CASE_READ_ONLY`.
  * Kiểm tra `task_id` phải thuộc vụ việc -> `422 VALIDATION_ERROR`.
  * Kiểm tra độ dài `title` (1–255) và `reason` (1–500) -> `422 VALIDATION_ERROR`.

## File đã tạo/sửa
- `backend/app/api/documents.py`: Router FastAPI mới định nghĩa 6 endpoint tài liệu và xác thực phân quyền / tham số đầu vào.
- `backend/app/services/documents.py`: Nghiệp vụ tài liệu, truy vấn dữ liệu PostgreSQL, phân quyền Need-to-know, ghi chép audit logs.
- `backend/app/services/file_vault.py`: Cơ chế mã hoá/giải mã phong bì (envelope encryption) AES-256-GCM, đọc/ghi tệp nhị phân trên NAS.
- `backend/app/services/virus_scan.py`: Client giao thức clamd INSTREAM kết nối ClamAV, background task quét virus tự động.
- `backend/app/services/file_types.py`: Module nhận diện định dạng tệp qua nội dung nhị phân và cấu trúc OpenXML.
- `backend/app/core/config.py`: Bổ sung 5 cấu hình hệ thống: `NAS_STORAGE_MOUNT_PATH`, `FILE_ENCRYPTION_MASTER_KEY`, `CLAMAV_HOST`, `CLAMAV_PORT`, `MAX_UPLOAD_SIZE_MB`.
- `backend/app/main.py`: Đăng ký `documents_router` vào ứng dụng FastAPI với tiền tố `/api/v1`.
- `backend/requirements.txt`: Bổ sung dependency `python-multipart`.
- `.env.example`: Thêm các biến môi trường mẫu cho NAS và ClamAV.

## Kết quả tự kiểm
```
$ bash handoff/tasks/TASK-045-documents-backend/verify.sh
...........................                                              [100%]
27 passed in 1082.52s (0:18:02)

KẾT QUẢ: khoá test OK, verify.sh exit 0
```

## Điểm lệch / câu hỏi cho trưởng phòng
Không. Mọi tiêu chuẩn hợp đồng API và kiểm thử đều được tuân thủ nghiêm ngặt.
