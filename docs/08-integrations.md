# 08. TÀI LIỆU TÍCH HỢP HỆ THỐNG & NGOẠI VI (SYSTEM INTEGRATIONS)

## 1. TÍCH HỢP QUY TRÌNH PHỐI HỢP KẾ TOÁN MISA (HUMAN-IN-THE-LOOP INTEGRATION)

### 1.1. Bối cảnh Kỹ thuật
- Phần mềm kế toán MISA SME / MISA act-open của hãng luật hoạt động độc lập và không mở API kết nối trực tiếp ra bên ngoài hoặc sử dụng phiên bản Desktop cục bộ.
- Nhằm tránh phụ thuộc vào phần mềm bên thứ 3 và loại bỏ hoàn toàn rủi ro bảo mật tài chính, ERP ASL LAW áp dụng giải pháp **Human-in-the-Loop Workflow Integration**.

### 1.2. Luồng Vận hành Nghiệp vụ
1. **Trigger tự động:** Khi một Task kỹ thuật hoàn tất hoặc một Giai đoạn chạm mốc Milestone yêu cầu thu tiền, FastAPI Service tự động khởi tạo một bản ghi trong `billing_milestones` với trạng thái `PENDING` và đẩy một Tác vụ Tài chính vào màn hình **SCR-11 (Bàn làm việc Kế toán)**.
2. **Kế toán kiểm tra độc lập:** Kế toán viên đăng nhập MISA và kiểm tra sao kê ngân hàng thực tế. Khi tiền đã về tài khoản công ty và hóa đơn điện tử đã xuất:
3. **Xác nhận 1-Chạm:** Kế toán quay lại màn hình SCR-11 trên ERP, nhập:
   - Số hóa đơn VAT đã xuất trên MISA (VD: `HD-2026-00123`).
   - Mã bút toán ngân hàng (VD: `VCB-FT-889900`).
   - Số tiền thực tế đã ghi nhận.
   - Bấm nút **"Xác nhận đã thu tiền"**.
4. **Tác động chuỗi tự động (Chained Automated Actions):**
   - Giải phóng trạng thái tạm khóa (Unblock) của Vụ việc để luật sư nộp hồ sơ.
   - Tự động kích hoạt Động cơ tính hoa hồng (Cash-basis Commission Engine).
   - Ghi nhận Audit Log bất biến lưu dấu Kế toán viên đã xác thực.

---

## 2. TÍCH HỢP KÊNH CẢNH BÁO TELEGRAM (TELEGRAM BOT API)

### 2.1. Kiến trúc Kết nối
- Bot chuyên dụng: `@ASLLawAlertBot`.
- Chiều giao tiếp: **1-way Outbound Push Notification**. Máy chủ On-Premise gửi request HTTPS `POST https://api.telegram.org/bot<TOKEN>/sendMessage` ra ngoài Internet qua kênh an toàn.
- Liên kết tài khoản: Mỗi luật sư/nhân sự có một mã liên kết `telegram_chat_id` được xác thực 1 lần qua mã OTP hiển thị trên màn hình Trang cá nhân của ERP.

### 2.2. Mẫu Tin nhắn Thông báo Chuẩn
```text
⚖️ [ERP ASL LAW] CẢNH BÁO HẠN CHÓT CÔNG VIỆC

Kính gửi: Luật sư Nguyễn Văn Trường
Vụ việc: ASL-2026-IP-0045 (Đăng ký Nhãn hiệu ASL Gateway)
Nhiệm vụ: Soạn thảo bản giải trình phản đối đơn
Thời hạn xử lý (SLA): 17:00 ngày 28/10/2026 (Còn lại: 3 giờ)

👉 Bấm vào liên kết an toàn để truy cập hồ sơ:
https://erp.asllaw.vn/cases/8f3a1b2c/tasks/t402
```

---

## 3. TÍCH HỢP ZALO OFFICIAL ACCOUNT (ZALO OA / ZNS)

