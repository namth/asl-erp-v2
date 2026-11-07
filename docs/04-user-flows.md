# 04. CÁC LUỒNG NGƯỜI DÙNG CHI TIẾT (USER FLOWS & STATE MACHINES)

## 1. LUỒNG 1: TỪ KHÁCH HÀNG TIỀM NĂNG TỚI KHỞI TẠO VỤ VIỆC (LEAD-TO-CASE CONVERSION)

```mermaid
sequenceDiagram
    autonumber
    actor Sales as Luật sư / Người mang khách về
    actor Client as Khách hàng
    participant CRM as Phân hệ CRM
    participant CaseMod as Phân hệ Vụ việc (Module 3)
    actor Partner as Quản lý (Giám đốc / Trưởng phòng)

    Sales->>CRM: Nhập thông tin Khách hàng & Cơ hội (SCR-03, SCR-05)
    CRM-->>Sales: Cảnh báo nếu trùng bên đối tụng của vụ việc đang hiệu lực (xung đột lợi ích)
    Sales->>Client: Tư vấn, gửi đề xuất dịch vụ & báo giá
    Client-->>Sales: Ký hợp đồng dịch vụ pháp lý & chuyển tiền tạm ứng
    Sales->>CRM: Chuyển trạng thái Cơ hội sang "Đã ký hợp đồng" (Won)
    Sales->>CRM: Bấm nút "Chuyển đổi thành Vụ việc chính thức"
    CRM->>CaseMod: Tạo Case INITIALIZING: mã ASL-YYYY-XX-NNNN, phiên bản template, lộ trình đợt thu, tỷ lệ hoa hồng mặc định
    CaseMod->>Partner: Bắn thông báo có Vụ việc mới cần phân công nhân sự
    Partner->>CaseMod: Gán Supervisor, Case Manager, Executor, Assistant (SCR-07)
    CaseMod-->>Partner: Đủ 1 Case Manager + ≥1 Executor → vụ việc ACTIVE, đợt tạm ứng chuyển sang chờ thu
```

---

## 2. LUỒNG 2: THIẾT LẬP VỤ VIỆC & ÁP DỤNG QUY TRÌNH ĐỘNG (STRICT WORKFLOW INSTANTIATION)

```mermaid
flowchart TD
    StartCase([Khởi tạo Vụ việc mới]) --> SelectType[Chọn Phân ngành Pháp lý - Matter Type]
    SelectType --> FetchTemplate[(Lấy phiên bản Workflow Template đang phát hành)]
    FetchTemplate --> ApplyStrict[Ghi chế độ quy trình: Khung cứng STRICT / Linh hoạt FLEXIBLE]
    
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
   - Nếu Luật sư muốn kéo Task B từ `Chưa bắt đầu` sang `Đang làm`, hệ thống kiểm tra `case_task_dependencies` và trạng thái stage (stage chờ duyệt/chờ thu tiền thì bị khoá).
   - Nếu Task A tiên quyết chưa đạt trạng thái `Đã hoàn thành`, hệ thống từ chối hành động và hiển thị cảnh báo: *"Không thể bắt đầu Task B. Bạn phải hoàn tất và được nghiệm thu Task A trước!"*.
3. **Thực hiện & Đính kèm Văn bản:**
   - Luật sư thực hiện công việc, tải tài liệu dự thảo (.docx, .pdf) lên mục Tệp đính kèm.
   - Nhấn nút "Gửi Phê duyệt" -> Trạng thái Task chuyển sang `Chờ phê duyệt`.
4. **Phê duyệt:**
   - `CASE_MANAGER` hoặc `SUPERVISOR` nhận thông báo chuông.
   - Truy cập **SCR-10 (Modal Phê duyệt)** để đọc tài liệu:
     - Nếu *Chấp thuận*: Task chuyển thành `Đã hoàn thành`, giải phóng các Task phụ thuộc tiếp theo.
     - Nếu *Từ chối / Yêu cầu sửa*: Nhập phản hồi lý do (bắt buộc), Task quay về trạng thái `Đang làm`.
     - Người duyệt không được là người gửi duyệt.

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
    Accountant->>CaseEngine: Nhập Mã GD Ngân hàng, Số Hóa đơn MISA, số tiền thực về
    CaseEngine->>CaseEngine: Tính hoa hồng trên số tiền lần này
    alt Tổng thực thu < số phải thu
        CaseEngine->>CaseEngine: Đợt thu PARTIALLY_PAID, giai đoạn vẫn khoá
    else Đã thu đủ
        CaseEngine->>CaseEngine: Đợt thu PAID_CONFIRMED, mở khóa (UNBLOCK) giai đoạn tiếp theo
    end
    CaseEngine->>Notify: Thông báo Luật sư (chỉ mã vụ việc + link): giai đoạn đã mở khoá
```

---

## 5. LUỒNG 5: CHIẾT TÍNH HOA HỒNG TỰ ĐỘNG THEO DÒNG TIỀN THỰC THU (CASH-BASIS COMMISSION)

