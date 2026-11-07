# 08. TÀI LIỆU TÍCH HỢP HỆ THỐNG & NGOẠI VI (SYSTEM INTEGRATIONS)

## 1. TÍCH HỢP QUY TRÌNH PHỐI HỢP KẾ TOÁN MISA (HUMAN-IN-THE-LOOP INTEGRATION)

### 1.1. Bối cảnh Kỹ thuật
- Phần mềm kế toán MISA SME / MISA act-open của hãng luật hoạt động độc lập và không mở API kết nối trực tiếp ra bên ngoài hoặc sử dụng phiên bản Desktop cục bộ.
- Nhằm tránh phụ thuộc vào phần mềm bên thứ 3 và loại bỏ hoàn toàn rủi ro bảo mật tài chính, ERP ASL LAW áp dụng giải pháp **Human-in-the-Loop Workflow Integration**.

### 1.2. Luồng Vận hành Nghiệp vụ
1. **Trigger tự động:** Khi một Task kỹ thuật hoàn tất hoặc một Giai đoạn chạm mốc Milestone yêu cầu thu tiền, FastAPI Service chuyển đợt thu tương ứng trong `billing_milestones` sang `AWAITING_PAYMENT` (`12` §1.5) và đẩy một Tác vụ Tài chính vào màn hình **SCR-11 (Bàn làm việc Kế toán)**.
2. **Kế toán kiểm tra độc lập:** Kế toán viên đăng nhập MISA và kiểm tra sao kê ngân hàng thực tế. Khi tiền đã về tài khoản công ty và hóa đơn điện tử đã xuất:
3. **Xác nhận 1-Chạm:** Kế toán quay lại màn hình SCR-11 trên ERP, nhập:
   - Số hóa đơn VAT đã xuất trên MISA (VD: `HD-2026-00123`).
   - Mã bút toán ngân hàng (VD: `VCB-FT-889900`).
   - Số tiền thực tế đã ghi nhận (có thể nhỏ hơn số phải thu — thu một phần, DEC-06).
   - Bấm nút **"Xác nhận đã thu tiền"**. Nút bị khoá ngay khi bấm; request gửi kèm `Idempotency-Key`; mã giao dịch ngân hàng trùng bị từ chối.
