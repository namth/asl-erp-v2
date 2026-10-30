# 09. QUY CHUẨN KỸ THUẬT & CẤU TRÚC MÃ NGUỒN (ENGINEERING CONVENTIONS)

## 1. CẤU TRÚC THƯ MỤC DỰ ÁN (MONOREPO DIRECTORY STRUCTURE)

```text
qlcvasl-v2/
├── frontend/                     # Ứng dụng Next.js 15 (App Router & React 19)
│   ├── public/                   # Static assets, logos, favicon
│   ├── src/
│   │   ├── app/                  # Next.js App Router (Layouts & Pages)
│   │   │   ├── (auth)/login/     # SCR-01: Đăng nhập
│   │   │   ├── (dashboard)/      # Layout chung có TopBar & Collapsible Sidebar
│   │   │   │   ├── page.tsx      # SCR-02: Personal Dashboard
│   │   │   │   ├── crm/          # SCR-03, SCR-04, SCR-05: Khách hàng & Cơ hội
│   │   │   │   ├── cases/        # SCR-07, SCR-08, SCR-09: Vụ việc & Kanban
│   │   │   │   ├── accounting/   # SCR-11: Bàn làm việc Kế toán MISA
│   │   │   │   ├── finance/      # SCR-12: Thu tiền & Bảng hoa hồng
│   │   │   │   └── admin/        # SCR-06, SCR-13: Workflow Builder & Audit Logs
│   │   │   └── api/              # Proxy / Next.js internal endpoints nếu cần
│   │   ├── components/           # UI Components tái sử dụng
│   │   │   ├── ui/               # Shadcn UI primitives (Button, Dialog, Table...)
│   │   │   ├── cases/            # CaseCard, StageTimeline, ApprovalModal
│   │   │   ├── kanban/           # KanbanBoard, KanbanColumn, TaskCard
│   │   │   └── ai/               # AiChatDrawer, MessageBubble
│   │   ├── hooks/                # Custom React Hooks (useAuth, useNeedToKnow)
│   │   ├── lib/                  # Utilities, API client (Ky/Axios), formatter
│   │   ├── stores/               # Zustand stores (useSidebarStore, useAiStore)
│   │   └── types/                # TypeScript Interfaces & Zod Schemas
│   ├── package.json
│   └── tailwind.config.ts
│
├── backend/                      # Dịch vụ FastAPI Core (Python 3.11+)
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/               # Router endpoints phân theo domain nghiệp vụ
│   │   │       ├── auth.py
│   │   │       ├── crm.py
│   │   │       ├── workflows.py
│   │   │       ├── cases.py
│   │   │       ├── accounting.py
│   │   │       ├── finance.py
│   │   │       └── ai_agent.py
│   │   ├── core/                 # Cấu hình config, security, JWT, Redis client
│   │   ├── guards/               # Middleware kiểm tra Need-to-know qua Neo4j
│   │   ├── models/               # SQLAlchemy 2.0 ORM Models
│   │   ├── schemas/              # Pydantic v2 DTOs (Request / Response validation)
│   │   ├── services/             # Business Logic (Commission, Workflow, MISA)
│   │   ├── repositories/         # Tương tác PostgreSQL & Neo4j Cypher queries
│   │   └── workers/              # Celery tasks (Quét deadline, gửi Telegram/Zalo)
│   ├── alembic/                  # Database Migrations scripts
│   ├── requirements.txt          # Python dependencies
│   └── main.py                   # Điểm khởi chạy FastAPI ASGI application
│
├── docker/                       # Cấu hình triển khai On-Premise
│   ├── docker-compose.yml        # Orchestration toàn bộ 7 containers
│   ├── Dockerfile.frontend
│   ├── Dockerfile.backend
│   └── nginx/nginx.conf          # Cấu hình Reverse Proxy & SSL
│
├── docs/                         # Bộ 13 tài liệu kiến trúc chuẩn mực
└── CONTEXT.md                    # Root Context tóm tắt hệ thống cho AI Agent
```

---

## 2. QUY CHUẨN ĐẶT TÊN (NAMING CONVENTIONS)

