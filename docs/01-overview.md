# 01. TỔNG QUAN DỰ ÁN (PROJECT OVERVIEW)

## 1. GIỚI THIỆU DỰ ÁN
- **Tên dự án:** ERP ASL LAW (Hệ thống Quản trị Doanh nghiệp Luật Toàn diện).
- **Đơn vị chủ quản:** Hãng luật ASL LAW.
- **Mục tiêu:** Số hóa toàn diện và tự động hóa chu trình nghiệp vụ pháp lý, từ khâu quản lý khách hàng & cơ hội kinh doanh (CRM), phân phối vụ việc (Case Management), điều phối quy trình tự động nghiêm ngặt (Dynamic Workflow), kiểm soát tiến độ công việc (Kanban/Jira-hybrid), cho tới quản lý thu phí - đợt thanh toán (Milestone Billing) và chiết tính hoa hồng tự động theo dòng tiền thực thu (Cash-basis Commission).
- **Mô hình triển khai:** Máy chủ vật lý nội bộ (On-Premise Server) đặt tại văn phòng ASL Law nhằm bảo vệ chủ quyền dữ liệu và bảo mật tuyệt đối hồ sơ nhạy cảm của thân chủ.

---

## 2. BÀI TOÁN CỐT LÕI & NỖI ĐAU HIỆN TẠI (PROBLEM STATEMENT)
1. **Phân mảnh thông tin & rủi ro bảo mật:** Hồ sơ vụ việc, hợp đồng, trao đổi với khách hàng nằm phân tán ở email cá nhân, Zalo và tài liệu giấy, gây khó khăn cho việc kiểm soát quyền truy cập và bảo vệ bí mật luật sư - thân chủ (Attorney-Client Privilege).
2. **Quy trình chuyên môn phức tạp & thiếu chuẩn hóa:** Các phân ngành luật (Sở hữu trí tuệ, M&A, Tranh chấp đất đai, Tố tụng dân sự...) có biểu mẫu, giai đoạn và điều kiện pháp lý hoàn toàn khác nhau. Việc thiếu một Workflow Engine chuẩn mực khiến các luật sư dễ bỏ sót hạn chót (statute of limitations / deadlines) hoặc thiếu chữ ký duyệt từ cấp trên.
3. **Điểm nghẽn liên phòng ban với Kế toán:** Phần mềm kế toán MISA của hãng luật hoạt động độc lập không có API mở, dẫn đến việc xác nhận tiền về và mở khóa các giai đoạn kỹ thuật (nộp đơn, tranh tụng) phụ thuộc hoàn toàn vào trao đổi miệng hoặc chat thủ công, dễ gây chậm trễ.
4. **Tính hoa hồng phức tạp & thủ công:** Việc phân bổ tỷ lệ doanh thu theo nhiều vai trò (người mang khách về, Luật sư phụ trách/giám sát, Luật sư trực tiếp thực hiện từng task) trên từng đợt thanh toán thực tế tốn nhiều ngày công kế toán vào cuối mỗi kỳ và dễ xảy ra sai sót, tranh chấp quyền lợi.

---

## 3. MỤC TIÊU CHIẾN LƯỢC (PROJECT OBJECTIVES)
- **Chuẩn hóa quy trình pháp lý có kiểm soát (Governed Workflow):** Mọi vụ việc chạy theo quy trình mẫu đã chuẩn hóa (chế độ Khung cứng hoặc Linh hoạt), có cổng phê duyệt (Approval Gates), ràng buộc phụ thuộc (Task Dependencies); mọi bổ sung ngoài mẫu đều phải được phê duyệt.
- **Tự động hóa liên phòng ban (Human-in-the-Loop Integration):** Tự động phát sinh tác vụ thu tiền cho Kế toán trên ERP; Kế toán chỉ cần xác nhận 1 chạm sau khi kiểm tra MISA để giải phóng quy trình cho các Luật sư tiếp tục làm việc.
- **Minh bạch tài chính & hoa hồng theo dòng tiền thực (Cash-basis):** Mỗi đồng tiền thực thu từ khách hàng được tự động tính toán và ghi nhận hoa hồng chính xác tức thời cho từng nhân sự tham gia.
- **Kiểm soát bảo mật theo cấu trúc đồ thị (Graph RBAC & Need-to-know):** Chỉ nhân sự được gán vào vụ việc hoặc phụ trách phòng ban tương ứng mới được tiếp cận hồ sơ vụ việc; toàn bộ hành vi truy cập và chỉnh sửa được lưu vết Audit Log tuyệt đối không thể xóa sửa.
- **Trợ lý AI thông minh & cảnh báo đa kênh:** Hỗ trợ tra cứu nhanh trạng thái vụ việc/khách hàng, đồng thời bắn cảnh báo hạn chót tức thời qua Web App, Telegram và Zalo.

---

