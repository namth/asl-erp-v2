# 04. CÁC LUỒNG NGƯỜI DÙNG CHI TIẾT (USER FLOWS & STATE MACHINES)

## 1. LUỒNG 1: TỪ KHÁCH HÀNG TIỀM NĂNG TỚI KHỞI TẠO VỤ VIỆC (LEAD-TO-CASE CONVERSION)

```mermaid
sequenceDiagram
    autonumber
    actor Sales as Chuyên viên Sales
    actor Client as Khách hàng
    participant CRM as Phân hệ CRM
    participant CaseMod as Phân hệ Vụ việc (Module 3)
    actor Partner as Managing Partner / Supervisor

    Sales->>CRM: Nhập thông tin Khách hàng & Cơ hội (SCR-03, SCR-05)
    Sales->>Client: Tư vấn, gửi đề xuất dịch vụ & báo giá
    Client-->>Sales: Ký hợp đồng dịch vụ pháp lý & chuyển tiền tạm ứng
    Sales->>CRM: Chuyển trạng thái Cơ hội sang "Đã ký hợp đồng" (Won)
    Sales->>CRM: Bấm nút "Chuyển đổi thành Vụ việc chính thức"
    CRM->>CaseMod: Tự động khởi tạo Case mới kèm tổng giá trị hợp đồng
    CaseMod->>Partner: Bắn thông báo có Vụ việc mới cần phân công nhân sự
    Partner->>CaseMod: Gán Supervisor, Case Manager, Executor, Assistant (SCR-07)
    CaseMod-->>Partner: Khởi tạo xong Workspace vụ việc với đầy đủ vai trò
```

---

## 2. LUỒNG 2: THIẾT LẬP VỤ VIỆC & ÁP DỤNG QUY TRÌNH ĐỘNG (STRICT WORKFLOW INSTANTIATION)

```mermaid
flowchart TD
    StartCase([Khởi tạo Vụ việc mới]) --> SelectType[Chọn Phân ngành Pháp lý - Matter Type]
    SelectType --> FetchTemplate[(Lấy Workflow Template tương ứng)]
    FetchTemplate --> ApplyStrict[Áp dụng Nguyên tắc Khung cứng - Strict Governance]
    
    ApplyStrict --> InitStages[Tạo danh sách các Giai đoạn - Stages tuần tự]
    InitStages --> InitTasks[Tạo danh sách Tác vụ con - Tasks mặc định]
    InitTasks --> BindDependencies[Khóa các Ràng buộc Tiên quyết - Task Dependencies]
    BindDependencies --> SetupGates[Thiết lập các Cổng Phê duyệt - Approval Gates]
    SetupGates --> RenderFields[Tạo Form nhập liệu Trường động - JSONB theo phân ngành]
    RenderFields --> ReadyCase([Sẵn sàng cho Luật sư tác nghiệp])
```

---

## 3. LUỒNG 3: THỰC HIỆN TÁC VỤ & KIỂM SOÁT PHỤ THUỘC (TASK EXECUTION & DEPENDENCY ENFORCEMENT)

1. **Truy cập:** Luật sư phụ trách (`EXECUTOR`) truy cập vào **SCR-09 (Bảng tác vụ Kanban)** của vụ việc.
2. **Kiểm tra Ràng buộc Tiên quyết (Pre-condition Guard):**
   - Nếu Luật sư muốn kéo Task B từ `Chưa bắt đầu` sang `Đang làm`, hệ thống tự động kiểm tra bảng `TaskDependencies`.
   - Nếu Task A tiên quyết chưa đạt trạng thái `Đã hoàn thành`, hệ thống từ chối hành động và hiển thị cảnh báo: *"Không thể bắt đầu Task B. Bạn phải hoàn tất và được nghiệm thu Task A trước!"*.
3. **Thực hiện & Đính kèm Văn bản:**
   - Luật sư thực hiện công việc, tải tài liệu dự thảo (.docx, .pdf) lên mục Tệp đính kèm.
   - Nhấn nút "Gửi Phê duyệt" -> Trạng thái Task chuyển sang `Chờ phê duyệt`.
4. **Phê duyệt:**
   - `CASE_MANAGER` hoặc `SUPERVISOR` nhận thông báo chuông.
   - Truy cập **SCR-10 (Modal Phê duyệt)** để đọc tài liệu:
     - Nếu *Chấp thuận*: Task chuyển thành `Đã hoàn thành`, giải phóng các Task phụ thuộc tiếp theo.
     - Nếu *Từ chối / Yêu cầu sửa*: Nhập phản hồi lý do, Task quay về trạng thái `Đang làm`.

---

## 4. LUỒNG 4: PHỐI HỢP KẾ TOÁN MISA & MỞ KHÓA QUY TRÌNH (MISA HUMAN-IN-THE-LOOP FLOW)

