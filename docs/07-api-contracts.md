# 07. HỢP ĐỒNG DỮ LIỆU API (API CONTRACTS & SPECIFICATIONS)

## 1. QUY CHUẨN THIẾT KẾ REST API
- **Base URL:** `/api/v1`
- **Định dạng dữ liệu:** `application/json; charset=utf-8`
- **Cơ chế xác thực:** JWT Bearer Token trong Header `Authorization: Bearer <token>` hoặc truyền an toàn qua HttpOnly Cookie `access_token`.
- **Cấu trúc phản hồi chuẩn (Standard Response Envelope):**

```json
{
  "success": true,
  "data": { ... },
  "message": "Thao tác thành công",
  "meta": {
    "page": 1,
    "limit": 20,
    "total_records": 105,
    "total_pages": 6
  }
}
```

- **Cấu trúc phản hồi khi có lỗi (Standard Error Envelope):**

```json
{
  "success": false,
  "error": {
    "code": "DEPENDENCY_CONSTRAINT_VIOLATION",
    "message": "Không thể hoàn thành Task B khi Task A tiên quyết chưa được duyệt",
    "details": {
      "blocked_task_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "prerequisite_task_id": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d"
    }
  }
}
```

---

## 2. DANH SÁCH ENDPOINTS CỐT LÕI

### 2.1. Nhóm Xác thực & Phiên làm việc (Authentication)