4. **Tác động chuỗi tự động (Chained Automated Actions):**
   - Thu đủ: giải phóng trạng thái tạm khóa (Unblock) giai đoạn tiếp theo. Thu một phần: đợt thu `PARTIALLY_PAID`, giai đoạn vẫn khoá.
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
[ERP ASL LAW] HẠN CHÓT CÔNG VIỆC
Vụ việc: ASL-2026-TM-0045
Nhiệm vụ: Soạn thảo bản giải trình phản đối đơn
Hạn: 17:00 ngày 28/10/2026 (còn 3 giờ)
Mở trong ERP (cần mạng văn phòng hoặc VPN):
https://erp.asllaw.vn/cases/8f3a1b2c/tasks/t402
```

**Quy tắc nội dung (DEC-03):** chỉ gồm mã vụ việc, tên task, hạn chót, deep-link. **Không** có tên khách hàng, tên vụ việc, tên nhãn hiệu/tài sản, số tiền hay nội dung tài liệu. Tên task trong template không được chứa tên khách hàng (kiểm tra khi phát hành template). Mẫu tin dựng bằng hàm riêng `render_external_message()` có unit test chặn PII.

---

## 3. TÍCH HỢP ZALO OFFICIAL ACCOUNT (ZALO OA / ZNS)

### 3.1. Phương thức Kết nối
- Sử dụng **Zalo Official Account API (OpenAPI V3)**.
- Gửi tin qua Zalo OA tới nhân sự đã quan tâm (follow) OA và liên kết tài khoản trong trang cá nhân ERP; nếu dùng ZNS thì mỗi mẫu tin phải được Zalo duyệt trước và tuân thủ cùng quy tắc nội dung tối thiểu ở §2.2.
- Token quản lý qua cơ chế OAuth Access Token & Refresh Token lưu trong Redis với chu kỳ làm mới tự động trước khi hết hạn (TTL 24h).

### 3.2. Cấu hình Kịch bản Gửi tin
- Cảnh báo phân công vụ việc mới cho Supervisor và Case Manager.
- Cảnh báo có yêu cầu phê duyệt (task, cổng giai đoạn, yêu cầu bổ sung) đang chờ.
- Thông báo giai đoạn đã mở khoá sau khi Kế toán xác nhận thu đủ.
- Mọi tin chỉ chứa mã vụ việc + mô tả ngắn + deep-link (§2.2).

---

## 4. TÍCH HỢP TRÍ TUỆ NHÂN TẠO (AI ASSISTANT - GOOGLE GEMINI / OPENAI)

### 4.1. Kiến trúc Function Calling / Tool Calling
Trợ lý AI vận hành theo mô hình Agentic Workflow:
1. Người dùng gửi câu hỏi qua **SCR-14 (Khung AI Drawer)**.
2. FastAPI Backend nhận câu hỏi, kèm theo danh sách các Tools định nghĩa bằng Pydantic schemas và gửi tới LLM API.
3. LLM phân tích câu hỏi và sinh lệnh Tool Call phù hợp (ví dụ `query_cases_by_deadline`, `get_client_summary`).
4. FastAPI thực thi hàm truy vấn nội bộ an toàn (kiểm tra chặt chẽ quyền hạn của User đang đăng nhập qua Neo4j Need-to-know Guard), nhận kết quả JSON.
5. Gửi kết quả JSON trở lại cho LLM để sinh câu trả lời tự nhiên, chính xác, thân thiện bằng tiếng Việt.

### 4.2. Tối thiểu hoá dữ liệu gửi LLM (DEC-03)
1. Công cụ AI chạy với quyền của người hỏi (cùng guard Need-to-know) — chỉ trả dữ liệu người đó được xem.
2. Trước khi gửi kết quả công cụ lên LLM, lớp `pii_redactor` thay: tên khách hàng/bên liên quan → `KH-001`, `BL-001`…; MST/CCCD/hộ chiếu, số điện thoại, email, địa chỉ → `[ẨN]`. Bảng ánh xạ chỉ giữ trong bộ nhớ của request.
3. Câu trả lời của LLM được thay mã giả về tên thật ở máy chủ trước khi trả cho người dùng.
4. **Không bao giờ** gửi nội dung tài liệu, ghi chú nội bộ, số tiền chi tiết của hoa hồng lên LLM.
5. Câu hỏi của người dùng cũng qua bộ lọc: nếu người dùng gõ tên khách hàng, tên đó được thay bằng mã giả tương ứng (tra trong phạm vi quyền) trước khi gửi.
6. Không bật lưu lịch sử/huấn luyện ở phía nhà cung cấp (dùng tuỳ chọn zero-retention nếu có); ghi audit `AI_QUERY` với câu hỏi đã che.

### 4.3. Danh sách Schema Công cụ AI (AI Tool Definitions)
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
        "keyword": { "type": "string", "description": "Mã vụ việc (VD: ASL-2026-TM-0012) hoặc mã giả khách hàng (VD: KH-001)" }
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
- **Mã hóa dữ liệu lưu trữ (Data-at-Rest Encryption):** Toàn bộ file trước khi ghi xuống ổ cứng NAS được mã hóa bằng **AES-256-GCM**, mỗi tệp một khoá dữ liệu (DEK) được bọc bởi Master Key (envelope encryption); Master Key lưu ngoài NAS (biến môi trường/secret của máy chủ) và có bản sao niêm phong do Giám đốc giữ — mất Master Key là mất toàn bộ tài liệu.
- **Quét virus:** tệp tải lên vào vùng tạm, container `clamav` quét; chỉ chuyển vào kho và cho tải xuống khi `CLEAN` (`06` §2.5).
- **Sao lưu:** thư mục `backups/` ở NAS chỉ là lớp 1; bản off-site hằng tuần theo `05` §3.2 (DEC-08).
