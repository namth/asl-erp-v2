# TASK-049 — Quét hạn task, leo thang & kênh ngoài (TSK-21 phần còn lại)

> Người giao: Claude (Trưởng phòng) · Người thực hiện: Antigravity
> **Độ khó:** HIGH · **Nhạy cảm:** có (dữ liệu ra dịch vụ ngoài — DEC-03)

## 1. Mục tiêu
Thông báo web đã có (TASK-036: `backend/app/services/notifications.py`). Còn thiếu: bộ quét hạn task theo **giờ làm việc**, leo thang 2 cấp, chống gửi trùng, gửi Telegram/Zalo với nội dung tối thiểu. Liên kết tài khoản Telegram (OTP) **không** thuộc task này — chỉ gửi cho user đã có `users.telegram_chat_id` / `users.zalo_user_id`.

## 2. Tài liệu bắt buộc đọc
- `docs/12-business-rules.md` §4.2 (SLA) và §4.3 (DEC-03); `docs/08-integrations.md` §2.2 (mẫu tin), §3; `docs/13-test-cases-and-qa.md` TC-NOTIF-01 → 03; `docs/10-env-and-security.md` (allowlist outbound, biến `TELEGRAM_BOT_TOKEN`, `ZALO_OA_ACCESS_TOKEN`)
- Schema `notifications`, `notification_deliveries` (`backend/alembic/versions/001_initial_schema.sql` mục 32–33), bảng `holidays`
- Mẫu: `backend/app/services/notifications.py` (`create_notification`, publish WS)

## 3. Phạm vi file
**Được tạo/sửa:**
- `backend/app/services/business_hours.py` (thuần)
- `backend/app/services/external_messages.py` (`render_external_message`, thuần)
- `backend/app/services/notification_channels.py` (gửi Telegram/Zalo qua httpx)
- `backend/app/services/deadline_scanner.py`
- `backend/app/scripts/run_deadline_scan.py` (CLI: `python -m backend.app.scripts.run_deadline_scan`)
- `backend/app/core/config.py` — chỉ thêm `TELEGRAM_BOT_TOKEN`, `ZALO_OA_ACCESS_TOKEN`, `ERP_PUBLIC_URL` (mặc định `https://erp.asllaw.vn`), `OUTBOUND_ALLOWED_HOSTS` (mặc định `api.telegram.org,openapi.zalo.me`)
- `backend/tests/test_deadline_alerts.py` (tài khoản kiểm chéo viết, sau đó khoá)

**Không được sửa:** file trong `tests.lock`, `docs/`, `frontend/`, migration, `backend/app/services/notifications.py` (chỉ import, trừ khi cần thêm tham số tuỳ chọn không phá hành vi cũ).

## 4. Blueprint
- **Giờ làm việc:** 08:00–12:00 và 13:00–17:00 giờ `Asia/Ho_Chi_Minh` (8 giờ/ngày), thứ Hai–Sáu, trừ ngày trong `holidays`. `working_hours_between(start, end, holidays: set[date]) -> Decimal` (giờ, end < start → số âm có cùng độ lớn). Không dùng float.
- **Cấp độ** (task `TODO`/`IN_PROGRESS`, có `due_at`, có `assigned_to`, vụ việc không `PAUSED`/`CLOSED`):
  - Cấp 1: `0 < working_hours_between(now, due_at) <= 24` → người thực hiện.
  - Cấp 2: `working_hours_between(due_at, now) > 4` → mọi người `ASSIGNED_TO` vai trò `CASE_MANAGER` và `SUPERVISOR` của vụ việc (bảng phân công trong PG; khớp cách các service khác đọc phân công).
