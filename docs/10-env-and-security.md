# 10. BIẾN MÔI TRƯỜNG & CHÍNH SÁCH BẢO MẬT (ENV & SECURITY)

## 1. DANH SÁCH BIẾN MÔI TRƯỜNG MẪU (.ENV.EXAMPLE)

### 1.1. Cấu hình Backend (FastAPI Core)
```bash
# --- CẤU HÌNH DỊCH VỤ CHUNG ---
ENVIRONMENT=production
DEBUG=False
APP_NAME="ASL LAW Enterprise ERP"
SECRET_KEY=generate_a_minimum_64_char_cryptographically_secure_random_key_here
API_V1_STR="/api/v1"
CORS_ORIGINS=["https://erp.asllaw.vn", "https://localhost:3000"]

# --- POSTGRESQL TRANSACTIONAL DATABASE ---
POSTGRES_SERVER=postgres
POSTGRES_PORT=5432
POSTGRES_DB=asl_erp_prod
# Ứng dụng chạy bằng asl_app (chỉ INSERT/SELECT trên bảng bất biến); Alembic chạy bằng asl_owner
POSTGRES_USER=asl_app
POSTGRES_MIGRATION_USER=asl_owner
POSTGRES_PASSWORD=super_secure_postgres_password_here
DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_SERVER}:${POSTGRES_PORT}/${POSTGRES_DB}

# --- NEO4J GRAPH RBAC DATABASE ---
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=super_secure_neo4j_password_here

# --- REDIS CACHING & BROKER ---
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=super_secure_redis_password_here
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/0

# --- XÁC THỰC & PHIÊN LÀM VIỆC (JWT) ---
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
ALGORITHM=HS256

# --- TÍCH HỢP NGOẠI VI (OUTBOUND CHANNELS) ---
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
ZALO_OA_APP_ID=your_zalo_app_id
ZALO_OA_SECRET_KEY=your_zalo_secret_key
ZALO_OA_ACCESS_TOKEN=temporary_init_token

# --- TRÍ TUỆ NHÂN TẠO (AI ASSISTANT) ---
GEMINI_API_KEY=AIzaSyD-YourGoogleGeminiApiKeyHere
# hoặc OPENAI_API_KEY=sk-proj-YourOpenAIApiKeyHere
AI_MODEL_NAME="<tên model Gemini đang dùng>"
AI_PII_REDACTION=true            # DEC-03: bắt buộc true ở production

# --- LƯU TRỮ VĂN BẢN & MÃ HÓA (NAS) ---
NAS_STORAGE_MOUNT_PATH=/mnt/asl_nas/documents
FILE_ENCRYPTION_MASTER_KEY=32_bytes_base64_encoded_key_for_aes_256_gcm
MAX_UPLOAD_SIZE_MB=50
CLAMAV_HOST=clamav
CLAMAV_PORT=3310

# --- MÃ HOÁ DỮ LIỆU NHẠY CẢM (khoá thật chỉ nằm trên máy chủ, có bản sao niêm phong) ---
DATA_ENCRYPTION_MASTER_KEY=replace_with_32_byte_base64_key   # bọc khoá tệp, TOTP secret, CCCD
IDENTITY_HASH_PEPPER=replace_with_random_pepper             # HMAC chặn trùng CCCD

# --- XÁC THỰC 2 LỚP (DEC-02) ---
TOTP_ISSUER="ASL LAW ERP"
TOTP_REQUIRED_ROLES=ADMIN,MANAGER,ACCOUNTANT

# --- SAO LƯU (DEC-08) ---
BACKUP_NAS_PATH=/mnt/asl_nas/backups
BACKUP_ENCRYPTION_PUBLIC_KEY_PATH=/run/secrets/backup_pubkey.asc
BACKUP_RETENTION_DAILY=30
BACKUP_RETENTION_MONTHLY=12
```

### 1.2. Cấu hình Frontend (Next.js 15)
```bash
NEXT_PUBLIC_APP_ENV=production
NEXT_PUBLIC_API_BASE_URL=https://erp.asllaw.vn/api/v1
NEXT_PUBLIC_WS_URL=wss://erp.asllaw.vn/api/v1/ws
NEXT_PUBLIC_APP_TITLE="Hệ thống Quản trị Doanh nghiệp Luật ASL LAW"
```

---

## 2. CHÍNH SÁCH BẢO MẬT & QUẢN TRỊ TRUY CẬP (SECURITY POLICIES)

