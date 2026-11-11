# 07. HỢP ĐỒNG DỮ LIỆU API (API CONTRACTS & SPECIFICATIONS)

> Cập nhật 30/10/2026 theo `14-decisions.md` và báo cáo QA 30/10 (D3, D4, B4, B8). Đổi hợp đồng → sửa tài liệu này trong cùng thay đổi.

## 1. QUY CHUẨN THIẾT KẾ REST API

### 1.1. Chung
- **Base URL:** `/api/v1` · **Định dạng:** `application/json; charset=utf-8`.
- **Xác thực:**
  - Web app: `access_token` và `refresh_token` trong **HttpOnly Cookie** (`Secure`, `SameSite=Strict`); mọi request ghi (POST/PUT/PATCH/DELETE) gửi kèm header `X-CSRF-Token` khớp cookie `csrf_token` (double-submit).
  - Script/test: `Authorization: Bearer <access_token>`.
- **Tiền tệ:** luôn là **chuỗi thập phân** tối đa 2 chữ số sau dấu chấm, VNĐ: `"150000000"`, `"2500000.00"`. Không bao giờ là số JSON (tránh sai số float). Tỷ lệ % cũng là chuỗi: `"5.00"`.
- **Thời gian:** ISO-8601 có múi giờ, trả về UTC (`2026-10-30T02:15:00Z`); ngày thuần là `YYYY-MM-DD`.
- **Phân trang:** `?page=1&limit=20` (`limit` tối đa 100); kết quả trong `meta`.
- **Idempotency:** các lệnh tạo tiền hoặc tạo bản ghi không được trùng (`confirm-payment`, `convert`) **bắt buộc** header `Idempotency-Key: <uuid>`. Gửi lại cùng key + cùng nội dung → trả lại kết quả cũ; cùng key + nội dung khác → `409 IDEMPOTENCY_KEY_REUSED`.
- **Need-to-know:** mọi endpoint dưới `/cases/{id}/…` đi qua `verify_need_to_know(user, case_id, scope)`; phạm vi ghi ở cột "Phạm vi" (`06` §3.3).

### 1.2. Phong bì phản hồi

```json
{
  "success": true,
  "data": { },
  "message": "Thao tác thành công",
  "warnings": [],
  "meta": { "page": 1, "limit": 20, "total_records": 105, "total_pages": 6 }
}
```

```json
{
  "success": false,
  "error": {
    "code": "PREREQUISITE_TASK_NOT_COMPLETED",
    "message": "Không thể bắt đầu task này khi task 'Soạn tờ khai mẫu 01' chưa hoàn thành",
    "details": {
      "blocked_task_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "prerequisite_task_ids": ["1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d"]
    }
  }
}
```

`warnings` dùng cho cảnh báo không chặn (VD xung đột lợi ích: `{"code": "CONFLICT_OF_INTEREST", "case_codes": ["ASL-2026-LD-0007"]}`).

### 1.3. Danh mục mã lỗi (duy nhất)