- **Chống trùng:** mỗi (task, cấp, người nhận, kênh) đúng một dòng `notification_deliveries`, `dedupe_key = f"DEADLINE:{task_id}:L{level}:{user_id}:{channel}"`, `INSERT … ON CONFLICT (dedupe_key) DO NOTHING`; chỉ tạo `notifications` (web) khi dòng `WEB` vừa được chèn. Kênh: `WEB` luôn; `TELEGRAM` nếu có `telegram_chat_id`; `ZALO` nếu có `zalo_user_id`.
- **`scan_deadlines(now: datetime | None = None) -> dict`** trả `{"level1": n, "level2": m, "deliveries_created": k}`; chạy 2 lần liên tiếp → lần 2 tạo 0.
- **Nội dung:** `render_external_message(level, case_code, task_title, due_at, link, now) -> str` đúng khuôn `08` §2.2 (cấp 2 tiêu đề "QUÁ HẠN CÔNG VIỆC"); `link = ERP_PUBLIC_URL + /cases/{case_id}/tasks/{task_id}`. Chỉ nhận đúng các tham số đó (không nhận object vụ việc) để không thể lọt tên khách/tên vụ/tiền. Web notification dùng cùng nội dung tối thiểu.
- **Gửi:** `send_pending_deliveries()` lấy dòng `PENDING` kênh ngoài (`attempts < 3`), gửi qua client httpx chỉ cho phép host trong `OUTBOUND_ALLOWED_HOSTS` (host khác → lỗi, không gửi); thành công `SENT` + `sent_at`; lỗi → `attempts += 1`, `last_error` (không chứa token), sau 3 lần `FAILED`. Thiếu token kênh → để `PENDING`, không gọi mạng. Telegram: `POST https://api.telegram.org/bot<TOKEN>/sendMessage {chat_id, text}`; Zalo: `POST https://openapi.zalo.me/v3.0/oa/message/cs` header `access_token`, body `{"recipient": {"user_id"}, "message": {"text"}}`.
- Hàm gửi nhận `httpx.AsyncClient` tuỳ chọn (tham số) để test truyền `httpx.MockTransport`.

## 5. Tiêu chí nghiệm thu (đo được — đầu vào để viết test)
- `working_hours_between`: thứ Sáu 16:00 → thứ Hai 09:00 = 2 giờ; qua một ngày lễ trong `holidays` bỏ qua cả ngày; 11:00 → 14:00 cùng ngày = 2 giờ; cuối tuần → 0.
- TC-NOTIF-01: task còn 3 giờ làm việc, người làm có `telegram_chat_id` → 1 delivery `TELEGRAM` + 1 `WEB`; gửi qua MockTransport tới đúng URL Telegram, text có mã vụ việc, tên task, hạn, deep-link `…/cases/{case_id}/tasks/{task_id}`; delivery `SENT`.
- Task còn 30 giờ làm việc → không cảnh báo; hạn rơi sau một ngày lễ → tính bỏ qua ngày lễ.
- TC-NOTIF-02: quá hạn 5 giờ làm việc → cấp 2 tới Case Manager & Supervisor (không tới người ngoài vụ); chạy scanner 2 lần → mỗi (task, cấp, người, kênh) đúng 1 dòng; vụ `PAUSED` → không gì cả.
- TC-NOTIF-03: vụ có tên khách, tên vụ việc, MST, SĐT, email, số tiền hợp đồng → mọi text gửi ra (bắt được qua MockTransport) và mọi `notifications.title/body` cấp hạn không chứa các chuỗi đó.
- Lỗi mạng → `attempts` tăng, sau 3 lần `FAILED`, `last_error` không chứa token; host ngoài allowlist không bao giờ được gọi.
- `bash handoff/tasks/TASK-049-deadline-alerts/verify.sh` xanh.

## 6. Bẫy cần tránh
- Không float cho giờ; không dùng giờ máy chủ (luôn quy về giờ VN); không gửi khi vụ `PAUSED`.
- Không nhét tên vụ việc/khách vào tin; không log token.
- Không UPDATE/DELETE `audit_logs`; không DDL trong code app; không gán đè hàm/biến môi trường lúc chạy.
- Không sửa test đã khoá; không `python3 -c` nhiều dòng; không `rm`/`&&`/`git`/`sed`/`cat`/`grep`. File tạm ở `handoff/tasks/TASK-049-deadline-alerts/scratch/`.
