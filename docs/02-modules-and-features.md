# 02. CÁC PHÂN HỆ HỆ THỐNG & MA TRẬN PHÂN QUYỀN (MODULES & RBAC)

## 1. CHI TIẾT CÁC PHÂN HỆ NGHIỆP VỤ (MODULE SPECIFICATIONS)

### Phân hệ 1: Quản lý Khách hàng & Cơ hội Kinh doanh (CRM)
- **1.1. Hồ sơ Khách hàng (Client Profile):**
  - Quản lý thông tin doanh nghiệp/cá nhân: Tên khách hàng, Mã số thuế/CCCD, Người đại diện pháp luật, Hotline, Email, Địa chỉ trụ sở & giao dịch.
  - Phân loại khách hàng: Khách hàng mới, Tiềm năng, Khách cũ, Đối tác chiến lược, Khách VIP.
  - Dòng thời gian tương tác (Timeline): Lưu trữ nhật ký cuộc gọi, nội dung trao đổi, biên bản họp tư vấn, lịch sử các vụ việc đã thực hiện.
- **1.2. Quản lý Cơ hội (Opportunity Management):**
  - Ghi nhận nhu cầu pháp lý, nguồn tiếp cận (Website, Hotline, Facebook, Đối tác giới thiệu).
  - Đánh giá xác suất chốt (0 - 100%), giá trị hợp đồng dự kiến, nhân viên phụ trách Sales.
  - **Luồng chuyển đổi 1 chạm (Lead Conversion):** Khi cơ hội đạt trạng thái "Đã ký hợp đồng", hệ thống tự động trích xuất thông tin khách hàng, giá trị hợp đồng và tạo Vụ việc mới (Case) trong Module 3.

---

### Phân hệ 2: Trình Thiết kế Quy trình Động (Dynamic Workflow Builder)
- **2.1. Danh mục Nghiệp vụ Pháp lý Đa cấp:**
  - Cấu trúc cây: Lĩnh vực lớn (Dân sự, Doanh nghiệp & M&A, Sở hữu Trí tuệ...) -> Phân ngành chi tiết (Đăng ký Nhãn hiệu, Tranh chấp đất đai, Soạn thảo hợp đồng mua bán cổ phần...).
- **2.2. Trình Thiết kế Quy trình (Workflow Template Engine):**
  - Giao diện Admin trực quan: Tạo các Giai đoạn (Stages) tuần tự cho từng loại vụ việc.
  - Định nghĩa Tác vụ con mặc định (Tasks): Tên task, mô tả yêu cầu kỹ thuật, vai trò thực hiện mặc định (`EXECUTOR`, `ASSISTANT`), thời hạn SLA tương đối (số ngày).
  - Cấu hình Logic phân nhánh (Conditional Transitions): Định nghĩa điều kiện rẽ nhánh (Ví dụ: Đơn nhãn hiệu thành công -> Chuyển giai đoạn "Cấp văn bằng bảo hộ"; Đơn bị phản đối -> Sinh nhánh "Xử lý phản đối của bên thứ ba").
  - Cổng Phê duyệt (Approval Gates): Yêu cầu chữ ký xác nhận của `SUPERVISOR` hoặc `CASE_MANAGER` trước khi chuyển sang Stage tiếp theo.
- **2.3. Cấu hình Trường Dữ liệu Động (Dynamic Field Configurator):**
  - Cho phép Admin bổ sung các trường thông tin tùy biến lưu trong PostgreSQL `JSONB`:
    - *Lĩnh vực Đất đai:* Vị trí thửa đất, Diện tích, Giấy chứng nhận QSDĐ số...
    - *Lĩnh vực SHTT:* Số đơn, Ngày nộp đơn, Ngày ưu tiên, Ngày công bố, Số bằng bảo hộ...

---

### Phân hệ 3: Quản lý Vụ việc & Nhân sự Chuyên môn (Case Management)
- **3.1. Khởi tạo & Áp dụng Quy trình Vụ việc (Matter Setup):**
  - Tự động gắn Template quy trình tương ứng theo loại phân ngành pháp lý.
  - Cơ chế phân công đa vai trò (Multi-Role Assignment): Phân định rõ ràng Giám sát (`SUPERVISOR`), Luật sư Quản lý vụ việc (`CASE_MANAGER`), Luật sư Thực hiện (`EXECUTOR`), Trợ lý (`ASSISTANT`).
  - **Nguyên tắc Khung cứng (Strict Governance):** Toàn bộ tiến trình vụ việc tuân thủ 100% theo Template đã cấu hình, không phát sinh task/stage tự do ngoài quy chuẩn.
