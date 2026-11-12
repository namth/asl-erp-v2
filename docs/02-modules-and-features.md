# 02. CÁC PHÂN HỆ HỆ THỐNG & MA TRẬN PHÂN QUYỀN (MODULES & RBAC)

## 1. CHI TIẾT CÁC PHÂN HỆ NGHIỆP VỤ (MODULE SPECIFICATIONS)

### Phân hệ 1: Quản lý Khách hàng & Cơ hội Kinh doanh (CRM)
- **1.1. Hồ sơ Khách hàng (Client Profile):**
  - Quản lý thông tin doanh nghiệp/cá nhân: Tên khách hàng, Mã số thuế/CCCD, Người đại diện pháp luật, Hotline, Email, Địa chỉ trụ sở & giao dịch.
  - Phân loại khách hàng: Khách hàng mới, Tiềm năng, Khách cũ, Đối tác chiến lược, Khách VIP.
  - Dòng thời gian tương tác (Timeline): Lưu trữ nhật ký cuộc gọi, nội dung trao đổi, biên bản họp tư vấn, lịch sử các vụ việc đã thực hiện.
- **1.2. Quản lý Cơ hội (Opportunity Management):**
  - Ghi nhận nhu cầu pháp lý, nguồn tiếp cận (Website, Hotline, Facebook, Đối tác giới thiệu).
  - Đánh giá xác suất chốt (0 - 100%), giá trị hợp đồng dự kiến, **người mang khách về** (originator — hưởng hoa hồng phát triển thị trường).
  - **Luồng chuyển đổi 1 chạm (Lead Conversion):** Khi cơ hội đạt trạng thái `WON` (đã ký hợp đồng), hệ thống tự động trích xuất thông tin khách hàng, giá trị hợp đồng và tạo Vụ việc mới (Case) trong Phân hệ 3.
  - **Kiểm tra xung đột lợi ích:** khi tạo khách hàng hoặc thêm bên liên quan, hệ thống đối chiếu với bên đối tụng của các vụ việc đang hiệu lực và cảnh báo Quản lý (`12` §4.1).

---

### Phân hệ 2: Trình Thiết kế Quy trình Động (Dynamic Workflow Builder)
- **2.1. Danh mục Nghiệp vụ Pháp lý Đa cấp:**
  - Cấu trúc cây: Lĩnh vực lớn (Dân sự, Doanh nghiệp & M&A, Sở hữu Trí tuệ...) -> Phân ngành chi tiết (Đăng ký Nhãn hiệu, Tranh chấp đất đai, Soạn thảo hợp đồng mua bán cổ phần...).
- **2.2. Trình Thiết kế Quy trình (Workflow Template Engine):**
  - Giao diện Admin trực quan: Tạo các Giai đoạn (Stages) tuần tự cho từng loại vụ việc.
  - **Chế độ quy trình (DEC-07):** khi tạo template, Admin chọn **Khung cứng** (`STRICT` — không thêm/bớt stage/task) hoặc **Linh hoạt** (`FLEXIBLE` — được đề xuất thêm task/stage, nhưng phải được Quản lý phê duyệt mới có hiệu lực).
  - **Phiên bản template:** template đã phát hành là bất biến; sửa template tạo phiên bản mới, vụ việc đang chạy giữ phiên bản lúc khởi tạo.
  - Định nghĩa Tác vụ con mặc định (Tasks): Tên task, mô tả yêu cầu kỹ thuật, vai trò thực hiện mặc định (`CASE_MANAGER`, `EXECUTOR`, `ASSISTANT`), thời hạn SLA tương đối (số **ngày làm việc**), trọng số độ phức tạp (1–4) dùng chia hoa hồng, task kích hoạt đợt thu.
  - Cấu hình Logic phân nhánh (Conditional Transitions): Định nghĩa điều kiện rẽ nhánh (Ví dụ: Đơn nhãn hiệu thành công -> Chuyển giai đoạn "Cấp văn bằng bảo hộ"; Đơn bị phản đối -> Sinh nhánh "Xử lý phản đối của bên thứ ba").
  - Cổng Phê duyệt (Approval Gates): Yêu cầu phê duyệt của `SUPERVISOR` của vụ việc (hoặc Quản lý phụ trách phòng ban khi vụ việc không có Supervisor) trước khi chuyển sang Stage tiếp theo.
