# ERP ASL LAW - CONTEXT DỰ ÁN (ROOT CONTEXT)

> **Dành cho AI Agent:** Đọc tài liệu này đầu tiên trước khi thực hiện bất kỳ tác vụ lập trình, tra cứu hoặc sửa lỗi nào trong kho mã nguồn.

---

## 1. THÔNG TIN CỐT LÕI (CORE IDENTITY)
- **Tên dự án:** ERP ASL LAW (Hệ thống Quản trị Doanh nghiệp Luật Toàn diện).
- **Khách hàng / Chủ quản:** Hãng luật ASL LAW.
- **Phạm vi hệ thống:** **Internal Enterprise ERP** dành cho đội ngũ nội bộ (Managing Partner, Supervisor, Case Manager, Lawyer, Assistant, Accountant, Sales). Kiến trúc chuẩn bị sẵn sàng module mở rộng Cổng Khách hàng (Client Portal) ở Phase 2.
- **Hạ tầng triển khai:** **Máy chủ vật lý nội bộ văn phòng (On-Premise Server tại ASL Law)** qua cụm Container Docker Compose. Mọi dữ liệu hồ sơ thân chủ được lưu trữ an toàn tại chỗ, sao lưu định kỳ vào NAS nội bộ.

---

## 2. KIẾN TRÚC KỸ THUẬT & TECH STACK
- **Lớp Frontend:** **Next.js 15 (App Router, React 19, TypeScript)** + Tailwind CSS + Shadcn UI / Radix primitives + Lucide Icons + TanStack Query & Table.
- **Lớp Backend:** **FastAPI (Python 3.11+)** + Pydantic v2 + SQLAlchemy 2.0 Async + Alembic + Celery Worker & Beat.
- **Cơ sở dữ liệu kép (Dual-Database):**
  - **PostgreSQL 16:** Lưu trữ dữ liệu giao dịch nghiệp vụ chính, Sổ cái hoa hồng, Audit Logs bất biến và các cột `JSONB` lưu trường dữ liệu động theo phân ngành pháp lý.
  - **Neo4j 5 (Graph DB):** Quản lý đồ thị phân quyền bảo mật nâng cao (**Graph RBAC**) theo nguyên tắc **Need-to-Know** và kiểm soát xung đột lợi ích (Conflict of Interest).
- **Bộ nhớ đệm & Broker:** **Redis 7** (Quản lý phiên, Token Revocation Blocklist, Celery Task Broker, Pub/Sub WebSockets).
- **Tích hợp Ngoại vi:** Telegram Bot API & Zalo OA (Cảnh báo đẩy 1 chiều kèm Deep-link an toàn), LLM API (Google Gemini / OpenAI) cho Trợ lý ảo AI Metadata & Workflow.

---

## 3. CÁC QUY TẮC NGHIỆP VỤ & NGUYÊN TẮC BẤT BIẾN (INVARIANTS)
1. **Khung cứng Tuyệt đối (Strict Governance Workflow):**
   - Mọi Vụ việc khi chạy phải tuân thủ 100% theo Workflow Template đã được Admin cấu hình. Tuyệt đối không cho phép luật sư tự ý thêm/bớt stage ngoài chuẩn hóa.
2. **Bảo mật "Need-to-know" phân cấp qua Đồ thị Neo4j:**
   - Nhân sự chỉ được xem Vụ việc nếu được phân công trực tiếp (`:ASSIGNED_TO`) hoặc là Leader quản lý ban đó (`:LEADS`).
   - Kế toán chỉ xem thông tin tài chính/thu tiền; Sales chỉ xem tiến độ thu tiền; không ai được xem tài liệu tranh tụng trái thẩm quyền.
3. **Quy trình Phối hợp Kế toán MISA (Human-in-the-Loop):**
   - Hệ thống tự động phát Tác vụ Tài chính vào hòm thư Kế toán trên ERP khi vụ việc chạm mốc thu tiền.
   - Kế toán kiểm tra dòng tiền thực tế trên MISA bên ngoài -> Bấm "Xác nhận đã thu tiền" kèm số hóa đơn và mã GD ngân hàng trên ERP -> Hệ thống tự động mở khóa quy trình kỹ thuật cho luật sư.
4. **Chiết tính Hoa hồng theo Dòng tiền Thực thu (Cash-basis):**
   - Kích hoạt tính và phân bổ hoa hồng ngay lập tức khi Kế toán xác nhận Milestone đã thu tiền thành công. Phân bổ minh bạch cho Sales, Quản lý và Luật sư thực hiện task.
