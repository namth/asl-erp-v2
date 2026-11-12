# TASK-045 — Backend tài liệu vụ việc (TSK-20, SCR-17)

> Người giao: Claude (Trưởng phòng) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (phân quyền need-to-know, mã hoá tệp, quét virus)

## 1. Mục tiêu
Giao diện Tài liệu vụ việc (`frontend/src/hooks/use-documents.ts`) đã có, backend chưa có. Viết 6 endpoint đúng `docs/07-api-contracts.md` §3.8: liệt kê, tải lên, lịch sử phiên bản, thêm phiên bản, tải xuống, lưu trữ. Bảng `documents`, `document_versions` đã có (`backend/alembic/versions/001_initial_schema.sql` mục 26–27) — **không cần migration**.

## 2. Tài liệu bắt buộc đọc
- `docs/07-api-contracts.md` §3.8 và bảng mã lỗi §1 (`FILE_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE`, `FILE_NOT_AVAILABLE`, `FOLDER_NOT_ALLOWED`, `DOCUMENT_ARCHIVED`, `LEGACY_CASE_READ_ONLY`)
- `docs/13-test-cases-and-qa.md` TC-DOC-01 → 04; `docs/10-env-and-security.md` mục "LƯU TRỮ VĂN BẢN & MÃ HÓA (NAS)"
- Mẫu: `backend/app/api/case_finance.py` (guard `verify_need_to_know`), `backend/app/guards/access_policy.py` (phạm vi `professional`/`finance`), `backend/app/services/audit.py` (`log_audit_event`), `backend/app/core/crypto.py`, `backend/app/services/case_tasks.py` (cách báo `LEGACY_CASE_READ_ONLY`)
- Test hợp đồng: `backend/tests/test_documents.py` (đọc docstring đầu file — có các quyết định bổ sung)

## 3. Phạm vi file
**Được tạo/sửa:**
- `backend/app/api/documents.py` (router mới)
- `backend/app/services/documents.py` (nghiệp vụ, truy vấn)
- `backend/app/services/file_vault.py` (mã hoá/giải mã tệp, đọc/ghi NAS)
- `backend/app/services/virus_scan.py` (client clamd INSTREAM)
- `backend/app/services/file_types.py` (nhận diện định dạng theo nội dung)
- `backend/app/core/config.py` — chỉ thêm 5 thiết lập: `NAS_STORAGE_MOUNT_PATH` (mặc định `./.storage/documents`), `FILE_ENCRYPTION_MASTER_KEY` (bắt buộc ngoài development/test, giống cách xử lý `DATA_ENCRYPTION_MASTER_KEY`), `CLAMAV_HOST`, `CLAMAV_PORT` (int), `MAX_UPLOAD_SIZE_MB` (int, mặc định 50)
- `backend/app/main.py` — chỉ thêm import + `include_router`
- `backend/requirements.txt` — thêm `python-multipart` (đã cài sẵn trong `.venv`)
- `.env.example` — thêm các biến trên với giá trị giả (nếu chưa có)

**Test (đã viết, đã khoá):** `backend/tests/test_documents.py`, `verify.sh`.
**Không được sửa:** file trong `tests.lock`, `docs/`, `frontend/`, migration, `backend/app/guards/`.

## 4. Blueprint
- **Phân quyền** (mỗi endpoint; endpoint theo `documents/{id}` tra `case_id` từ tài liệu, không có → 404):
  1. `verify_need_to_know(user, case, "professional")` đạt → mọi thư mục, `can_upload = true`.
  2. Không đạt `professional` nhưng đạt `"finance"` → chỉ `LEGAL_CONTRACTS`, chỉ đọc (liệt kê, xem phiên bản, tải xuống). Thư mục khác, hoặc ghi (tải lên, thêm phiên bản, lưu trữ) → `403 FOLDER_NOT_ALLOWED`.
  3. Không đạt cả hai → `403 NEED_TO_KNOW_DENIED` (để guard ném như các router khác).
  - `meta` danh sách: `allowed_folders` theo đúng thứ tự `LEGAL_CONTRACTS, CLIENT_SUBMISSIONS, OFFICIAL_FILINGS, INTERNAL_DRAFTS` (hoặc chỉ `["LEGAL_CONTRACTS"]`), `can_upload`.