- **2.3. Cấu hình Trường Dữ liệu Động (Dynamic Field Configurator):**
  - Cho phép Admin bổ sung các trường thông tin tùy biến lưu trong PostgreSQL `JSONB`:
    - *Lĩnh vực Đất đai:* Vị trí thửa đất, Diện tích, Giấy chứng nhận QSDĐ số...
    - *Lĩnh vực SHTT:* Số đơn, Ngày nộp đơn, Ngày ưu tiên, Ngày công bố, Số bằng bảo hộ...

---

### Phân hệ 3: Quản lý Vụ việc & Nhân sự Chuyên môn (Case Management)
- **3.1. Khởi tạo & Áp dụng Quy trình Vụ việc (Matter Setup):**
  - Tự động gắn Template quy trình tương ứng theo loại phân ngành pháp lý.
  - Cơ chế phân công đa vai trò (Multi-Role Assignment): Phân định rõ ràng Giám sát (`SUPERVISOR`), Luật sư Quản lý vụ việc (`CASE_MANAGER`), Luật sư Thực hiện (`EXECUTOR`), Trợ lý (`ASSISTANT`).
  - **Quy trình có kiểm soát (DEC-07):** Vụ việc chạy theo phiên bản template lúc khởi tạo. Template `STRICT`: không phát sinh task/stage ngoài mẫu. Template `FLEXIBLE`: luật sư gửi **yêu cầu bổ sung** kèm lý do; chỉ sau khi Quản lý phê duyệt task/stage mới được tạo, có đánh dấu "bổ sung" và ghi audit.
- **3.2. Không gian Làm việc Tập trung (Case Workspace):**
  - Header tổng quan: Tiến độ %, Stage hiện tại, thời hạn tổng thể, trạng thái vụ việc (Khởi tạo, Đang thực hiện, Tạm dừng, Hoàn thành, Chấm dứt) kèm cờ chặn của stage hiện tại (Chờ duyệt, Chờ thu tiền).
  - Form dữ liệu chuyên sâu: Render động các trường JSONB đã cấu hình.
  - Cây tài liệu vụ việc: xem Phân hệ 9.
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
    - Hoa hồng phát triển thị trường (người mang khách về).
    - Hoa hồng quản lý chuyên môn (Supervisor / Case Manager).
    - Hoa hồng thực hiện trực tiếp (Luật sư thành viên / Trợ lý theo Task).
- **4.3. Động cơ Phân bổ Dòng tiền Thực thu (Cash-basis Engine):**
  - Mỗi lần Kế toán xác nhận một khoản tiền về (kể cả thu một phần): hệ thống tính và ghi nhận hoa hồng **trên số tiền thực về của lần đó**. Quy trình chỉ mở khoá khi đợt thu đủ.
  - Hoàn tiền / huỷ hợp đồng: **không** đảo hoa hồng đã ghi nhận; Quản lý xử lý ngoài hệ thống (DEC-06).
  - Thống kê và xuất bảng tổng hợp hoa hồng nhân sự **theo từng tháng** để đối chiếu khi chi trả (việc chi trả làm ngoài hệ thống — DEC-09).

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
  - Chỉ nhân sự được gán vào Vụ việc (hoặc Trưởng phòng của phòng ban đó, hoặc Giám đốc) mới có quyền truy cập hồ sơ vụ việc.
  - Phân tách dữ liệu theo phạm vi (`06` §3.3): Kế toán chỉ tiếp cận phần tài chính; người mang khách về chỉ theo dõi tiến độ và thu tiền; Quản trị viên không đọc nội dung chuyên môn; không ai được xem trái thẩm quyền.