#### `POST /api/v1/auth/login`
- **Mô tả:** Đăng nhập bằng Email và Mật khẩu nội bộ.
- **Request Body:**
```json
{
  "email": "luatsutruong@asllaw.vn",
  "password": "SecurePassword123@"
}
```
- **Response 200 OK:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsIn...",
    "token_type": "bearer",
    "expires_in": 1800,
    "user": {
      "id": "c1f8a29e-1f2e-4b7b-8d0a-5c2f3b9d0e1a",
      "email": "luatsutruong@asllaw.vn",
      "full_name": "Luật sư Nguyễn Văn Trường",
      "system_role": "LAWYER"
    }
  }
}
```

---

### 2.2. Nhóm CRM & Chuyển đổi Cơ hội

#### `POST /api/v1/crm/opportunities/{id}/convert`
- **Mô tả:** Chuyển đổi Cơ hội đã ký hợp đồng thành Vụ việc (Case) chính thức trong Module 3.
- **Path Params:** `id` (UUID của Opportunity).
- **Request Body:**
```json
{
  "matter_type_id": "4e7a8f1b-2c3d-4e5f-6a7b-8c9d0e1f2a3b",
  "contract_value": 150000000.00,
  "case_code_prefix": "ASL-2026-IP",
  "notes": "Khách hàng ưu tiên hoàn tất trước ngày 30/11/2026"
}
```
- **Response 201 Created:**
```json
{
  "success": true,
  "data": {
    "case_id": "8f3a1b2c-9d0e-4f5a-8b7c-6d5e4f3a2b1c",
    "case_code": "ASL-2026-IP-0045",
    "title": "Đăng ký Nhãn hiệu Quốc tế - ASL GATEWAY",
    "status": "INITIALIZING",
    "total_stages": 4,
    "total_tasks_created": 12
  },
  "message": "Chuyển đổi Vụ việc thành công, quy trình mẫu đã được kích hoạt"
}
```

---

### 2.3. Nhóm Quản lý Vụ việc & Tác vụ (Cases & Tasks)

#### `GET /api/v1/cases/{id}`
- **Mô tả:** Lấy chi tiết hồ sơ vụ việc. Middleware tự động kiểm tra Need-to-know qua Neo4j.
- **Response 200 OK:**
```json
{
  "success": true,
  "data": {
    "id": "8f3a1b2c-9d0e-4f5a-8b7c-6d5e4f3a2b1c",
    "case_code": "ASL-2026-IP-0045",
    "title": "Đăng ký Nhãn hiệu Quốc tế - ASL GATEWAY",
    "client": {
      "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "name": "Công ty Cổ phần Công nghệ ASL Gate",
      "tax_code": "0109988776"
    },
    "current_stage": {
      "id": "3a4b5c6d-7e8f-9a0b-1c2d-3e4f5a6b7c8d",
      "name": "Giai đoạn 2: Nộp đơn và Thẩm định hình thức",
      "order_index": 2
    },
    "assignments": [
      { "user_id": "u1", "full_name": "Phạm Quốc Tuấn", "role": "SUPERVISOR" },
      { "user_id": "u2", "full_name": "Nguyễn Văn Trường", "role": "CASE_MANAGER" },
      { "user_id": "u3", "full_name": "Lê Mai Anh", "role": "EXECUTOR" }
    ],
    "custom_data": {
      "application_no": "4-2026-12345",
      "filing_date": "2026-10-15",
      "priority_date": "2026-09-01",
      "classes": ["09", "42"]
    }
  }
}
```

#### `PATCH /api/v1/cases/{id}/tasks/{taskId}/status`
- **Mô tả:** Cập nhật trạng thái Task (kéo thả Kanban hoặc bấm hoàn thành).
- **Request Body:**
```json
{
  "status": "COMPLETED",
  "completion_note": "Đã nhận dấu công văn đến từ Cục Sở hữu Trí tuệ"
}
```
- **Lỗi 422 Unprocessable Entity (Vi phạm Dependency):**
```json
{
  "success": false,
  "error": {
    "code": "PREREQUISITE_TASK_NOT_COMPLETED",
    "message": "Tác vụ 'Soạn thảo tờ khai mẫu số 01' chưa được nghiệm thu"
  }
}
```

---

### 2.4. Nhóm Phối hợp Kế toán MISA & Thu tiền (Accounting & Milestones)

#### `POST /api/v1/accounting/confirm-payment`
- **Mô tả:** Kế toán viên bấm xác nhận dòng tiền đã về trên MISA và mở khóa quy trình.
- **Request Body:**
```json
{
  "milestone_id": "7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e",
  "misa_invoice_no": "HD-2026-00456",
  "bank_ref_code": "FT262991048201",
  "actual_received_amount": 50000000.00,
  "notes": "Đã khớp lệnh tiền về tài khoản VCB của ASL Law"
}
```
- **Response 200 OK:**
```json
{
  "success": true,
  "data": {
    "milestone_status": "PAID_CONFIRMED",
    "unblocked_stage_id": "5e6f7a8b-9c0d-1e2f-3a4b-5c6d7e8f9a0b",
    "commission_calculated": {
      "sales_payout": { "user_id": "u_sales", "amount": 2500000.00 },
      "manager_payout": { "user_id": "u2", "amount": 3500000.00 },
      "executor_payouts": [
        { "user_id": "u3", "task_id": "t1", "amount": 4000000.00 }
      ]
    }
  },
  "message": "Xác nhận tiền về thành công. Đã tự động chiết tính hoa hồng và mở khóa giai đoạn tiếp theo!"
}
```

---

### 2.5. Nhóm Trợ lý Ảo AI (AI Assistant)

#### `POST /api/v1/ai/chat`
- **Mô tả:** Trợ lý ảo AI tra cứu dữ liệu vụ việc/task/deadline thông qua Tool Calling.
- **Request Body:**
```json
{
  "message": "Liệt kê các vụ việc thuộc mảng SHTT mà tôi đang phụ trách sắp tới hạn trong tuần này?",
  "session_id": "ai-sess-8f3a1b2c"
}
```
- **Response 200 OK (Streamable):**
```json
{
  "success": true,
  "data": {
    "response_text": "Chào Luật sư Trường, tuần này bạn có 2 vụ việc Sở hữu trí tuệ có hạn chót quan trọng:\n1. **ASL-2026-IP-0012** (Đơn nhãn hiệu V-Smart): Hạn nộp giải trình trước 17h ngày 29/10/2026.\n2. **ASL-2026-IP-0045** (ASL Gateway): Hạn bổ sung ủy quyền trước ngày 31/10/2026.",
    "suggested_actions": [
      { "label": "Mở Case ASL-2026-IP-0012", "action_url": "/cases/c1" },
      { "label": "Mở Case ASL-2026-IP-0045", "action_url": "/cases/c2" }
    ]
  }
}
```

---

### 2.6. Nhóm Điều Hành Trực Quan (Operations Floorplan - FEAT-01)

#### `GET /api/v1/operations/floorplan`
- **Mô tả:** Trả về toàn bộ dữ liệu bàn ghế, nhân sự, tải trọng công việc và hàng đợi phê duyệt của một phòng ban.
- **Headers:** `Authorization: Bearer <token>`
- **Query Parameters:** `department_id` (UUID, optional nếu là Leader)
- **Response 200 OK:**
```json
{
  "success": true,
  "data": {
    "department": {
      "id": "dept-ip-01",
      "name": "Phòng Sở Hữu Trí Tuệ",
      "leader": {
        "id": "usr-01",
        "name": "LS. Nguyễn Văn An",
        "title": "Trưởng Ban SHTT",
        "avatar": "NA"
      }
    },
    "stats": {
      "total_staff": 8,
      "working_count": 6,
      "resting_count": 2,
      "pending_approvals_count": 3
    },
    "approval_queue": [
      {
        "user": {
          "id": "usr-02",
          "name": "LS. Mai Linh",
          "title": "Luật sư Cấp cao",
          "avatar": "ML"
        },
        "pending_count": 2,
        "requests": [
          {
            "id": "appr-101",
            "case_code": "ASL-2026-TM109",
            "title": "Tờ khai đăng ký nhãn hiệu 9OUTFIT",
            "requested_at": "2026-10-30T09:15:00Z"
          }
        ]
      }
    ],
    "workstations": [
      {
        "desk_index": 1,
        "user": {
          "id": "usr-03",
          "name": "Trần Thu Hà",
          "title": "Chuyên viên Pháp lý",
          "avatar": "TH"
        },
        "in_progress_count": 3,
        "todo_count": 2,
        "is_idle": false,
        "is_in_queue": false
      },
      {
        "desk_index": 2,
        "user": {
          "id": "usr-04",
          "name": "Lê Hoàng Nam",
          "title": "Trợ lý Luật sư",
          "avatar": "HN"
        },
        "in_progress_count": 0,
        "todo_count": 1,
        "is_idle": true,
        "is_in_queue": false
      }
    ]
  }
}
```

#### `POST /api/v1/approvals/{id}/decide`
- **Mô tả:** Trưởng phòng / Giám đốc ký duyệt hoặc trả về hồ sơ trực tiếp từ bàn làm việc của phòng.
- **Request Body:**
```json
{
  "action": "APPROVE",
  "comment": "Đã kiểm tra đối chiếu tờ khai và giấy ủy quyền hợp lệ. Ký duyệt!"
}
```
- **Response 200 OK:**
```json
{
  "success": true,
  "message": "Đã phê duyệt hồ sơ thành công. Nhân sự đã hoàn tất trình duyệt!"
}
```