- **Tải lên / thêm phiên bản:** đọc theo khối, quá `MAX_UPLOAD_SIZE_MB` MB → 413 ngay, không ghi gì. Nhận diện theo byte đầu (bỏ qua đuôi tệp và content-type client gửi): `%PDF-` → `application/pdf`; `\x89PNG\r\n\x1a\n` → `image/png`; `\xff\xd8\xff` → `image/jpeg`; ZIP có `[Content_Types].xml` và mục `word/` → DOCX, `xl/` → XLSX (MIME OpenXML chuẩn). Khác → 415. Kiểm vào (`title` 1–255, `folder` thuộc 4 giá trị, `task_id` thuộc vụ việc) → 422 `VALIDATION_ERROR`; vụ `is_legacy` → 409. Tất cả kiểm **trước** khi ghi DB/NAS.
- **Mã hoá envelope:** mỗi phiên bản sinh khoá dữ liệu 32 byte ngẫu nhiên (DEK); mã hoá tệp AES-256-GCM bằng DEK; DEK được bọc bằng AES-256-GCM với khoá chủ `FILE_ENCRYPTION_MASTER_KEY` (base64, 32 byte). Ghi một tệp nhị phân: `b"ASLV1" + nonce_bọc(12) + DEK_bọc(48) + nonce(12) + bản_mã`. Đường dẫn `<NAS>/<case_id>/<document_id>/<version_id>.bin`; `storage_path` lưu đường tương đối. Không bao giờ ghi bản rõ ra đĩa (kể cả tệp tạm). `sha256` = băm bản rõ.
- **Quét virus:** tạo `document_versions` `scan_status = 'PENDING'`, trả 201, rồi chạy quét bằng `BackgroundTasks` của FastAPI: giải mã → gửi `zINSTREAM\0` + khối `[4 byte độ dài big-endian][dữ liệu]` + `\0\0\0\0` tới `CLAMAV_HOST:CLAMAV_PORT` (timeout ~10s) → phản hồi chứa `FOUND` → `INFECTED`, kết thúc `OK` → `CLEAN`. Lỗi kết nối/timeout → giữ `PENDING`, ghi log. Hàm quét viết thuần để sau gắn Celery được.
- **Phiên bản:** `version_no = max + 1` trong cùng transaction (khoá hàng `documents` `FOR UPDATE`), cập nhật `current_version_id`, `updated_at`. Tài liệu đã lưu trữ → 409 `DOCUMENT_ARCHIVED`.
- **Tải xuống:** phiên bản phải thuộc tài liệu (không thì 404); `scan_status != 'CLEAN'` → 409 `FILE_NOT_AVAILABLE`; trả `Response` bản rõ, `media_type = mime_type`, `Content-Disposition: attachment; filename*=UTF-8''<urllib.parse.quote(original_filename)>`.
- **Lưu trữ:** body `{reason}` 1–500 ký tự → `is_archived = true`. Không xoá hàng/tệp.
- **Audit** (`entity_name='documents'`, `entity_id` = id tài liệu, `actor_id` = người dùng): `DOCUMENT_UPLOADED`, `DOCUMENT_VERSION_UPLOADED`, `DOCUMENT_DOWNLOADED` (mỗi lượt tải), `DOCUMENT_ARCHIVED` (kèm `reason` trong `after_state`).
- Phản hồi phần tử theo mẫu JSON §3.8 (`task` = `{id,title}` hoặc `null`; `uploaded_by` = `{id,name}`; `uploaded_at` = `created_at` của phiên bản). POST trả `201 {"success": true, "data": <tài liệu>}`; versions trả `data` là mảng.

## 5. Tiêu chí nghiệm thu (đo được)
- `bash handoff/tasks/TASK-045-documents-backend/verify.sh` xanh (test mới + test không gian vụ việc + test chống hook).
- Không tệp nào dưới `NAS_STORAGE_MOUNT_PATH` chứa bản rõ.

## 6. Bẫy cần tránh
- Không tin đuôi tệp/content-type; không coi "không quét được" là sạch; không trả lỗi lộ đường dẫn NAS.
- Không UPDATE/DELETE `audit_logs`; không DDL trong code app; không gán đè hàm/biến môi trường lúc chạy.
- Không ghép giá trị vào chuỗi SQL. Không nạp cả tệp > giới hạn vào bộ nhớ trước khi kiểm cỡ.
- Không sửa test; không `python3 -c` nhiều dòng; không `rm`/`&&`/`git`/`sed`/`cat`/`grep`. File tạm để ở `handoff/tasks/TASK-045-documents-backend/scratch/`.