- **6.2. Xác thực nội bộ & 2FA (DEC-02):** Chỉ tài khoản nội bộ (không SSO). Mã TOTP bắt buộc với Quản trị viên, Quản lý, Kế toán; tuỳ chọn với Luật sư.
- **6.3. Nhật ký Kiểm toán Toàn diện (Audit Logs):**
  - Ghi nhận bất biến (Append-only) mọi hành vi: Actor (Ai), Timestamp (Thời gian), Action (Xem, Thêm, Sửa, Tải file), Target Entity (Đối tượng), IP Address, User Agent. Không cho phép xóa hoặc chỉnh sửa log.
- **6.4. Sao lưu Dữ liệu Tự động (Backup — DEC-08):**
  - Hằng đêm: PostgreSQL, Neo4j và kho tài liệu vào NAS nội bộ. Hằng tuần: bản mã hoá đưa ra ngoài văn phòng. Diễn tập khôi phục hằng quý.

---

### Phân hệ 7: Trợ lý ảo AI & Cảnh báo Thông minh
- **7.1. Trợ lý Metadata & Workflow:**
  - Chatbot tích hợp trực tiếp trên Web App sử dụng Tool Calling để truy vấn cơ sở dữ liệu: Tra cứu trạng thái hồ sơ vụ việc, tiến độ công việc, thông tin khách hàng, số ngày còn lại đến hạn chót (deadlines).
  - **Tối thiểu hoá dữ liệu (DEC-03):** tên khách hàng, MST/CCCD, số điện thoại, email được thay bằng mã giả trước khi gửi lên LLM cloud; không gửi nội dung tài liệu.
- **7.2. Tự động Quét Hạn chót (Deadline Scanner):**
  - Chạy ngầm theo lịch trình định kỳ (Cron Job), tự động phát hiện các Task sắp chạm hạn SLA hoặc quá hạn để bắn cảnh báo cho Luật sư phụ trách và Supervisor. Tin nhắn ra Telegram/Zalo chỉ chứa mã vụ việc, tên task, hạn chót và deep-link (DEC-03).

---

### Phân hệ 8: Giám Sát & Điều Hành Trực Quan (Operations War Room)
- **8.1. Văn phòng Số Trực quan (Virtual Office Floorplan - FEAT-01 / SCR-15):** dành cho vai trò Quản lý — Giám đốc xem mọi phòng, Trưởng phòng xem phòng mình.
  - Mô phỏng không gian phòng làm việc 2.5D Isometric có đầy đủ bàn ghế, nhân sự đang ngồi làm việc, chỉ số công việc trên đầu (`⚡ Đang làm`, `⏳ Chờ xử lý`, `☕ Đang nghỉ ngơi`).
  - Hàng đợi trình duyệt trực tiếp (Approval Lane) trước bàn Trưởng phòng: Nhân sự có hồ sơ chờ duyệt sẽ đứng xếp hàng tại đây kèm huy hiệu `📝 X việc chờ duyệt`.
  - Tương tác Side Drawer xem chi tiết công việc, giao việc nhanh, gửi nhắc nhở và phê duyệt cổng điện tử trực tiếp trên phòng làm việc với cơ chế WebSockets thời gian thực.

---

### Phân hệ 9: Tài liệu Vụ việc (DEC-04)
- **9.1. Kho tài liệu theo vụ việc:** 4 thư mục cố định — Hợp đồng dịch vụ, Giấy tờ thân chủ cung cấp, Đơn từ nộp cơ quan nhà nước/Tòa án, Bản thảo nội bộ. Tệp có thể gắn với task.
- **9.2. Phiên bản:** tải lên bản mới không ghi đè bản cũ; xem lịch sử, tải bất kỳ phiên bản nào; không xoá cứng (chỉ lưu trữ, có ghi audit).
- **9.3. An toàn tệp:** danh sách trắng định dạng (PDF, DOCX, XLSX, JPG, PNG), tối đa 50 MB, quét virus trước khi cho tải xuống, mã hoá AES-256-GCM khi lưu trên NAS, mọi lượt tải xuống ghi audit.
- **9.4. Phân quyền:** theo phạm vi `professional`; riêng thư mục Hợp đồng dịch vụ mở thêm cho phạm vi `finance` (Kế toán cần để xuất hoá đơn).