5. **Xác thực Nội bộ Độc lập:**
   - Quản lý tài khoản và mật khẩu nội bộ độc lập trong ERP (băm Argon2id), thu hồi quyền và đăng xuất tức thì qua Redis Blocklist.
6. **Nhật ký Kiểm toán Bất biến (Immutable Audit Logs):**
   - Bảng `audit_logs` chỉ cho phép `INSERT` và `SELECT`. Tuyệt đối không được phép `UPDATE` hay `DELETE`.

---

## 4. BẢN ĐỒ THƯ MỤC TÀI LIỆU CHI TIẾT (/DOCS MAP)
Khi cần tham chiếu sâu bất kỳ khía cạnh nào, hãy đọc file tài liệu tương ứng:
- [01-overview.md](file:///Users/namtran/Local%20Sites/qlcvasl-v2/docs/01-overview.md): Mục tiêu, nỗi đau cốt lõi, đối tượng sử dụng và phạm vi dự án.
- [02-modules-and-features.md](file:///Users/namtran/Local%20Sites/qlcvasl-v2/docs/02-modules-and-features.md): Chi tiết 8 phân hệ nghiệp vụ & Ma trận phân quyền chi tiết (RBAC).
- [03-screens-and-ui.md](file:///Users/namtran/Local%20Sites/qlcvasl-v2/docs/03-screens-and-ui.md): Bảng kiểm kê 15 màn hình (SCR-01 đến SCR-15), 4 trạng thái UI, Stitch design prompts.
- [04-user-flows.md](file:///Users/namtran/Local%20Sites/qlcvasl-v2/docs/04-user-flows.md): Luồng di chuyển chi tiết: Lead-to-Case, Kanban Task, MISA Flow, Cash-basis Commission.
- [05-architecture.md](file:///Users/namtran/Local%20Sites/qlcvasl-v2/docs/05-architecture.md): Sơ đồ kiến trúc tổng thể, hạ tầng On-Premise, mạng nội bộ và backup NAS.
- [06-database-schema.md](file:///Users/namtran/Local%20Sites/qlcvasl-v2/docs/06-database-schema.md): Sơ đồ ERD PostgreSQL, cấu trúc các bảng và mô hình đồ thị Neo4j kèm Cypher queries.
- [07-api-contracts.md](file:///Users/namtran/Local%20Sites/qlcvasl-v2/docs/07-api-contracts.md): Hợp đồng dữ liệu API `/api/v1` (Endpoints, Payloads mẫu, mã lỗi).
- [08-integrations.md](file:///Users/namtran/Local%20Sites/qlcvasl-v2/docs/08-integrations.md): Tích hợp MISA Human-in-the-Loop, Telegram Bot, Zalo OA, Gemini AI và NAS Storage.
- [09-conventions.md](file:///Users/namtran/Local%20Sites/qlcvasl-v2/docs/09-conventions.md): Quy chuẩn Monorepo, cấu trúc thư mục, Naming Conventions, Zustand/TanStack Query.
- [10-env-and-security.md](file:///Users/namtran/Local%20Sites/qlcvasl-v2/docs/10-env-and-security.md): Danh sách biến môi trường `.env.example` và chính sách bảo mật đa tầng.
- [11-tasks.md](file:///Users/namtran/Local%20Sites/qlcvasl-v2/docs/11-tasks.md): 6 Milestones và danh sách 15 Tickets/Tasks chi tiết kèm Tiêu chuẩn Nghiệm thu (DoD).
- [12-business-rules.md](file:///Users/namtran/Local%20Sites/qlcvasl-v2/docs/12-business-rules.md): Máy trạng thái (State Machines), Ràng buộc chuyển trạng thái, Công thức hoa hồng & Quy tắc Floorplan.
- [13-test-cases-and-qa.md](file:///Users/namtran/Local%20Sites/qlcvasl-v2/docs/13-test-cases-and-qa.md): Ma trận 19 Test Cases kiểm thử tự động và tiêu chuẩn bàn giao QA.
- [docs/features/virtual-office-floorplan.md](file:///Users/namtran/Local%20Sites/qlcvasl-v2/docs/features/virtual-office-floorplan.md): Đặc tả chi tiết tính năng FEAT-01: Văn phòng số trực quan (Virtual Office Floorplan SCR-15).