### 3.1. Phương thức Kết nối
- Sử dụng **Zalo Official Account API (OpenAPI V3)**.
- Gửi thông báo dịch vụ (ZNS - Zalo Notification Service) thông qua số điện thoại đã định danh của nhân sự ASL Law.
- Token quản lý qua cơ chế OAuth Access Token & Refresh Token lưu trong Redis với chu kỳ làm mới tự động trước khi hết hạn (TTL 24h).

### 3.2. Cấu hình Kịch bản Gửi tin
- Cảnh báo phân công vụ việc mới cho Supervisor và Lead Lawyer.
- Cảnh báo có Cổng Phê duyệt (Approval Gate) đang chờ Trưởng ban ký duyệt.
- Thông báo tiền về thành công từ Kế toán viên.

---

## 4. TÍCH HỢP TRÍ TUỆ NHÂN TẠO (AI ASSISTANT - GOOGLE GEMINI / OPENAI)

### 4.1. Kiến trúc Function Calling / Tool Calling
Trợ lý AI vận hành theo mô hình Agentic Workflow:
1. Người dùng gửi câu hỏi qua **SCR-14 (Khung AI Drawer)**.
2. FastAPI Backend nhận câu hỏi, kèm theo danh sách các Tools định nghĩa bằng Pydantic schemas và gửi tới LLM API.
3. LLM phân tích câu hỏi và sinh lệnh Tool Call phù hợp (ví dụ `query_cases_by_deadline`, `get_client_summary`).
4. FastAPI thực thi hàm truy vấn nội bộ an toàn (kiểm tra chặt chẽ quyền hạn của User đang đăng nhập qua Neo4j Need-to-know Guard), nhận kết quả JSON.
5. Gửi kết quả JSON trở lại cho LLM để sinh câu trả lời tự nhiên, chính xác, thân thiện bằng tiếng Việt.

### 4.2. Danh sách Schema Công cụ AI (AI Tool Definitions)
```json
[
  {
    "name": "get_urgent_tasks",
    "description": "Lấy danh sách các tác vụ sắp tới hạn hoặc quá hạn của người dùng đang đăng nhập",
    "parameters": {
      "type": "object",
      "properties": {
        "days_ahead": { "type": "integer", "description": "Số ngày tới để quét deadline, mặc định là 3" }
      }
    }
  },
  {
    "name": "lookup_case_status",
    "description": "Tra cứu tiến độ, giai đoạn hiện tại và nhân sự phụ trách của một vụ việc theo mã hoặc tên",
    "parameters": {
      "type": "object",
      "properties": {
        "keyword": { "type": "string", "description": "Mã vụ việc (VD: ASL-2026-IP-0012) hoặc tên thân chủ" }
      },
      "required": ["keyword"]
    }
  }
]
```

---

## 5. HỆ THỐNG LƯU TRỮ TỆP TIN HỒ SƠ & BẢN SAO LƯU (NAS STORAGE)

- **Vị trí lưu trữ:** Network Attached Storage (NAS) tại văn phòng ASL Law được gắn kết (NFS / SMB Mount) trực tiếp vào máy chủ máy trạm thông qua volume Docker `/mnt/asl_nas/documents`.
- **Cấu trúc phân thư mục bảo mật:**
  ```text
  /mnt/asl_nas/documents/
  ├── cases/
  │   └── {case_id}/
  │       ├── 01_legal_contracts/      # Hợp đồng dịch vụ pháp lý
  │       ├── 02_client_submissions/   # Giấy tờ thân chủ cung cấp (CCCD, ĐKKD)
  │       ├── 03_official_filings/     # Đơn từ nộp cơ quan nhà nước / Tòa án
  │       └── 04_internal_drafts/       # Bản thảo nội bộ của luật sư
  └── backups/
      ├── postgres/                     # File nén .sql.gz hàng ngày
      └── neo4j/                        # Snapshot đồ thị hàng ngày
  ```
- **Mã hóa dữ liệu lưu trữ (Data-at-Rest Encryption):** Toàn bộ file nhạy cảm trước khi ghi xuống ổ cứng NAS được mã hóa đối xứng bằng thuật toán **AES-256-GCM** với Master Key lưu trong biến môi trường bảo mật của máy chủ.
