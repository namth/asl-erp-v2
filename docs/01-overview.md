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
4. **Tính hoa hồng phức tạp & thủ công:** Việc phân bổ tỷ lệ doanh thu theo nhiều vai trò (Sales mang vụ việc, Luật sư phụ trách/giám sát, Luật sư trực tiếp thực hiện từng task) trên từng đợt thanh toán thực tế tốn nhiều ngày công kế toán vào cuối mỗi kỳ và dễ xảy ra sai sót, tranh chấp quyền lợi.

---

## 3. MỤC TIÊU CHIẾN LƯỢC (PROJECT OBJECTIVES)
- **Chuẩn hóa quy trình pháp lý 100% (Strict Governance):** Mọi vụ việc vận hành đúng theo khung mẫu quy trình nghiệp vụ đã được chuẩn hóa, có kiểm soát cổng phê duyệt (Approval Gates) và ràng buộc phụ thuộc (Task Dependencies).
- **Tự động hóa liên phòng ban (Human-in-the-Loop Integration):** Tự động phát sinh tác vụ thu tiền cho Kế toán trên ERP; Kế toán chỉ cần xác nhận 1 chạm sau khi kiểm tra MISA để giải phóng quy trình cho các Luật sư tiếp tục làm việc.
- **Minh bạch tài chính & hoa hồng theo dòng tiền thực (Cash-basis):** Mỗi đồng tiền thực thu từ khách hàng được tự động tính toán và ghi nhận hoa hồng chính xác tức thời cho từng nhân sự tham gia.
- **Kiểm soát bảo mật theo cấu trúc đồ thị (Graph RBAC & Need-to-know):** Chỉ nhân sự được gán vào vụ việc hoặc phụ trách phòng ban tương ứng mới được tiếp cận hồ sơ vụ việc; toàn bộ hành vi truy cập và chỉnh sửa được lưu vết Audit Log tuyệt đối không thể xóa sửa.
- **Trợ lý AI thông minh & cảnh báo đa kênh:** Hỗ trợ tra cứu nhanh trạng thái vụ việc/khách hàng, đồng thời bắn cảnh báo hạn chót tức thời qua Web App, Telegram và Zalo.

---

## 4. ĐỐI TƯỢNG SỬ DỤNG HỆ THỐNG (TARGET AUDIENCE & ACTORS)
Hệ thống ERP ASL LAW trong giai đoạn này là **Internal Enterprise ERP**, phục vụ toàn bộ đội ngũ nhân sự nội bộ của hãng luật, được chuẩn bị sẵn kiến trúc phân tầng để mở rộng Cổng Khách Hàng (Client Portal) ở giai đoạn tiếp theo:

| Vai trò (Role) | Ký hiệu | Mô tả trách nhiệm & Phạm vi sử dụng |
| :--- | :--- | :--- |
| **Super Admin / Managing Partner** | `ADMIN` / `PARTNER` | Ban Giám đốc & Quản trị viên tối cao: Cấu hình hệ thống, tạo Workflow Templates, phê duyệt chiết khấu/hoa hồng đặc biệt, xem toàn bộ báo cáo doanh thu & giám sát toàn diện mọi vụ việc. |
| **Luật sư Giám sát / Trưởng phòng** | `SUPERVISOR` | Trưởng ban chuyên môn (Dân sự, SHTT, Doanh nghiệp...): Giám sát toàn bộ vụ việc thuộc ban mình quản lý, phân công nhân sự, phê duyệt các văn bản pháp lý tại Cổng duyệt (Approval Gate). |
| **Luật sư Quản lý Vụ việc** | `CASE_MANAGER` | Luật sư chủ trì chịu trách nhiệm chính về vụ việc cụ thể: Điều phối tiến độ, phân chia tác vụ (Task) cho thành viên, kiểm tra chất lượng hồ sơ trước khi trình duyệt. |
| **Luật sư Thực hiện / Thành viên** | `EXECUTOR` | Luật sư trực tiếp soạn thảo văn bản, nộp đơn, tham gia tranh tụng; cập nhật tiến độ công việc trên Kanban/Jira hybrid board. |
| **Trợ lý Pháp lý / Paralegal** | `ASSISTANT` | Hỗ trợ soạn thảo biểu mẫu, liên hệ thu thập giấy tờ từ khách hàng, theo dõi lịch hẹn và hạn chót. |
| **Kế toán Nghiệp vụ** | `ACCOUNTANT` | Tiếp nhận tác vụ tài chính tự động phát sinh từ vụ việc, đối chiếu dòng tiền trên MISA, bấm xác nhận thu tiền/xuất hóa đơn trên ERP và kiểm tra bảng tính hoa hồng. |
| **Chuyên viên Kinh doanh / Sales / BD** | `SALES` | Tiếp nhận Lead, quản lý cơ hội kinh doanh trên CRM, thương thảo báo giá, kích hoạt nút chuyển đổi Cơ hội thành Vụ việc chính thức. |

---

## 5. PHẠM VI DỰ ÁN (SCOPE OF WORK)
- **Trong phạm vi (In-Scope - Phase 1):**
  - Quản lý CRM & Chuyển đổi Cơ hội thành Vụ việc (Module 1).
  - Trình thiết kế quy trình động No-code/Low-code & Dynamic Form Fields (Module 2).
  - Không gian làm việc vụ việc (Case Workspace) & Quản lý tác vụ Kanban/Jira hybrid (Module 3).
  - Lộ trình thanh toán (Milestones) & Cơ chế tính hoa hồng tự động theo dòng tiền thực thu (Module 4).
  - Quy trình phối hợp Kế toán MISA & Cảnh báo đa kênh Web/Telegram/Zalo (Module 5).
  - Hệ thống phân quyền đồ thị Neo4j kết hợp RBAC & Audit Log bất biến (Module 6).
  - Trợ lý ảo AI tra cứu Metadata & Cảnh báo deadline (Module 7).
  - Triển khai On-Premise qua Docker Compose tại văn phòng ASL Law.
- **Ngoài phạm vi (Out-of-Scope - Dành cho Phase 2):**
  - Cổng Khách hàng (Client Portal) cho thân chủ tự đăng nhập tra cứu.
  - Phân tích RAG đọc sâu tài liệu hợp đồng PDF/DOCX bằng Vector Database.
  - Tích hợp 2 chiều tự động (Direct API) với MISA (do giới hạn từ phía phần mềm MISA).