### 2.1. Kiểm soát Truy cập Nghiêm ngặt (Strict Need-to-Know Enforcement)
- **Cơ chế:** Mọi request đọc/ghi hồ sơ vụ việc đều bắt buộc chạy qua Middleware `verify_need_to_know()`.
- **Nguyên tắc:** guard nhận `(user, case_id, scope)` và áp bảng chính sách ở `06` §3.3: nội dung chuyên môn chỉ cho người được phân công (`:ASSIGNED_TO`), Trưởng phòng của phòng ban vụ việc (`:LEADS`) và Giám đốc (`is_executive`).
- **Phân tách trách nhiệm (Separation of Concerns):**
  - Kế toán chỉ có phạm vi `finance`/`progress`: đợt thu, số tiền, trạng thái MISA, thư mục Hợp đồng dịch vụ; bị chặn toàn bộ tài liệu chuyên môn.
  - Người mang khách về chỉ có phạm vi `progress` với vụ việc mình mang về (trừ khi được phân công).
  - Quản trị viên chỉ có `admin_meta`: quản trị hệ thống không đồng nghĩa đọc hồ sơ thân chủ.
- **Giao diện** ẩn hoàn toàn hành động ngoài quyền; nhưng backend là lớp chặn thật — không dựa vào việc ẩn nút.

### 2.2. Chính sách Mật khẩu & Xác thực Nội bộ (Authentication & Password Policy)
- **Thuật toán băm:** Sử dụng **Argon2id** (chuẩn OWASP khuyến nghị) với tham số bộ nhớ tối thiểu `m=65536, t=3, p=4`.
- **Độ phức tạp mật khẩu:** Tối thiểu 10 ký tự, bắt buộc bao gồm chữ hoa, chữ thường, chữ số và ít nhất một ký tự đặc biệt (`!@#$%^&*`).
- **Chống Brute-force:** Redis kiểm soát số lần đăng nhập sai (mật khẩu **và** mã 2FA). Nếu sai quá 5 lần trong vòng 15 phút, tài khoản bị tạm khóa 30 phút và gửi cảnh báo tới Quản trị viên. Giới hạn thêm theo IP để chống dò nhiều tài khoản.
- **Không SSO (DEC-02):** chỉ tài khoản nội bộ; không tích hợp Google/Microsoft.
- **Tài khoản chuyển từ hệ thống cũ (DEC-05):** băm WordPress không chuyển được sang Argon2id → `must_reset_password = TRUE`, mật khẩu tạm ngẫu nhiên, buộc đặt lại ở lần đăng nhập đầu.

### 2.2a. Xác thực 2 lớp TOTP (DEC-02)
- **Bắt buộc** với `ADMIN`, `MANAGER`, `ACCOUNTANT`; tuỳ chọn với `ATTORNEY`.
- Chuẩn RFC 6238 (6 số, bước 30 giây, chấp nhận lệch ±1 bước); bí mật TOTP mã hoá AES-256-GCM trong DB.
- Khi kích hoạt: cấp 10 mã khôi phục dùng một lần (lưu dạng băm).
- Mất thiết bị: Quản trị viên reset 2FA cho người dùng (bắt buộc ghi lý do, ghi audit `RESET_2FA`, thông báo cho chính người dùng); Quản trị viên không tự reset 2FA của chính mình — cần Quản trị viên khác.

### 2.3. Quản lý Phiên làm việc & Thu hồi Token Tức thì (Token Revocation via Redis)
- **Cặp Token:**
  - `access_token`: Hiệu lực ngắn (30 phút), lưu trong bộ nhớ hoặc HttpOnly Cookie có cờ `Secure`, `SameSite=Strict`.
  - `refresh_token`: Hiệu lực 7 ngày, chỉ dùng để cấp mới Access Token.
- **Xoay vòng refresh token:** mỗi lần `/auth/refresh` cấp refresh token mới và thu hồi token cũ; dùng lại token đã bị thay → thu hồi cả chuỗi (`refresh_tokens.family_id`) vì có dấu hiệu bị đánh cắp.
- **Chống CSRF:** cookie `SameSite=Strict` + header `X-CSRF-Token` khớp cookie `csrf_token` cho mọi request ghi.
- **Thu hồi mọi phiên của một người:** khoá tài khoản / đổi mật khẩu / reset 2FA đặt `users.tokens_valid_after = NOW()`; middleware từ chối mọi token có `iat` trước mốc này (cache trong Redis).
- **Thu hồi quyền tức thì (Immediate Revocation):** Khi nhân sự đăng xuất hoặc khi Admin khóa tài khoản/thu hồi quyền của một luật sư, `jti` (JWT ID) sẽ ngay lập tức được đẩy vào **Redis Blocklist** với thời gian TTL bằng đúng thời hạn còn lại của token. Middleware sẽ từ chối mọi request mang token nằm trong blocklist này mà không cần chờ token tự hết hạn.