- **3.2. Không gian Làm việc Tập trung (Case Workspace):**
  - Header tổng quan: Tiến độ %, Stage hiện tại, thời hạn tổng thể, trạng thái (Khởi tạo, Đang thực hiện, Chờ duyệt, Tạm dừng, Hoàn thành).
  - Form dữ liệu chuyên sâu: Render động các trường JSONB đã cấu hình.
  - Cây tài liệu vụ việc: Phân mục hồ sơ đính kèm và kiểm soát phiên bản.
- **3.3. Quản lý Tác vụ Lai (Kanban/Jira Hybrid):**
  - *Chế độ Kanban:* Kéo thả trực quan giữa các cột: `Chưa bắt đầu` -> `Đang làm` -> `Chờ phê duyệt` -> `Hoàn thành`.
  - *Chế độ Chi tiết:* Xem checklist công việc, tệp đính kèm, lịch sử trao đổi nội bộ, ghi nhận thời gian xử lý.
  - *Ràng buộc Tiên quyết (Task Dependencies):* Khóa không cho phép bắt đầu hoặc nghiệm thu Task B nếu Task A tiên quyết chưa được hoàn thành.
- **3.4. Bảng điều khiển Cá nhân (Personal Dashboard):**
  - Danh sách đầu việc chưa hoàn thành của từng nhân sự, cảnh báo công việc quá hạn hoặc sắp tới hạn (Today / Next 3 Days).

---

### Phân hệ 4: Tài chính, Doanh thu & Chiết tính Hoa hồng Tự động
- **4.1. Lộ trình Thanh toán & Đợt thu tiền (Billing Milestones):**
  - Khởi tạo các đợt thanh toán (Milestones) gắn chặt với từng mốc nghiệp vụ (ví dụ: Đợt 1 - Tạm ứng khi ký HĐ 30%; Đợt 2 - Sau khi có Thông báo chấp nhận đơn hợp lệ 40%; Đợt 3 - Khi bàn giao kết quả 30%).
- **4.2. Cấu hình Cơ chế Hoa hồng Linh hoạt (Commission Schema):**
  - Cấu hình tỷ lệ % doanh thu cho các vai trò:
    - Hoa hồng phát triển thị trường (Sales / Người mang vụ việc về).
    - Hoa hồng quản lý chuyên môn (Supervisor / Case Manager).
    - Hoa hồng thực hiện trực tiếp (Luật sư thành viên / Trợ lý theo Task).
- **4.3. Động cơ Phân bổ Dòng tiền Thực thu (Cash-basis Engine):**
  - Khi một Milestone được Kế toán xác nhận đã thu tiền thành công: Hệ thống tự động kích hoạt tính toán và ghi nhận hoa hồng tương ứng ngay cho đợt đó.
  - Xuất bảng tổng hợp hoa hồng nhân sự phục vụ chi trả lương thưởng hàng tháng.

---

### Phân hệ 5: Phối hợp Kế toán MISA & Thông báo Đa kênh
- **5.1. Luồng Phối hợp Nghiệp vụ Kế toán (MISA Human-in-the-Loop):**
  - Khi vụ việc chạm mốc thu tiền: Hệ thống tự động tạo một "Tác vụ Tài chính" rơi vào danh sách chờ xử lý của Kế toán.
  - Kế toán đối soát tiền về trên phần mềm MISA bên ngoài -> Quay lại ERP bấm **"Xác nhận đã thu tiền / Đã xuất hóa đơn"** -> Nhập số hóa đơn và mã giao dịch ngân hàng để đối chiếu.
  - Hệ thống tự động mở khóa (Unblock) giai đoạn tiếp theo cho các luật sư thực hiện mà không cần trao đổi thủ công.
- **5.2. Hệ thống Cảnh báo Đa kênh 1 chiều:**
  - Bắn thông báo đẩy tức thời qua Web Chuông (WebSocket/SSE), đồng thời gửi tin nhắn tự động qua Telegram Bot, Zalo OA và Email nội bộ.
  - Mọi tin nhắn cảnh báo đều đính kèm **Deep-link** trực tiếp tới màn hình xử lý trên Web App.

---

### Phân hệ 6: Quản trị Bảo mật, Phân quyền Đồ thị & Nhật ký Kiểm toán
- **6.1. Phân quyền "Need-to-know" kết hợp Đồ thị Neo4j:**
  - Chỉ nhân sự được gán vào Vụ việc (hoặc Partner phụ trách phòng ban đó) mới có quyền truy cập hồ sơ vụ việc.
  - Phân tách dữ liệu: Kế toán chỉ tiếp cận tác vụ tài chính; Sales chỉ theo dõi tiến độ thu tiền; không ai được xem trái thẩm quyền.
- **6.2. Nhật ký Kiểm toán Toàn diện (Audit Logs):**
  - Ghi nhận bất biến (Append-only) mọi hành vi: Actor (Ai), Timestamp (Thời gian), Action (Xem, Thêm, Sửa, Tải file), Target Entity (Đối tượng), IP Address, User Agent. Không cho phép xóa hoặc chỉnh sửa log.