| Mã | HTTP | Khi nào |
| :--- | :---: | :--- |
| `VALIDATION_ERROR` | 422 | Dữ liệu không qua Pydantic; `details.fields` liệt kê từng trường |
| `UNAUTHENTICATED` | 401 | Thiếu/sai/hết hạn token |
| `TOKEN_REVOKED` | 401 | `jti` trong blocklist hoặc phát hành trước `users.tokens_valid_after` |
| `TOTP_REQUIRED` | 401 | Mật khẩu đúng, cần bước 2FA (kèm `details.challenge_id`) |
| `TOTP_INVALID` | 401 | Mã TOTP / mã khôi phục sai |
| `TOTP_SETUP_REQUIRED` | 403 | Vai trò bắt buộc 2FA nhưng chưa thiết lập |
| `PASSWORD_RESET_REQUIRED` | 403 | `must_reset_password = TRUE` |
| `ACCOUNT_LOCKED` | 423 | Sai mật khẩu quá 5 lần / 15 phút, hoặc tài khoản bị khoá |
| `CSRF_INVALID` | 403 | Thiếu/sai `X-CSRF-Token` |
| `FORBIDDEN_ROLE` | 403 | Vai trò hệ thống không được dùng chức năng này |
| `NEED_TO_KNOW_DENIED` | 403 | Không thuộc phạm vi vụ việc (ghi `ACCESS_DENIED` vào audit) |
| `NOT_FOUND` | 404 | Không tồn tại |
| `DUPLICATE_TAX_CODE` | 409 | MST đã tồn tại |
| `DUPLICATE_IDENTITY_NO` | 409 | CCCD/hộ chiếu đã tồn tại |
| `OPPORTUNITY_NOT_WON` | 409 | Chuyển đổi khi cơ hội chưa `WON` |
| `OPPORTUNITY_ALREADY_CONVERTED` | 409 | Cơ hội đã có vụ việc |
| `NO_PUBLISHED_TEMPLATE` | 409 | Loại vụ việc chưa có template đã phát hành |
| `INVALID_STATE_TRANSITION` | 409 | Chuyển trạng thái không có trong máy trạng thái (`12` §1) |
| `PREREQUISITE_TASK_NOT_COMPLETED` | 422 | Vi phạm phụ thuộc task (`12` §2.1) |
| `STAGE_LOCKED` | 409 | Stage đang `LOCKED`/`WAITING_APPROVAL`/`WAITING_PAYMENT` |
| `STRICT_GOVERNANCE_VIOLATION` | 403 | Thêm task/stage vào vụ việc template `STRICT` |
| `CHANGE_REQUEST_REQUIRED` | 403 | Thêm task/stage trực tiếp vào vụ việc `FLEXIBLE` mà không qua yêu cầu đã duyệt |
| `APPROVAL_NOT_ALLOWED` | 403 | Người duyệt không đủ thẩm quyền, hoặc tự duyệt yêu cầu của mình |
| `LEGACY_CASE_READ_ONLY` | 409 | Ghi vào vụ việc lịch sử từ hệ thống cũ |
| `MILESTONE_NOT_AWAITING_PAYMENT` | 409 | Xác nhận tiền cho đợt không ở `AWAITING_PAYMENT`/`PARTIALLY_PAID` |
| `DUPLICATE_BANK_REF` | 409 | Mã giao dịch ngân hàng đã được ghi nhận |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Cùng key, khác nội dung |
| `COMMISSION_RATES_EXCEED_100` | 422 | Tổng tỷ lệ > 100% |
| `COMMISSION_POLICY_LOCKED` | 409 | Sửa tỷ lệ sau lần thu tiền đầu tiên |
| `MILESTONES_EXCEED_CONTRACT` | 422 | Tổng các đợt thu > giá trị hợp đồng |
| `FILE_TYPE_NOT_ALLOWED` | 415 | Định dạng ngoài danh sách trắng |
| `FILE_TOO_LARGE` | 413 | > 50 MB |
| `FILE_NOT_AVAILABLE` | 409 | Tệp chưa quét xong hoặc nhiễm virus |
| `RATE_LIMITED` | 429 | Vượt giới hạn tần suất |
| `INTERNAL_ERROR` | 500 | Lỗi không lường trước (không lộ chi tiết) |

---

## 2. DANH MỤC ENDPOINT

Cột "Milestone" theo lộ trình `11`. Endpoint M1–M2 có đặc tả chi tiết ở §3; các milestone sau được đặc tả chi tiết khi lập brief cho task tương ứng.

