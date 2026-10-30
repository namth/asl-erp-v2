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
POSTGRES_USER=asl_admin
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
AI_MODEL_NAME="gemini-1.5-flash"

# --- LƯU TRỮ VĂN BẢN & MÃ HÓA (NAS) ---
NAS_STORAGE_MOUNT_PATH=/mnt/asl_nas/documents
FILE_ENCRYPTION_MASTER_KEY=32_bytes_base64_encoded_key_for_aes_256_gcm
MAX_UPLOAD_SIZE_MB=50
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
- **Nguyên tắc:** Nhân sự chỉ được xem các vụ việc mà mình có quan hệ gán vai trò (`:ASSIGNED_TO`) trên đồ thị Neo4j hoặc là Partner/Trưởng ban quản lý lĩnh vực đó (`:LEADS`).
- **Phân tách trách nhiệm (Separation of Concerns):**
  - Kế toán viên bị chặn toàn bộ quyền xem tài liệu chuyên môn, chỉ có quyền truy cập thông tin thanh toán (Milestones, Số tiền, Trạng thái MISA).
  - Nhân viên Sales bị chặn toàn bộ tài liệu vụ việc chuyên sâu sau khi Cơ hội đã chuyển đổi thành Case thành công.

### 2.2. Chính sách Mật khẩu & Xác thực Nội bộ (Authentication & Password Policy)
- **Thuật toán băm:** Sử dụng **Argon2id** (chuẩn OWASP khuyến nghị) với tham số bộ nhớ tối thiểu `m=65536, t=3, p=4`.
- **Độ phức tạp mật khẩu:** Tối thiểu 10 ký tự, bắt buộc bao gồm chữ hoa, chữ thường, chữ số và ít nhất một ký tự đặc biệt (`!@#$%^&*`).
- **Chống Brute-force:** Redis kiểm soát số lần đăng nhập sai. Nếu nhập sai quá 5 lần trong vòng 15 phút, tài khoản sẽ bị tạm khóa đăng nhập trong 30 phút và gửi cảnh báo tới email quản trị viên.

### 2.3. Quản lý Phiên làm việc & Thu hồi Token Tức thì (Token Revocation via Redis)
- **Cặp Token:**
  - `access_token`: Hiệu lực ngắn (30 phút), lưu trong bộ nhớ hoặc HttpOnly Cookie có cờ `Secure`, `SameSite=Strict`.
  - `refresh_token`: Hiệu lực 7 ngày, chỉ dùng để cấp mới Access Token.
- **Thu hồi quyền tức thì (Immediate Revocation):** Khi nhân sự đăng xuất hoặc khi Admin khóa tài khoản/thu hồi quyền của một luật sư, `jti` (JWT ID) sẽ ngay lập tức được đẩy vào **Redis Blocklist** với thời gian TTL bằng đúng thời hạn còn lại của token. Middleware sẽ từ chối mọi request mang token nằm trong blocklist này mà không cần chờ token tự hết hạn.

### 2.4. Tính Bất biến của Nhật ký Kiểm toán (Immutable Audit Logs)
- Toàn bộ hành vi nhạy cảm: Đọc hồ sơ vụ việc, Tải tài liệu tranh tụng, Phê duyệt cổng, Xác nhận thu tiền MISA, Sửa tỷ lệ hoa hồng... đều được ghi nhận vào bảng `audit_logs` của PostgreSQL.
- **Ràng buộc cơ sở dữ liệu:** Bảng `audit_logs` được cấp quyền thông qua user DB chỉ có quyền `INSERT` và `SELECT`. Tuyệt đối không cấp quyền `UPDATE` hoặc `DELETE` cho bất kỳ người dùng ứng dụng nào (kể cả Super Admin) để đảm bảo tính pháp lý khi phục vụ điều tra/kiểm toán nội bộ.

### 2.5. Phòng chống Tấn công SSRF & Bảo vệ Hạ tầng On-Premise
- Do máy chủ On-Premise nằm trong mạng nội bộ văn phòng, các API Outbound (gửi Telegram, Zalo, LLM) được cô lập qua một HTTP Client chuyên dụng có danh sách tên miền được phép (Allowlist: `api.telegram.org`, `openapi.zalo.me`, `generativelanguage.googleapis.com`).
- Nghiêm cấm ứng dụng thực hiện các request tới các dải IP nội bộ riêng tư (như `127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`) để loại bỏ hoàn toàn rủi ro SSRF (Server-Side Request Forgery).