- **6.3. Sao lưu Dữ liệu Tự động (Backup):**
  - Lịch trình sao lưu tự động định kỳ (Daily/Weekly) toàn bộ PostgreSQL và Neo4j vào vùng lưu trữ NAS nội bộ của ASL Law.

---

### Phân hệ 7: Trợ lý ảo AI & Cảnh báo Thông minh
- **7.1. Trợ lý Metadata & Workflow:**
  - Chatbot tích hợp trực tiếp trên Web App sử dụng Tool Calling để truy vấn cơ sở dữ liệu: Tra cứu trạng thái hồ sơ vụ việc, tiến độ công việc, thông tin khách hàng, số ngày còn lại đến hạn chót (deadlines).
- **7.2. Tự động Quét Hạn chót (Deadline Scanner):**
  - Chạy ngầm theo lịch trình định kỳ (Cron Job), tự động phát hiện các Task sắp chạm hạn SLA hoặc quá hạn để bắn cảnh báo cho Luật sư phụ trách và Supervisor.

---

### Phân hệ 8: Giám Sát & Điều Hành Trực Quan (Operations War Room)
- **8.1. Văn phòng Số Trực quan (Virtual Office Floorplan - FEAT-01 / SCR-15):**
  - Mô phỏng không gian phòng làm việc 2.5D Isometric có đầy đủ bàn ghế, nhân sự đang ngồi làm việc, chỉ số công việc trên đầu (`⚡ Đang làm`, `⏳ Chờ xử lý`, `☕ Đang nghỉ ngơi`).
  - Hàng đợi trình duyệt trực tiếp (Approval Lane) trước bàn Trưởng phòng: Nhân sự có hồ sơ chờ duyệt sẽ đứng xếp hàng tại đây kèm huy hiệu `📝 X việc chờ duyệt`.
  - Tương tác Side Drawer xem chi tiết công việc, giao việc nhanh, gửi nhắc nhở và phê duyệt cổng điện tử trực tiếp trên phòng làm việc với cơ chế WebSockets thời gian thực.

---

## 2. MA TRẬN PHÂN QUYỀN CHI TIẾT (ROLE-BASED ACCESS CONTROL MATRIX)

| Hành động / Tính năng | Super Admin / Partner | Supervisor | Case Manager | Executor | Assistant | Accountant | Sales |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Quản trị Hệ thống & Template Quy trình** | **Toàn quyền** | Chỉ xem | Không | Không | Không | Không | Không |
| **Tạo mới & Quản lý Khách hàng (CRM)** | Toàn quyền | Xem/Sửa | Xem/Sửa | Xem | Xem | Chỉ xem | **Toàn quyền** |
| **Quản lý Cơ hội & Chuyển đổi thành Case** | Phê duyệt | Xem | Xem | Không | Không | Không | **Toàn quyền** |
| **Văn phòng số trực quan (Floorplan SCR-15)** | **Toàn quyền (mọi phòng)** | **Trong ban phụ trách** | ❌ Không | ❌ Không | ❌ Không | ❌ Không | ❌ Không |
| **Tạo mới & Gán nhân sự vào Vụ việc** | Toàn quyền | **Toàn quyền (trong ban)** | Được gán | Không | Không | Không | Không |
| **Xem chi tiết Hồ sơ & Văn bản Vụ việc** | Mọi vụ việc | Vụ việc trong ban | Vụ việc được gán | Vụ việc được gán | Vụ việc được gán | ❌ Không (chỉ xem tài chính) | ❌ Không (chỉ xem tiến độ) |
| **Thực hiện & Đổi trạng thái Tác vụ (Task)** | Toàn quyền | Duyệt/Sửa | Duyệt/Thực hiện | **Thực hiện** | Hỗ trợ | Không | Không |
| **Phê duyệt Cổng Giai đoạn (Approval Gate)** | Toàn quyền | **Phê duyệt** | Trình duyệt | Không | Không | Không | Không |
| **Tạo & Cấu hình Đợt thu tiền (Milestone)** | Toàn quyền | Phê duyệt | Đề xuất | Không | Không | Kiểm tra | Đề xuất |
| **Xác nhận Thu tiền từ MISA** | Phê duyệt | Không | Không | Không | Không | **Chuyên trách** | Không |
| **Xem Báo cáo Doanh thu & Bảng Hoa hồng** | Toàn hệ thống | Trong ban | Của cá nhân | Của cá nhân | Của cá nhân | Báo cáo Thu chi | Của cá nhân |
| **Xem Nhật ký Hệ thống (Audit Logs)** | **Toàn quyền** | Không | Không | Không | Không | Không | Không |
| **Sử dụng Trợ lý AI tra cứu** | Toàn hệ thống | Trong ban | Trong vụ được gán | Trong vụ được gán | Trong vụ được gán | Dữ liệu tài chính | Dữ liệu CRM/Lead |