| Nhóm | Method & Path | Vai trò / Phạm vi | Milestone |
| :--- | :--- | :--- | :---: |
| Hệ thống | `GET /health` | công khai | M1 |
| Xác thực | `POST /auth/login` · `POST /auth/2fa/verify` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/password` | mọi người | M1 |
| Xác thực | `POST /auth/2fa/setup` · `POST /auth/2fa/enable` · `POST /users/{id}/2fa/reset` | cá nhân · ADMIN | M1 |
| Người dùng | `GET/POST /users` · `GET/PATCH /users/{id}` · `POST /users/{id}/deactivate` | ADMIN (MANAGER xem) | M1 |
| Phòng ban | `GET/POST /departments` · `PUT /departments/{id}/leaders` | ADMIN | M1 |
| Kiểm toán | `GET /audit-logs` · `GET /audit-logs/integrity` | ADMIN | M1 |
| Khách hàng | `GET/POST /crm/clients` · `GET/PATCH /crm/clients/{id}` · `GET/POST /crm/clients/{id}/interactions` | MANAGER, ATTORNEY (ACCOUNTANT xem) | M2 |
| Cơ hội | `GET/POST /crm/opportunities` · `PATCH /crm/opportunities/{id}` · `POST /crm/opportunities/{id}/convert` | MANAGER, ATTORNEY | M2 |
| Xung đột lợi ích | `POST /crm/conflict-check` | MANAGER, ATTORNEY | M2 |
| Workflow | `GET/POST /workflows/templates` · `POST /workflows/templates/{id}/versions` · `PUT /workflows/versions/{id}` · `POST /workflows/versions/{id}/publish` | ADMIN (MANAGER xem) | M3 |
| Vụ việc | `GET/POST /cases` · `GET/PATCH /cases/{id}` · `POST /cases/{id}/status` | `progress` (danh sách) · `professional` | M3 |
| Phân công | `GET/PUT /cases/{id}/assignments` | MANAGER trong phạm vi | M3 |
| Các bên | `GET/POST /cases/{id}/parties` | `professional` | M3 |
| Task | `GET /cases/{id}/tasks` · `PATCH /cases/{id}/tasks/{taskId}` · `PATCH /cases/{id}/tasks/{taskId}/status` · `GET/POST /cases/{id}/tasks/{taskId}/comments` | `professional` | M3 |
| Bổ sung quy trình | `POST /cases/{id}/change-requests` · `GET /cases/{id}/change-requests` | `professional`, vụ việc `FLEXIBLE` | M3 |
| Phê duyệt | `GET /approvals?status=PENDING` · `POST /approvals/{id}/decide` | người có thẩm quyền | M3 |
| Tài chính vụ việc | `GET/PUT /cases/{id}/commission-policy` · `GET/POST /cases/{id}/milestones` · `PATCH /cases/{id}/milestones/{mid}` · `POST /cases/{id}/milestones/{mid}/cancel` | `finance` | M4 |
| Kế toán | `GET /accounting/inbox` · `POST /accounting/confirm-payment` | ACCOUNTANT | M4 |
| Hoa hồng | `GET /finance/commissions` · `GET /finance/commissions/export` · `POST /finance/commissions/disburse` | MANAGER, ACCOUNTANT; ATTORNEY chỉ của mình | M4 |
| Tài liệu | `GET/POST /cases/{id}/documents` · `POST /documents/{id}/versions` · `GET /documents/{id}/versions/{vid}/download` · `POST /documents/{id}/archive` | `professional` (`finance` với thư mục Hợp đồng) | M5 |
| Thông báo | `GET /notifications` · `POST /notifications/{id}/read` · `WS /ws/notifications` · `POST /me/telegram/link` | mọi người | M5 |
| Trợ lý AI | `POST /ai/chat` | mọi người, dữ liệu trong phạm vi | M5 |
| Báo cáo | `GET /reports/revenue` · `GET /reports/commissions` · `GET /reports/operations` · `GET /reports/{name}/export` | theo `02` Phân hệ 10 | M5 |
| Văn phòng số | `GET /operations/floorplan` · `WS /ws/floorplan/{dept_id}` | MANAGER | M6 |
| Cài đặt | `GET/PUT /settings/holidays` · `GET/PUT /settings/commission-defaults` | ADMIN | M3 |

---

## 3. ĐẶC TẢ CHI TIẾT

### 3.1. Xác thực

#### `POST /api/v1/auth/login`
```json
{ "email": "truong.nv@asllaw.vn", "password": "SecurePassword123@" }
```
- **200 OK** (tài khoản không bật 2FA): đặt cookie, trả `user`.
- **401 `TOTP_REQUIRED`** (đã bật 2FA): `details.challenge_id` (hiệu lực 5 phút) để gọi bước 2.
- **403 `TOTP_SETUP_REQUIRED`** (vai trò bắt buộc 2FA nhưng chưa thiết lập): `details.setup_token` chỉ dùng được cho `/auth/2fa/setup` và `/auth/2fa/enable`.
- **403 `PASSWORD_RESET_REQUIRED`**: `details.reset_token` chỉ dùng được cho `/auth/password`.
- **423 `ACCOUNT_LOCKED`**: `details.retry_after_seconds`.

```json
{
  "success": true,
  "data": {
    "expires_in": 1800,
    "user": {
      "id": "c1f8a29e-1f2e-4b7b-8d0a-5c2f3b9d0e1a",
      "email": "truong.nv@asllaw.vn",
      "full_name": "Nguyễn Văn Trường",
      "title": "Trưởng ban SHTT",
      "system_role": "MANAGER",
      "is_executive": false,
      "led_department_ids": ["d1e2f3a4-0000-4000-8000-000000000001"],
      "totp_enabled": true
    }
  }
}
```

#### `POST /api/v1/auth/2fa/verify`
```json
{ "challenge_id": "5f0c…", "code": "842190" }
```
`code` nhận mã TOTP 6 số hoặc mã khôi phục 10 ký tự. **200** như login thành công; **401 `TOTP_INVALID`** (tính vào bộ đếm khoá tài khoản).

#### `POST /api/v1/auth/refresh`
Không body; đọc cookie `refresh_token`. Xoay vòng: phát token mới, thu hồi token cũ. Dùng lại token đã bị thay → thu hồi cả chuỗi (`family_id`) và trả **401 `TOKEN_REVOKED`**.

#### `POST /api/v1/auth/logout`
Đưa `jti` access token vào Redis blocklist (TTL = thời gian sống còn lại), thu hồi refresh token, xoá cookie. **204**.

#### `GET /api/v1/auth/me`
Trả `user` như login, dùng để dựng sidebar/header đúng người đăng nhập.

### 3.2. Người dùng & phòng ban

#### `POST /api/v1/users` (ADMIN)
```json
{
  "email": "lan.tt@asllaw.vn",
  "full_name": "Trần Thị Lan",
  "title": "Kế toán viên",
  "system_role": "ACCOUNTANT",
  "is_executive": false,
  "department_id": null
}
```
**201**: tạo tài khoản với mật khẩu tạm gửi qua kênh nội bộ, `must_reset_password = true`. `is_executive = true` chỉ hợp lệ với `MANAGER` (`422 VALIDATION_ERROR`).

#### `POST /api/v1/users/{id}/deactivate` (ADMIN)
Khoá tài khoản: `is_active = false`, `tokens_valid_after = NOW()`, gỡ các cạnh của user trên Neo4j **ngay trong request**, ghi audit. Mọi request sau đó của user → `401 TOKEN_REVOKED`.

#### `PUT /api/v1/departments/{id}/leaders` (ADMIN)
```json
{ "leader_user_ids": ["c1f8a29e-1f2e-4b7b-8d0a-5c2f3b9d0e1a"] }
```
Mọi user phải có `system_role = MANAGER`. Đồng bộ cạnh `:LEADS`.

### 3.2a. Nhật ký kiểm toán (ADMIN — SCR-13)

#### `GET /api/v1/audit-logs`
Tham số: `actor_id`, `actor_type` (`USER`|`SYSTEM`), `action`, `entity_name`, `entity_id`, `from`, `to` (ISO 8601, lọc `created_at`), `page`, `limit` (mặc định 50, tối đa 200). Sắp xếp mới nhất trước; `meta` phân trang như §1.2.
```json
{
  "success": true,
  "data": [
    {
      "id": 1042,
      "created_at": "2026-11-11T09:12:03.120Z",
      "actor_type": "USER",
      "actor": { "id": "c1f8a29e-…", "full_name": "Nguyễn Văn Trường", "email": "truong.nv@asllaw.vn" },
      "action": "USER_DEACTIVATED",
      "entity_name": "users",
      "entity_id": "5f0c…",
      "before_state": { "is_active": true },
      "after_state": { "is_active": false, "reason": "Nghỉ việc" },
      "ip_address": "10.0.0.12",
      "user_agent": "Mozilla/5.0 …",
      "row_hash": "9b1d…"
    }
  ],
  "meta": { "page": 1, "limit": 50, "total_records": 1042, "total_pages": 21 }
}
```
`actor` là `null` khi `actor_type = SYSTEM` hoặc người dùng đã bị xoá liên kết. Chỉ đọc — không có endpoint sửa/xoá.

#### `GET /api/v1/audit-logs/integrity`
Kết quả lần kiểm chuỗi băm gần nhất (job hằng đêm) — `?recheck=true` chạy kiểm ngay (giới hạn 1 lần/5 phút, vượt → `429 RATE_LIMITED`).
```json
{ "success": true, "data": { "status": "OK", "checked_rows": 1042, "verified_at": "2026-11-11T02:00:04Z", "first_broken_id": null } }
```
`status`: `OK` | `BROKEN` (kèm `first_broken_id`) | `NEVER_CHECKED`.

### 3.3. Khách hàng & cơ hội

#### `POST /api/v1/crm/clients`
```json
{
  "client_type": "ENTERPRISE",
  "name": "Công ty Cổ phần Công nghệ ASL Gate",
  "tax_code": "0109988776",
  "representative_name": "Phạm Minh Đức",
  "phone": "0912345678",
  "email": "contact@aslgate.vn",
  "address": "Tầng 5, 12 Duy Tân, Cầu Giấy, Hà Nội",
  "category_group": "NEW"
}
```
- `INDIVIDUAL` gửi `identity_no` thay `tax_code`; server mã hoá và chỉ lưu hash để chặn trùng; API **không bao giờ** trả lại `identity_no` đầy đủ (chỉ 4 số cuối: `"********1234"`).
- **201** kèm `warnings` nếu trùng tên/MST với bên đối tụng của vụ việc đang hiệu lực.
- **409 `DUPLICATE_TAX_CODE`** / **`DUPLICATE_IDENTITY_NO`**.

#### `POST /api/v1/crm/opportunities/{id}/convert`
Header bắt buộc: `Idempotency-Key`.
```json
{
  "matter_type_id": "4e7a8f1b-2c3d-4e5f-6a7b-8c9d0e1f2a3b",
  "title": "Đăng ký nhãn hiệu quốc tế ASL GATEWAY",
  "contract_value": "150000000",
  "milestones": [
    { "name": "Đợt 1 - Tạm ứng khi ký hợp đồng", "amount": "45000000" },
    { "name": "Đợt 2 - Có thông báo đơn hợp lệ", "amount": "60000000" },
    { "name": "Đợt 3 - Bàn giao văn bằng", "amount": "45000000" }
  ],
  "notes": "Khách hàng ưu tiên hoàn tất trước ngày 30/11/2026"
}
```
- Server sinh `case_code` theo `ASL-YYYY-XX-NNNN` (XX = mã loại vụ việc) — client **không** gửi tiền tố.
- Tạo vụ việc ở `INITIALIZING` theo phiên bản template đang phát hành, sao chép `workflow_mode`, tạo `commission_policy` từ mặc định của loại vụ việc, gắn người mang khách về (`originator_id`).
- Lỗi: `OPPORTUNITY_NOT_WON`, `OPPORTUNITY_ALREADY_CONVERTED`, `NO_PUBLISHED_TEMPLATE`, `MILESTONES_EXCEED_CONTRACT`.

```json
{
  "success": true,
  "data": {
    "case_id": "8f3a1b2c-9d0e-4f5a-8b7c-6d5e4f3a2b1c",
    "case_code": "ASL-2026-TM-0045",
    "status": "INITIALIZING",
    "workflow_mode": "STRICT",
    "template_version": 3,
    "total_stages": 4,
    "total_tasks_created": 12
  },
  "message": "Đã tạo vụ việc. Cần phân công nhân sự để bắt đầu."
}
```

### 3.4. Vụ việc & task (M3 — tóm tắt hợp đồng)

#### `GET /api/v1/cases/{id}` — phạm vi `professional`
```json
{
  "success": true,
  "data": {
    "id": "8f3a1b2c-9d0e-4f5a-8b7c-6d5e4f3a2b1c",
    "case_code": "ASL-2026-TM-0045",
    "title": "Đăng ký nhãn hiệu quốc tế ASL GATEWAY",
    "status": "ACTIVE",
    "workflow_mode": "STRICT",
    "is_legacy": false,
    "contract_value": "150000000",
    "client": { "id": "9b1deb4d-…", "name": "Công ty Cổ phần Công nghệ ASL Gate", "tax_code": "0109988776" },
    "current_stage": { "id": "3a4b…", "name": "Nộp đơn và thẩm định hình thức", "order_index": 2, "status": "WAITING_PAYMENT", "blocking_milestone_id": "7b8c…" },
    "progress_pct": 45,
    "assignments": [
      { "user_id": "u1", "full_name": "Phạm Quốc Tuấn", "role_in_case": "SUPERVISOR" },
      { "user_id": "u2", "full_name": "Nguyễn Văn Trường", "role_in_case": "CASE_MANAGER" },
      { "user_id": "u3", "full_name": "Lê Mai Anh", "role_in_case": "EXECUTOR" }
    ],
    "custom_data": { "application_no": "4-2026-12345", "filing_date": "2026-10-15", "classes": ["09", "42"] }
  }
}
```
Người chỉ có phạm vi `progress` (Kế toán, người mang khách về) gọi `GET /cases/{id}?view=progress` → chỉ nhận mã, tên, trạng thái, `progress_pct`, tình trạng đợt thu.

#### `PATCH /api/v1/cases/{id}/tasks/{taskId}/status`
```json
{ "status": "WAITING_APPROVAL", "note": "Đã hoàn thiện tờ khai, gửi duyệt" }
```
Chuyển trạng thái theo `12` §1.3. Lỗi: `PREREQUISITE_TASK_NOT_COMPLETED` (422), `STAGE_LOCKED`, `INVALID_STATE_TRANSITION`, `LEGACY_CASE_READ_ONLY`. Task `requires_approval = true` không được chuyển thẳng `COMPLETED` — tạo `approval_request` khi sang `WAITING_APPROVAL`.

#### `POST /api/v1/cases/{id}/change-requests` (DEC-07)
```json
{
  "kind": "ADD_TASK",
  "reason": "Tòa yêu cầu bổ sung bản dịch công chứng hợp đồng gốc",
  "proposal": {
    "stage_id": "3a4b…",
    "title": "Dịch công chứng hợp đồng gốc",
    "assigned_to": "u3",
    "due_at": "2026-11-12T10:00:00Z",
    "complexity_weight": 2
  }
}
```
- Vụ việc `STRICT` → **403 `STRICT_GOVERNANCE_VIOLATION`**.
- **201**: yêu cầu `PENDING` + `approval_request` gửi Quản lý phụ trách. Task chỉ được tạo (`is_ad_hoc = true`) khi yêu cầu được duyệt.
- Mọi đường tạo task/stage khác vào vụ việc đang chạy → `STRICT_GOVERNANCE_VIOLATION` hoặc `CHANGE_REQUEST_REQUIRED`.

#### `POST /api/v1/approvals/{id}/decide`
```json
{ "action": "REJECT", "comment": "Thiếu giấy uỷ quyền có chữ ký người đại diện" }
```
`action` ∈ `APPROVE`, `REJECT`; `comment` bắt buộc khi `REJECT`. Người duyệt không được là người gửi yêu cầu (`APPROVAL_NOT_ALLOWED`). Phát sự kiện `EVENT_APPROVAL_DECIDED` cho Văn phòng số.

### 3.5. Kế toán & hoa hồng (M4 — tóm tắt hợp đồng)

#### `POST /api/v1/accounting/confirm-payment` (ACCOUNTANT)
Header bắt buộc: `Idempotency-Key`.
```json
{
  "milestone_id": "7b8c9d0e-1f2a-3b4c-5d6e-7f8a9b0c1d2e",
  "misa_invoice_no": "HD-2026-00456",
  "bank_ref_code": "FT262991048201",
  "received_amount": "30000000",
  "notes": "Khách chuyển trước một phần"
}
```
```json
{
  "success": true,
  "data": {
    "milestone_status": "PARTIALLY_PAID",
    "received_total": "30000000",
    "remaining": "30000000",
    "stage_unblocked": false,
    "commissions": [
      { "user_id": "u_orig", "role_type": "ORIGINATOR", "amount": "1500000" },
      { "user_id": "u1", "role_type": "SUPERVISOR", "amount": "840000" },
      { "user_id": "u2", "role_type": "CASE_MANAGER", "amount": "1260000" },
      { "user_id": "u3", "role_type": "EXECUTOR", "task_id": "t1", "amount": "2400000" }
    ],
    "execution_carried_forward": "0"
  },
  "warnings": []
}
```
- Hoa hồng tính trên `received_amount` của **lần này** (`12` §3). Đợt chỉ `PAID_CONFIRMED` và mở khoá stage khi `received_total >= amount`.
- Thu thừa: ghi nhận, `warnings` có `OVERPAYMENT` kèm số dư.
- Lỗi: `MILESTONE_NOT_AWAITING_PAYMENT`, `DUPLICATE_BANK_REF`, `IDEMPOTENCY_KEY_REUSED`.

### 3.6. Trợ lý AI

#### `POST /api/v1/ai/chat`
```json
{ "message": "Tuần này tôi có vụ việc SHTT nào sắp tới hạn?", "session_id": "ai-sess-8f3a1b2c" }
```
- Công cụ chỉ trả dữ liệu trong phạm vi người hỏi. Trước khi gửi kết quả công cụ lên LLM: thay tên khách hàng, MST/CCCD, điện thoại, email bằng mã giả; khôi phục khi trả về người dùng (DEC-03, `08` §4.3).
- Phản hồi dạng stream (SSE); bản không stream:

```json
{
  "success": true,
  "data": {
    "response_text": "Tuần này bạn có 2 vụ việc SHTT sắp tới hạn:\n1. ASL-2026-TM-0012: hạn nộp giải trình 17:00 ngày 29/10/2026.\n2. ASL-2026-TM-0045: hạn bổ sung uỷ quyền ngày 31/10/2026.",
    "suggested_actions": [
      { "label": "Mở ASL-2026-TM-0012", "action_url": "/cases/c1" },
      { "label": "Mở ASL-2026-TM-0045", "action_url": "/cases/c2" }
    ]
  }
}
```

### 3.7. Văn phòng số (M6)

#### `GET /api/v1/operations/floorplan?department_id={uuid}` (MANAGER)
Giám đốc chọn được mọi phòng; Trưởng phòng bỏ trống `department_id` → phòng mình quản lý, chọn phòng khác → `403 NEED_TO_KNOW_DENIED`. Cấu trúc phản hồi (giữ nguyên từ FEAT-01):

```json
{
  "success": true,
  "data": {
    "department": {
      "id": "d1e2f3a4-0000-4000-8000-000000000001",
      "name": "Phòng Sở Hữu Trí Tuệ",
      "leader": { "id": "usr-01", "name": "LS. Nguyễn Văn An", "title": "Trưởng Ban SHTT", "avatar_url": "/api/v1/users/usr-01/avatar" }
    },
    "stats": { "total_staff": 8, "working_count": 6, "resting_count": 2, "pending_approvals_count": 3 },
    "approval_queue": [
      {
        "user": { "id": "usr-02", "name": "LS. Mai Linh", "title": "Luật sư cấp cao" },
        "pending_count": 2,
        "requests": [
          { "id": "appr-101", "subject_type": "TASK", "case_code": "ASL-2026-TM-0109", "title": "Tờ khai đăng ký nhãn hiệu 9OUTFIT", "requested_at": "2026-10-30T02:15:00Z" }
        ]
      }
    ],
    "workstations": [
      { "desk_index": 1, "user": { "id": "usr-03", "name": "Trần Thu Hà", "title": "Chuyên viên pháp lý" }, "in_progress_count": 3, "todo_count": 2, "is_idle": false, "is_in_queue": false },
      { "desk_index": 2, "user": { "id": "usr-04", "name": "Lê Hoàng Nam", "title": "Trợ lý luật sư" }, "in_progress_count": 0, "todo_count": 1, "is_idle": true, "is_in_queue": false }
    ]
  }
}
```