| Đối tượng | Quy chuẩn | Ví dụ mẫu |
| :--- | :--- | :--- |
| **Thư mục & File Web (Frontend)** | `kebab-case` | `case-workspace.tsx`, `use-task-dependency.ts` |
| **Component React (Frontend)** | `PascalCase` | `CaseHeader`, `TaskKanbanCard`, `ApprovalModal` |
| **Biến & Hàm TypeScript** | `camelCase` | `calculateCommissionAmount()`, `isTaskLocked` |
| **TypeScript Types & Interfaces** | `PascalCase` | `CaseAssignment`, `BillingMilestoneDTO` |
| **File & Package Python (Backend)** | `snake_case` | `commission_service.py`, `workflow_engine.py` |
| **Lớp (Class) & Model Python** | `PascalCase` | `CaseTask`, `AuditLogRepository`, `LoginRequest` |
| **Hàm & Biến Python** | `snake_case` | `verify_need_to_know()`, `actual_received_amount` |
| **Hằng số (Constants)** | `UPPER_SNAKE_CASE` | `JWT_SECRET_KEY`, `MAX_FAILED_LOGIN_ATTEMPTS` |
| **Bảng Cơ sở dữ liệu (PostgreSQL)** | `snake_case` (số nhiều) | `cases`, `case_tasks`, `commission_transactions` |
| **Khóa ngoại (Foreign Keys)** | `snake_case` (số ít + `_id`) | `case_id`, `client_id`, `accountant_id` |
| **Đỉnh đồ thị (Neo4j Labels)** | `PascalCase` (số ít) | `:User`, `:Case`, `:Department`, `:Client` |
| **Cạnh đồ thị (Neo4j Relationships)**| `UPPER_SNAKE_CASE` | `:ASSIGNED_TO`, `:BELONGS_TO`, `:FOR_CLIENT` |

---

## 3. NGUYÊN TẮC QUẢN LÝ TRẠNG THÁI (STATE MANAGEMENT PHILOSOPHY)
1. **Server State là tối cao (Single Source of Truth):**
   - Tuyệt đối không lưu bản sao của danh sách vụ việc hoặc tác vụ trong Local Storage hoặc Global Redux store dễ gây sai lệch dữ liệu giữa các luật sư.
   - Sử dụng **TanStack Query (React Query)** để quản lý bộ nhớ đệm (Cache), tự động làm mới khi cửa sổ trình duyệt active (Refetch on window focus) và vô hiệu hóa cache (Invalidate queries) ngay sau khi có mutation (Ví dụ: Kéo xong thẻ Kanban -> Invalidate cache của Case đó).
2. **Client State chỉ phục vụ UI thuần túy:**
   - Sử dụng **Zustand** siêu nhẹ để lưu trạng thái cục bộ của giao diện:
     - `useSidebarStore`: Thu gọn / mở rộng menu Sidebar.
     - `useAiDrawerStore`: Đóng / mở khung trò chuyện với Trợ lý AI.
     - `useKanbanFilterStore`: Trạng thái lọc thẻ công việc theo nhân sự/độ ưu tiên.

---

## 4. QUY TRÌNH QUẢN LÝ MÃ NGUỒN (GIT WORKFLOW & CONVENTIONS)
- **Quy tắc phân nhánh (Branching Model):**
  - `main`: Nhánh ổn định tuyệt đối, sẵn sàng triển khai trên máy chủ On-Premise.
  - `develop`: Nhánh tích hợp tính năng kiểm thử nội bộ.
  - `feat/<module>-<feature-name>`: Nhánh phát triển tính năng (VD: `feat/crm-lead-conversion`, `feat/misa-inbox`).
  - `fix/<ticket-id>-<bug-name>`: Nhánh sửa lỗi (VD: `fix/sec-01-need-to-know-bypass`).
- **Quy chuẩn thông điệp Commit (Conventional Commits):**
  - Mẫu cú pháp: `<type>(<scope>): <mô tả ngắn bằng tiếng Việt hoặc tiếng Anh>`
  - Ví dụ chuẩn:
    - `feat(workflow): implement strict stage transition guard in case engine`
    - `fix(commission): resolve rounding issue when calculating multi-task payouts`
    - `sec(auth): enforce argon2id password hashing and redis token revocation`
    - `docs(api): update swagger contract for misa payment confirmation endpoint`