```mermaid
flowchart TD
    AcctConfirm[Kế toán xác nhận một khoản thực về X VNĐ - có thể là thu một phần] --> TriggerEngine[Kích hoạt Động cơ Tính Hoa hồng]
    
    TriggerEngine --> FetchSchema[(Đọc Commission Schema của Vụ việc)]
    FetchSchema --> CalcSales["Hoa hồng phát triển thị trường: X * R_o% → người mang khách về"]
    FetchSchema --> CalcSuper["Tính hoa hồng Quản lý: (X triệu * % Supervisor/Manager)"]
    FetchSchema --> CalcExec["Quỹ thực hiện: X * R_e% + quỹ đang dồn → chia theo trọng số task COMPLETED chưa phân bổ; không có task thì dồn sang lần sau"]
    
    CalcSales --> GenTx1[Tạo Giao dịch Hoa hồng: Người mang khách về]
    CalcSuper --> GenTx2[Tạo Giao dịch Hoa hồng: Manager / Supervisor]
    CalcExec --> GenTx3[Tạo Giao dịch Hoa hồng: Các Luật sư thực hiện task]
    
    GenTx1 & GenTx2 & GenTx3 --> UpdateLedger[(Ghi vào Sổ cái Hoa hồng PostgreSQL)]
    UpdateLedger --> NotifyUsers[Gửi thông báo số dư hoa hồng mới qua Web & Telegram]
```

---

## 6. LUỒNG 6: CẢNH BÁO ĐA KÊNH & TRỢ LÝ ẢO AI (ALERTS & AI ASSISTANT)

1. **Quét định kỳ (Background Scanner):**
   - Celery Beat kích hoạt worker mỗi 30 phút, quét `case_tasks` của vụ việc `ACTIVE`.
   - Tìm Task còn ≤ 24 giờ làm việc tới `due_at` hoặc đã quá hạn mà chưa `COMPLETED` (quy tắc leo thang ở `12` §4.2).
2. **Đẩy cảnh báo 1 chiều kèm Deep-link:**
   - Hệ thống tạo bản ghi thông báo nội bộ và đẩy qua WebSockets tới chuông trên Web App.
   - Gửi tin nhắn tự động qua **Telegram Bot** và **Zalo OA**:
     - *Nội dung (tối thiểu hoá — DEC-03):* `"[HẠN CHÓT] ASL-2026-TM-0045 · Nộp bản giải trình · hạn 17:00 28/10 (còn 4 giờ). Xử lý: https://erp.asllaw.vn/cases/8f3a…/tasks/t402"` — không có tên khách hàng hay tên vụ việc.
3. **Tương tác qua Trợ lý AI (SCR-14):**
   - Luật sư mở khung AI Chat Drawer, gõ câu hỏi: *"Hôm nay tôi có những task nào cần hoàn thành trước 17h?"*.
   - Trợ lý AI thực thi Tool Calling `get_urgent_tasks(days_ahead=0)` trong phạm vi quyền của người hỏi; dữ liệu định danh khách hàng được thay bằng mã giả trước khi gửi lên LLM; câu trả lời kèm link điều hướng tới từng task.

---

## 7. LUỒNG 7: BỔ SUNG TASK NGOÀI QUY TRÌNH MẪU (WORKFLOW CHANGE REQUEST — DEC-07)

```mermaid
sequenceDiagram
    autonumber
    actor Lawyer as Luật sư được gán
    participant Engine as Động cơ Quy trình
    actor Manager as Quản lý phụ trách
    Lawyer->>Engine: Đề xuất bổ sung task/stage + lý do (VD: Tòa yêu cầu bổ sung bản dịch)
    alt Template STRICT
        Engine-->>Lawyer: Từ chối 403 STRICT_GOVERNANCE_VIOLATION
    else Template FLEXIBLE
        Engine->>Manager: Tạo yêu cầu duyệt, thông báo
        alt Chấp thuận
            Manager->>Engine: APPROVE
            Engine->>Engine: Tạo task/stage is_ad_hoc, ghi audit
            Engine-->>Lawyer: Task mới xuất hiện trên Kanban với nhãn "Bổ sung"
        else Từ chối
            Manager->>Engine: REJECT + lý do
            Engine-->>Lawyer: Thông báo lý do từ chối
        end
    end
```

---

## 8. LUỒNG 8: ĐĂNG NHẬP & XÁC THỰC 2 LỚP (DEC-02)

1. Nhập email + mật khẩu nội bộ.
2. Tài khoản chuyển từ hệ thống cũ (`must_reset_password`) → bắt buộc đặt mật khẩu mới trước khi vào hệ thống.
3. Vai trò Quản trị viên / Quản lý / Kế toán chưa bật 2FA → bắt buộc quét mã QR bằng ứng dụng xác thực, nhập mã 6 số để kích hoạt, lưu 10 mã khôi phục.
4. Tài khoản đã bật 2FA → nhập mã 6 số (hoặc mã khôi phục).
5. Sai mật khẩu/mã quá 5 lần trong 15 phút → khoá 30 phút, thông báo Quản trị viên.