```mermaid
sequenceDiagram
    autonumber
    actor Lawyer as Luật sư Thực hiện
    participant CaseEngine as Động cơ Quy trình ERP
    actor Accountant as Kế toán Nghiệp vụ
    participant MISA as Phần mềm MISA bên ngoài
    participant Notify as Cổng Thông báo

    Lawyer->>CaseEngine: Hoàn tất Task kỹ thuật (VD: "Soạn xong hồ sơ đăng ký nhãn hiệu")
    CaseEngine->>CaseEngine: Kiểm tra thấy Task này kích hoạt Đợt thu tiền 2 (Milestone 2)
    CaseEngine->>CaseEngine: TẠM KHÓA Giai đoạn tiếp theo (Block Next Stage)
    CaseEngine->>Accountant: Phát sinh Tác vụ Tài chính vào SCR-11 (MISA Inbox)
    CaseEngine->>Notify: Bắn thông báo Telegram/Email có đợt thu mới
    
    Accountant->>MISA: Mở MISA kiểm tra dòng tiền ngân hàng thực tế
    Note over Accountant,MISA: Khách hàng đã chuyển khoản thành công & đã xuất hóa đơn trên MISA
    
    Accountant->>CaseEngine: Truy cập SCR-11, bấm "Xác nhận đã thu tiền/Đã xuất HĐ"
    Accountant->>CaseEngine: Nhập Mã GD Ngân hàng & Số Hóa đơn MISA
    CaseEngine->>CaseEngine: Mở khóa (UNBLOCK) cho Luật sư tiếp tục quy trình
    CaseEngine->>Notify: Bắn thông báo cho Luật sư "Tiền đã về, tiếp tục nộp đơn!"
```

---

## 5. LUỒNG 5: CHIẾT TÍNH HOA HỒNG TỰ ĐỘNG THEO DÒNG TIỀN THỰC THU (CASH-BASIS COMMISSION)

```mermaid
flowchart TD
    AcctConfirm[Kế toán xác nhận Milestone đã thu X triệu VNĐ] --> TriggerEngine[Kích hoạt Động cơ Tính Hoa hồng]
    
    TriggerEngine --> FetchSchema[(Đọc Commission Schema của Vụ việc)]
    FetchSchema --> CalcSales["Tính hoa hồng Sales: (X triệu * % Sales)"]
    FetchSchema --> CalcSuper["Tính hoa hồng Quản lý: (X triệu * % Supervisor/Manager)"]
    FetchSchema --> CalcExec["Tính hoa hồng Thực hiện: (X triệu * % Phân bổ cho các Task hoàn tất trong đợt)"]
    
    CalcSales --> GenTx1[Tạo Giao dịch Hoa hồng: Sales Person]
    CalcSuper --> GenTx2[Tạo Giao dịch Hoa hồng: Manager / Supervisor]
    CalcExec --> GenTx3[Tạo Giao dịch Hoa hồng: Các Luật sư thực hiện task]
    
    GenTx1 & GenTx2 & GenTx3 --> UpdateLedger[(Ghi vào Sổ cái Hoa hồng PostgreSQL)]
    UpdateLedger --> NotifyUsers[Gửi thông báo số dư hoa hồng mới qua Web & Telegram]
```

---

## 6. LUỒNG 6: CẢNH BÁO ĐA KÊNH & TRỢ LÝ ẢO AI (ALERTS & AI ASSISTANT)

1. **Quét định kỳ (Background Scanner):**
   - Celery Worker chạy ngầm mỗi 30 phút, quét bảng `CaseTasks` và `Cases`.
   - Tìm kiếm các Task có `due_date - now() <= 24 hours` hoặc đã quá hạn mà chưa `COMPLETED`.
2. **Đẩy cảnh báo 1 chiều kèm Deep-link:**
   - Hệ thống tạo bản ghi thông báo nội bộ và đẩy qua WebSockets tới chuông trên Web App.
   - Gửi tin nhắn tự động qua **Telegram Bot** và **Zalo OA**:
     - *Nội dung:* `"[CẢNH BÁO HẠN CHÓT] Task 'Nộp bản giải trình SHTT' cho vụ việc ASL-2026-09 sẽ hết hạn trong 4 giờ nữa. Bấm vào liên kết sau để xử lý: https://erp.asllaw.vn/cases/102/tasks/504"`
3. **Tương tác qua Trợ lý AI (SCR-14):**
   - Luật sư mở khung AI Chat Drawer, gõ câu hỏi: *"Hôm nay tôi có những task nào cần hoàn thành trước 17h?"*.
   - Trợ lý AI thực thi Tool Calling `get_user_tasks(user_id, deadline_before="2026-10-27T17:00:00")`, định dạng câu trả lời ngắn gọn kèm link điều hướng trực tiếp tới từng task.