---

### Phân hệ 10: Báo cáo & Thống kê (DEC-04)
- **10.1. Báo cáo doanh thu thực thu:** theo tháng/quý, theo phòng ban, theo loại vụ việc; so với giá trị hợp đồng.
- **10.2. Báo cáo hoa hồng:** theo nhân sự và kỳ, trạng thái tích luỹ / đã chi; xuất Excel phục vụ chi lương.
- **10.3. Báo cáo vận hành:** số vụ việc theo trạng thái, task quá hạn, thời gian xử lý trung bình theo stage, tỷ lệ chuyển đổi cơ hội.
- **10.4. Phạm vi dữ liệu:** Giám đốc xem toàn hãng; Trưởng phòng xem phòng mình; Kế toán xem báo cáo thu chi và hoa hồng; Luật sư xem số liệu của chính mình.

---

## 2. MA TRẬN PHÂN QUYỀN CHI TIẾT (ROLE-BASED ACCESS CONTROL MATRIX — DEC-01)

Ký hiệu phạm vi Quản lý: **GĐ** = Giám đốc (mọi phòng ban) · **TP** = Trưởng phòng (phòng ban mình quản lý). "Được gán" = được phân công vào vụ việc đó. Chi tiết guard ở `06` §3.3.

| Hành động / Tính năng | Quản trị viên (`ADMIN`) | Quản lý (`MANAGER`) | Kế toán (`ACCOUNTANT`) | Luật sư (`ATTORNEY`) |
| :--- | :---: | :---: | :---: | :---: |
| **Cấu hình hệ thống, người dùng, phòng ban** | **Toàn quyền** | Chỉ xem | Không | Không |
| **Workflow template (tạo, phát hành phiên bản)** | **Toàn quyền** | Chỉ xem | Không | Không |
| **Khách hàng (CRM)** | Không | Xem/Sửa | Chỉ xem | Tạo/Sửa |
| **Cơ hội & chuyển đổi thành vụ việc** | Không | Toàn quyền | Không | Tạo/Sửa của mình, chuyển đổi khi `WON` |
| **Tạo vụ việc & phân công nhân sự** | Không | GĐ: mọi vụ · TP: trong phòng | Không | Không |
| **Xem nội dung chuyên môn vụ việc** | Không (chỉ siêu dữ liệu) | GĐ: mọi vụ · TP: trong phòng · vụ được gán | ❌ Không | Vụ được gán |
| **Tài liệu vụ việc** | Không | Như dòng trên | Chỉ thư mục Hợp đồng | Vụ được gán |
| **Thực hiện & đổi trạng thái task** | Không | Duyệt/Sửa | Không | Task được giao |
| **Duyệt task** | Không | Có | Không | Nếu là `CASE_MANAGER` của vụ |
| **Phê duyệt cổng giai đoạn** | Không | Có (trong phạm vi) | Không | Nếu là `SUPERVISOR` của vụ |
| **Đề xuất bổ sung task/stage (template Linh hoạt)** | Không | Có | Không | Vụ được gán |
| **Phê duyệt bổ sung task/stage** | Không | **Có** (trong phạm vi) | Không | Không |
| **Tạo & cấu hình đợt thu, tỷ lệ hoa hồng** | Không | Có (trong phạm vi) | Chỉ xem | Đề xuất nếu là `CASE_MANAGER` |
| **Xác nhận thu tiền (sau đối soát MISA)** | Không | Không | **Chuyên trách** | Không |
| **Báo cáo doanh thu & hoa hồng** | Không | GĐ: toàn hãng · TP: trong phòng | Báo cáo thu chi & hoa hồng | Của cá nhân |
| **Văn phòng số** | Không | GĐ: mọi phòng · TP: phòng mình | Không | Không |
| **Nhật ký kiểm toán** | **Toàn quyền xem** | Không | Không | Không |
| **Trợ lý AI** | Siêu dữ liệu hệ thống | Trong phạm vi | Dữ liệu tài chính | Vụ được gán & CRM của mình |