## 4. ĐỐI TƯỢNG SỬ DỤNG HỆ THỐNG (TARGET AUDIENCE & ACTORS)
Hệ thống ERP ASL LAW trong giai đoạn này là **Internal Enterprise ERP** cho đội ngũ nội bộ, chuẩn bị sẵn kiến trúc để mở Cổng Khách Hàng (Client Portal) ở Phase 2.

### 4.1. Vai trò hệ thống (4 vai trò — DEC-01)

| Vai trò | Mã | Ai dùng | Phạm vi |
| :--- | :--- | :--- | :--- |
| **Quản trị viên** | `ADMIN` | IT / quản trị hệ thống | Cấu hình hệ thống, workflow template, người dùng & phòng ban, nhật ký kiểm toán. Không đọc nội dung chuyên môn vụ việc nếu không được phân công. |
| **Quản lý** | `MANAGER` | **Giám đốc** (`is_executive`, phạm vi mọi phòng ban) và **Trưởng phòng/Trưởng ban** (phạm vi phòng ban mình quản lý) | Điều hành vụ việc, phân công, phê duyệt cổng và yêu cầu bổ sung, cấu hình tỷ lệ hoa hồng, báo cáo, Văn phòng số. |
| **Kế toán** | `ACCOUNTANT` | Kế toán nghiệp vụ | Đợt thu, xác nhận thu tiền sau khi đối soát MISA, sổ hoa hồng, báo cáo thu chi. Không xem tài liệu chuyên môn. |
| **Luật sư** | `ATTORNEY` | Luật sư, chuyên viên, trợ lý pháp lý | Thực hiện vụ việc/task được giao, quản lý khách hàng & cơ hội (CRM), Trợ lý AI. |

Giám đốc và Trưởng phòng **cùng vai trò `MANAGER`**; khác nhau ở phạm vi phòng ban (dữ liệu phân quyền), không phải vai trò riêng.

### 4.2. Vai trò trong vụ việc

Khi được phân công vào một vụ việc, người dùng có thêm vai trò **trong vụ việc đó**:

| Vai trò trong vụ việc | Mã | Trách nhiệm |
| :--- | :--- | :--- |
| Luật sư Giám sát | `SUPERVISOR` | Giám sát chuyên môn, phê duyệt cổng giai đoạn |
| Luật sư Quản lý vụ việc | `CASE_MANAGER` | Điều phối tiến độ, phân chia task, duyệt task, đề xuất đợt thu |
| Luật sư Thực hiện | `EXECUTOR` | Soạn thảo, nộp đơn, tranh tụng; cập nhật task |
| Trợ lý | `ASSISTANT` | Hỗ trợ biểu mẫu, thu thập giấy tờ, theo dõi hạn |

**Người mang khách về** (`originator`) là người dùng bất kỳ được ghi trên cơ hội kinh doanh; hưởng hoa hồng phát triển thị trường và được xem tiến độ thu tiền của vụ việc đó. Không có vai trò Sales riêng.

---

## 5. PHẠM VI DỰ ÁN (SCOPE OF WORK)
- **Trong phạm vi (In-Scope - Phase 1):**
  - Quản lý CRM & Chuyển đổi Cơ hội thành Vụ việc (Phân hệ 1).
  - Trình thiết kế quy trình động, hai chế độ Khung cứng / Linh hoạt có phê duyệt (Phân hệ 2).
  - Không gian làm việc vụ việc & Quản lý tác vụ Kanban/Jira hybrid (Phân hệ 3).
  - Lộ trình thanh toán & Hoa hồng theo dòng tiền thực thu (Phân hệ 4).
  - Phối hợp Kế toán MISA & Cảnh báo đa kênh Web/Telegram/Zalo (Phân hệ 5).
  - Phân quyền đồ thị Neo4j, Audit Log bất biến, đăng nhập nội bộ + 2FA (Phân hệ 6).
  - Trợ lý ảo AI tra cứu Metadata & Cảnh báo deadline, có tối thiểu hoá dữ liệu gửi ra cloud (Phân hệ 7).
  - Văn phòng số trực quan (Phân hệ 8).
  - **Tài liệu vụ việc**: kho tài liệu, phiên bản, lưu mã hoá trên NAS (Phân hệ 9 — DEC-04).
  - **Báo cáo & thống kê** (Phân hệ 10 — DEC-04).
  - **Chuyển toàn bộ dữ liệu** từ hệ thống WordPress cũ (DEC-05).
  - Triển khai On-Premise qua Docker Compose, sao lưu NAS + bản mã hoá off-site (DEC-08).
- **Ngoài phạm vi (Out-of-Scope - Phase 2):**
  - Cổng Khách hàng (Client Portal).
  - Chấm công (Timesheet).
  - Phân tích RAG đọc sâu tài liệu hợp đồng bằng Vector Database.
  - Tích hợp 2 chiều tự động (Direct API) với MISA.