### 2.4. Tính Bất biến của Nhật ký Kiểm toán (Immutable Audit Logs)
- Toàn bộ hành vi nhạy cảm: Đọc hồ sơ vụ việc, Tải tài liệu tranh tụng, Phê duyệt cổng, Xác nhận thu tiền MISA, Sửa tỷ lệ hoa hồng... đều được ghi nhận vào bảng `audit_logs` của PostgreSQL.
- **Ràng buộc cơ sở dữ liệu:** ứng dụng kết nối bằng `asl_app`, chỉ có `INSERT` và `SELECT` trên `audit_logs` (cũng như `misa_transactions`, `commission_transactions`). `asl_owner` chỉ dùng khi chạy migration. Thêm trigger `BEFORE UPDATE OR DELETE` ném lỗi để chặn cả khi lỡ cấp quyền. Không người dùng ứng dụng nào (kể cả Quản trị viên) xoá/sửa được log.
- **Chuỗi băm toàn vẹn:** mỗi dòng lưu `prev_hash` và `row_hash` (`06` §2.8); job hằng đêm kiểm tra chuỗi, đứt chuỗi → cảnh báo Quản trị viên và Giám đốc.
- **Không ghi bí mật vào log:** mật khẩu, bí mật TOTP, CCCD bản rõ, token không bao giờ xuất hiện trong `before_state`/`after_state` hay log ứng dụng.

### 2.5. Phòng chống Tấn công SSRF & Bảo vệ Hạ tầng On-Premise
- Do máy chủ On-Premise nằm trong mạng nội bộ văn phòng, các API Outbound (gửi Telegram, Zalo, LLM) được cô lập qua một HTTP Client chuyên dụng có danh sách tên miền được phép (Allowlist: `api.telegram.org`, `openapi.zalo.me`, `generativelanguage.googleapis.com`).
- Nghiêm cấm ứng dụng thực hiện các request tới các dải IP nội bộ riêng tư (như `127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`) để loại bỏ hoàn toàn rủi ro SSRF (Server-Side Request Forgery).

### 2.6. Tệp tải lên
- Danh sách trắng: PDF, DOCX, XLSX, JPG, PNG (kiểm tra cả phần mở rộng và magic bytes); tối đa 50 MB.
- Lưu vào vùng tạm → quét ClamAV → chỉ khi `CLEAN` mới chuyển vào kho mã hoá và cho tải xuống.
- Tên tệp gốc chỉ lưu làm metadata; đường dẫn lưu trữ do hệ thống sinh, không lộ qua API.
- Mọi lượt tải xuống ghi audit `DOWNLOAD_DOCUMENT`.

### 2.7. Mã hoá dữ liệu nhạy cảm khi lưu
- CCCD/hộ chiếu: mã hoá AES-256-GCM (`identity_no_enc`) + HMAC có pepper (`identity_no_hash`) để chặn trùng; API chỉ trả 4 số cuối.
- Bí mật TOTP và khoá tệp tài liệu: mã hoá bằng `DATA_ENCRYPTION_MASTER_KEY` (envelope encryption).
- Mất Master Key = mất dữ liệu: bản sao niêm phong do Giám đốc giữ, kiểm tra trong buổi diễn tập khôi phục hằng quý.

### 2.8. Tối thiểu hoá dữ liệu gửi ra dịch vụ ngoài (DEC-03)
- Telegram/Zalo/Email: chỉ mã vụ việc, tên task, hạn chót, deep-link (`08` §2.2).
- LLM cloud: che tên và định danh khách hàng bằng mã giả, không gửi nội dung tài liệu (`08` §4.2).
- Có test tự động kiểm tra mọi payload gửi ra ngoài không chứa tên khách hàng, MST/CCCD, số điện thoại, email.

### 2.9. Sao lưu & khôi phục (DEC-08)
Xem `05` §3.2: NAS hằng đêm, bản mã hoá off-site hằng tuần, diễn tập khôi phục hằng quý. Bản sao lưu được mã hoá bằng khoá công khai; khoá bí mật để giải mã không nằm trên máy chủ ERP.
