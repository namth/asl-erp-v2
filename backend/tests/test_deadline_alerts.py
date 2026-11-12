"""Hợp đồng nghiệm thu TASK-049 (TSK-21 phần còn lại) — Quét hạn task, leo thang 2 cấp, gửi Telegram/Zalo.

Tài liệu & hợp đồng:
- docs/12-business-rules.md §4.2 (SLA) & §4.3 (DEC-03)
- docs/08-integrations.md §2.2 (mẫu tin), §3 (Zalo OA)
- docs/13-test-cases-and-qa.md (TC-NOTIF-01, TC-NOTIF-02, TC-NOTIF-03)
- docs/10-env-and-security.md (allowlist outbound, biến môi trường)
- handoff/tasks/TASK-049-deadline-alerts/brief.md
"""
from __future__ import annotations

import inspect
import json
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

import httpx
import pytest

from backend.app.core.config import settings
from backend.tests.test_task_flow import (
    create_test_case,
    create_test_client,
    create_test_department,
    create_test_matter_type,
    create_test_user,
    db_conn,
)

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


@pytest.fixture(autouse=True)
def _token_kenh_thu(monkeypatch):
    """Mặc định production không có token (thiếu token → PENDING); test gửi tin tự đặt token thử."""
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "tg-test-token", raising=False)
    monkeypatch.setattr(settings, "ZALO_OA_ACCESS_TOKEN", "zalo-test-token", raising=False)


# =====================================================================
# Helper nạp module cần kiểm tra (để pytest collect được toàn bộ test suite)
# =====================================================================

def get_business_hours_fn():
    from backend.app.services.business_hours import working_hours_between
    return working_hours_between


def get_render_message_fn():
    from backend.app.services.external_messages import render_external_message
    return render_external_message


def get_send_deliveries_fn():
    from backend.app.services.notification_channels import send_pending_deliveries
    return send_pending_deliveries


def get_scan_deadlines_fn():
    from backend.app.services.deadline_scanner import scan_deadlines
    return scan_deadlines


async def _invoke(fn, *args, **kwargs):
    if inspect.iscoroutinefunction(fn):
        return await fn(*args, **kwargs)
    return fn(*args, **kwargs)


# =====================================================================
# 1. KIỂM THỬ HÀM THUẦN: business_hours.working_hours_between
# =====================================================================

def test_working_hours_same_day_intervals():
    """Giờ làm việc trong ngày: 08:00–12:00 và 13:00–17:00 (Asia/Ho_Chi_Minh)."""
    fn = get_business_hours_fn()

    # Thứ Hai 2026-11-16 (ngày làm việc chuẩn)
    # 08:30 -> 11:30 = 3 giờ
    start = datetime(2026, 11, 16, 8, 30, tzinfo=VN_TZ)
    end = datetime(2026, 11, 16, 11, 30, tzinfo=VN_TZ)
    res = fn(start, end, holidays=set())
    assert isinstance(res, Decimal), "Kết quả phải là kiểu Decimal, không dùng float/int"
    assert res == Decimal("3.0") or res == Decimal("3")

    # 11:00 -> 14:00 (qua giờ nghỉ trưa 12:00-13:00) = 2 giờ (1h sáng + 1h chiều)
    start = datetime(2026, 11, 16, 11, 0, tzinfo=VN_TZ)
    end = datetime(2026, 11, 16, 14, 0, tzinfo=VN_TZ)
    assert fn(start, end, holidays=set()) == Decimal("2")

    # 13:30 -> 16:30 = 3 giờ
    start = datetime(2026, 11, 16, 13, 30, tzinfo=VN_TZ)
    end = datetime(2026, 11, 16, 16, 30, tzinfo=VN_TZ)
    assert fn(start, end, holidays=set()) == Decimal("3")

    # Ngoài giờ: 07:00 -> 09:30 (bắt đầu trước 08:00) = 1.5 giờ (chỉ tính 08:00 -> 09:30)
    start = datetime(2026, 11, 16, 7, 0, tzinfo=VN_TZ)
    end = datetime(2026, 11, 16, 9, 30, tzinfo=VN_TZ)
    assert fn(start, end, holidays=set()) == Decimal("1.5")

    # Ngoài giờ: 15:30 -> 19:00 (kết thúc sau 17:00) = 1.5 giờ (chỉ tính 15:30 -> 17:00)
    start = datetime(2026, 11, 16, 15, 30, tzinfo=VN_TZ)
    end = datetime(2026, 11, 16, 19, 0, tzinfo=VN_TZ)
    assert fn(start, end, holidays=set()) == Decimal("1.5")

    # Hoàn toàn trong giờ nghỉ trưa: 12:15 -> 12:45 = 0 giờ
    start = datetime(2026, 11, 16, 12, 15, tzinfo=VN_TZ)
    end = datetime(2026, 11, 16, 12, 45, tzinfo=VN_TZ)
    assert fn(start, end, holidays=set()) == Decimal("0")

    # Hoàn toàn ban đêm: 20:00 -> 23:00 = 0 giờ
    start = datetime(2026, 11, 16, 20, 0, tzinfo=VN_TZ)
    end = datetime(2026, 11, 16, 23, 0, tzinfo=VN_TZ)
    assert fn(start, end, holidays=set()) == Decimal("0")


def test_working_hours_cross_day_and_weekend():
    """Tính giờ làm việc qua nhiều ngày và qua cuối tuần (Thứ Bảy, Chủ Nhật = 0)."""
    fn = get_business_hours_fn()

    # Thứ Sáu 16:00 (2026-11-20) -> Thứ Hai 09:00 (2026-11-23):
    # Thứ Sáu (16:00-17:00 = 1h), Thứ Bảy (0h), CN (0h), Thứ Hai (08:00-09:00 = 1h) -> 2 giờ
    fri_16 = datetime(2026, 11, 20, 16, 0, tzinfo=VN_TZ)
    mon_09 = datetime(2026, 11, 23, 9, 0, tzinfo=VN_TZ)
    assert fn(fri_16, mon_09, holidays=set()) == Decimal("2")

    # Cuối tuần thuần tuý: Thứ Bảy 10:00 -> Chủ Nhật 16:00 = 0 giờ
    sat_10 = datetime(2026, 11, 21, 10, 0, tzinfo=VN_TZ)
    sun_16 = datetime(2026, 11, 22, 16, 0, tzinfo=VN_TZ)
    assert fn(sat_10, sun_16, holidays=set()) == Decimal("0")

    # 1 tuần trọn vẹn: Thứ Hai 08:00 -> Thứ Sáu 17:00 (5 ngày x 8h = 40 giờ)
    mon_08 = datetime(2026, 11, 16, 8, 0, tzinfo=VN_TZ)
    fri_17 = datetime(2026, 11, 20, 17, 0, tzinfo=VN_TZ)
    assert fn(mon_08, fri_17, holidays=set()) == Decimal("40")


def test_working_hours_with_holidays():
    """Bỏ qua ngày trong set holidays (tương đương 0h làm việc)."""
    fn = get_business_hours_fn()

    # Thứ Hai 16:00 -> Thứ Tư 09:00. Thứ Ba 2026-11-17 là ngày lễ trong holidays:
    # Thứ Hai (16-17 = 1h) + Thứ Ba (0h do nghỉ lễ) + Thứ Tư (08-09 = 1h) -> 2 giờ
    mon_16 = datetime(2026, 11, 16, 16, 0, tzinfo=VN_TZ)
    wed_09 = datetime(2026, 11, 18, 9, 0, tzinfo=VN_TZ)
    holiday = date(2026, 11, 17)
    assert fn(mon_16, wed_09, holidays={holiday}) == Decimal("2")

    # Không có holiday thì giữa Thứ Hai 16:00 và Thứ Tư 09:00 là: 1 + 8 + 1 = 10 giờ
    assert fn(mon_16, wed_09, holidays=set()) == Decimal("10")


def test_working_hours_reverse_and_type():
    """start > end trả về số âm có cùng độ lớn; kiểu trả về luôn là Decimal."""
    fn = get_business_hours_fn()

    mon_09 = datetime(2026, 11, 23, 9, 0, tzinfo=VN_TZ)
    fri_16 = datetime(2026, 11, 20, 16, 0, tzinfo=VN_TZ)
    res = fn(mon_09, fri_16, holidays=set())
    assert isinstance(res, Decimal), "Kiểu dữ liệu phải là Decimal"
    assert res == Decimal("-2")

    # Cùng ngày đảo ngược: 14:00 -> 11:00 = -2 giờ
    start = datetime(2026, 11, 16, 14, 0, tzinfo=VN_TZ)
    end = datetime(2026, 11, 16, 11, 0, tzinfo=VN_TZ)
    assert fn(start, end, holidays=set()) == Decimal("-2")


def test_working_hours_timezone_aware_and_utc():
    """start và end ở UTC phải được quy đổi chuẩn xác sang giờ Việt Nam (Asia/Ho_Chi_Minh)."""
    fn = get_business_hours_fn()

    # 01:00 UTC = 08:00 VN (+7)
    # 05:00 UTC = 12:00 VN (+7) -> 4 giờ làm việc
    start_utc = datetime(2026, 11, 16, 1, 0, tzinfo=timezone.utc)
    end_utc = datetime(2026, 11, 16, 5, 0, tzinfo=timezone.utc)
    res = fn(start_utc, end_utc, holidays=set())
    assert res == Decimal("4")


# =====================================================================
# 2. KIỂM THỬ HÀM THUẦN: external_messages.render_external_message
# =====================================================================

def test_render_external_message_level1():
    """Cấp 1: Tiêu đề HẠN CHÓT CÔNG VIỆC, chứa mã vụ, tên task, hạn, link (docs/08 §2.2)."""
    fn = get_render_message_fn()
    case_code = "ASL-2026-TM-0045"
    task_title = "Soạn thảo bản giải trình phản đối đơn"
    due_at = datetime(2026, 10, 28, 17, 0, tzinfo=VN_TZ)
    link = "https://erp.asllaw.vn/cases/8f3a1b2c/tasks/t402"
    now = datetime(2026, 10, 28, 14, 0, tzinfo=VN_TZ)

    msg = fn(
        level=1,
        case_code=case_code,
        task_title=task_title,
        due_at=due_at,
        link=link,
        now=now,
    )
    assert "HẠN CHÓT CÔNG VIỆC" in msg
    assert case_code in msg
    assert task_title in msg
    assert link in msg
    assert "28/10/2026" in msg or "17:00" in msg


def test_render_external_message_level2():
    """Cấp 2: Tiêu đề QUÁ HẠN CÔNG VIỆC (brief mục 4)."""
    fn = get_render_message_fn()
    case_code = "ASL-2026-PA-0012"
    task_title = "Nộp đơn khiếu nại"
    due_at = datetime(2026, 10, 25, 17, 0, tzinfo=VN_TZ)
    link = "https://erp.asllaw.vn/cases/c1/tasks/t1"
    now = datetime(2026, 10, 26, 10, 0, tzinfo=VN_TZ)

    msg = fn(
        level=2,
        case_code=case_code,
        task_title=task_title,
        due_at=due_at,
        link=link,
        now=now,
    )
    assert "QUÁ HẠN CÔNG VIỆC" in msg
    assert case_code in msg
    assert task_title in msg
    assert link in msg


def test_render_external_message_signature_and_no_pii():
    """Hàm chỉ nhận đúng tham số tối thiểu, không nhận case/client object để tránh rò rỉ PII (DEC-03)."""
    fn = get_render_message_fn()
    sig = inspect.signature(fn)
    param_names = set(sig.parameters.keys())
    allowed_params = {"level", "case_code", "task_title", "due_at", "link", "now"}
    assert param_names.issubset(allowed_params), (
        f"render_external_message chỉ được nhận các tham số tối thiểu {allowed_params}, "
        f"nhưng nhận: {param_names}"
    )


# =====================================================================
# 3. KIỂM THỬ KÊNH GỬI NGOÀI: notification_channels
# =====================================================================

async def test_send_telegram_delivery_success():
    """Gửi delivery Telegram thành công qua MockTransport -> status SENT, sent_at được ghi nhận."""
    sender_fn = get_send_deliveries_fn()

    user_id = str(uuid.uuid4())
    notif_id = str(uuid.uuid4())
    delivery_id = str(uuid.uuid4())
    chat_id = "123456789"
    task_id = str(uuid.uuid4())

    captured_requests = []

    def mock_handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(request)
        if "api.telegram.org" in str(request.url):
            return httpx.Response(200, json={"ok": True, "result": {"message_id": 999}})
        return httpx.Response(404, json={"ok": False})

    with db_conn() as conn:
        conn.execute(
            """INSERT INTO users (id, email, password_hash, full_name, system_role, telegram_chat_id, is_active)
               VALUES (%s, %s, 'hash', 'Test TG User', 'ATTORNEY', %s, true)""",
            (user_id, f"tg_{uuid.uuid4().hex[:6]}@asllaw.vn", chat_id),
        )
        conn.execute(
            """INSERT INTO notifications (id, user_id, kind, title, body, link)
               VALUES (%s, %s, 'DEADLINE_ALERT', 'Hạn chót', 'Nhiệm vụ sắp hết hạn', '/cases/c1/tasks/t1')""",
            (notif_id, user_id),
        )
        conn.execute(
            """INSERT INTO notification_deliveries (id, notification_id, channel, dedupe_key, status, attempts)
               VALUES (%s, %s, 'TELEGRAM', %s, 'PENDING', 0)""",
            (delivery_id, notif_id, f"DEADLINE:{task_id}:L1:{user_id}:TELEGRAM"),
        )

    try:
        transport = httpx.MockTransport(mock_handler)
        async with httpx.AsyncClient(transport=transport) as http_client:
            await _invoke(sender_fn, client=http_client)

        assert len(captured_requests) >= 1, "Phải gọi request Telegram"
        req = captured_requests[0]
        assert "api.telegram.org" in str(req.url)
        assert req.method == "POST"
        body = json.loads(req.content.decode("utf-8"))
        assert str(body.get("chat_id")) == chat_id
        assert "Nhiệm vụ sắp hết hạn" in body.get("text", "") or "cases/c1/tasks/t1" in body.get("text", "")

        with db_conn() as conn:
            row = conn.execute(
                "SELECT status, sent_at, attempts FROM notification_deliveries WHERE id = %s",
                (delivery_id,),
            ).fetchone()
            assert row[0] == "SENT"
            assert row[1] is not None
    finally:
        with db_conn() as conn:
            conn.execute("DELETE FROM notification_deliveries WHERE id = %s", (delivery_id,))
            conn.execute("DELETE FROM notifications WHERE id = %s", (notif_id,))
            conn.execute("DELETE FROM users WHERE id = %s", (user_id,))


async def test_send_zalo_delivery_success():
    """Gửi delivery Zalo thành công qua MockTransport -> status SENT, sent_at được ghi nhận."""
    sender_fn = get_send_deliveries_fn()

    user_id = str(uuid.uuid4())
    notif_id = str(uuid.uuid4())
    delivery_id = str(uuid.uuid4())
    zalo_uid = "zalo_user_9988"
    task_id = str(uuid.uuid4())

    captured_requests = []

    def mock_handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(request)
        if "openapi.zalo.me" in str(request.url):
            return httpx.Response(200, json={"error": 0, "message": "Success"})
        return httpx.Response(404, json={"error": -1})

    with db_conn() as conn:
        conn.execute(
            """INSERT INTO users (id, email, password_hash, full_name, system_role, zalo_user_id, is_active)
               VALUES (%s, %s, 'hash', 'Test Zalo User', 'ATTORNEY', %s, true)""",
            (user_id, f"zalo_{uuid.uuid4().hex[:6]}@asllaw.vn", zalo_uid),
        )
        conn.execute(
            """INSERT INTO notifications (id, user_id, kind, title, body, link)
               VALUES (%s, %s, 'DEADLINE_ALERT', 'Hạn chót Zalo', 'Nhiệm vụ Zalo', '/cases/c1/tasks/t2')""",
            (notif_id, user_id),
        )
        conn.execute(
            """INSERT INTO notification_deliveries (id, notification_id, channel, dedupe_key, status, attempts)
               VALUES (%s, %s, 'ZALO', %s, 'PENDING', 0)""",
            (delivery_id, notif_id, f"DEADLINE:{task_id}:L1:{user_id}:ZALO"),
        )

    try:
        transport = httpx.MockTransport(mock_handler)
        async with httpx.AsyncClient(transport=transport) as http_client:
            await _invoke(sender_fn, client=http_client)

        assert len(captured_requests) >= 1, "Phải gọi request Zalo"
        req = captured_requests[0]
        assert "openapi.zalo.me" in str(req.url)
        assert req.method == "POST"
        body = json.loads(req.content.decode("utf-8"))
        assert body.get("recipient", {}).get("user_id") == zalo_uid

        with db_conn() as conn:
            row = conn.execute(
                "SELECT status, sent_at FROM notification_deliveries WHERE id = %s",
                (delivery_id,),
            ).fetchone()
            assert row[0] == "SENT"
            assert row[1] is not None
    finally:
        with db_conn() as conn:
            conn.execute("DELETE FROM notification_deliveries WHERE id = %s", (delivery_id,))
            conn.execute("DELETE FROM notifications WHERE id = %s", (notif_id,))
            conn.execute("DELETE FROM users WHERE id = %s", (user_id,))


async def test_channel_error_retry_and_no_token_leak():
    """Lỗi mạng -> attempts tăng, last_error không chứa secret token; sau 3 lần chuyển FAILED."""
    sender_fn = get_send_deliveries_fn()

    user_id = str(uuid.uuid4())
    notif_id = str(uuid.uuid4())
    delivery_id = str(uuid.uuid4())
    task_id = str(uuid.uuid4())
    secret_token = "SECRET_BOT_TOKEN_XYZ_123"

    def mock_handler(request: httpx.Request) -> httpx.Response:
        # Giả lập Telegram trả lỗi 500 kèm url chứa token
        return httpx.Response(500, json={"error": f"Internal error on bot {secret_token}"})

    with db_conn() as conn:
        conn.execute(
            """INSERT INTO users (id, email, password_hash, full_name, system_role, telegram_chat_id, is_active)
               VALUES (%s, %s, 'hash', 'Test Error User', 'ATTORNEY', '999', true)""",
            (user_id, f"err_{uuid.uuid4().hex[:6]}@asllaw.vn"),
        )
        conn.execute(
            """INSERT INTO notifications (id, user_id, kind, title, body, link)
               VALUES (%s, %s, 'DEADLINE_ALERT', 'Lỗi', 'Thử lại', '/cases/c1/tasks/t3')""",
            (notif_id, user_id),
        )
        # Giả sử đã thử 2 lần trước đó
        conn.execute(
            """INSERT INTO notification_deliveries (id, notification_id, channel, dedupe_key, status, attempts)
               VALUES (%s, %s, 'TELEGRAM', %s, 'PENDING', 2)""",
            (delivery_id, notif_id, f"DEADLINE:{task_id}:L1:{user_id}:TELEGRAM"),
        )

    try:
        transport = httpx.MockTransport(mock_handler)
        async with httpx.AsyncClient(transport=transport) as http_client:
            await _invoke(sender_fn, client=http_client)

        with db_conn() as conn:
            row = conn.execute(
                "SELECT status, attempts, last_error FROM notification_deliveries WHERE id = %s",
                (delivery_id,),
            ).fetchone()
            assert row[0] == "FAILED", "Sau 3 lần thất bại, status phải là FAILED"
            assert row[1] == 3
            assert row[2] is not None
            assert secret_token not in row[2], "last_error tuyệt đối không được chứa bot token!"
    finally:
        with db_conn() as conn:
            conn.execute("DELETE FROM notification_deliveries WHERE id = %s", (delivery_id,))
            conn.execute("DELETE FROM notifications WHERE id = %s", (notif_id,))
            conn.execute("DELETE FROM users WHERE id = %s", (user_id,))


async def test_outbound_allowlist_enforcement():
    """Chỉ cho phép gọi host trong OUTBOUND_ALLOWED_HOSTS (mặc định api.telegram.org, openapi.zalo.me)."""
    assert hasattr(settings, "OUTBOUND_ALLOWED_HOSTS"), "settings phải có OUTBOUND_ALLOWED_HOSTS"
    allowed = [h.strip() for h in settings.OUTBOUND_ALLOWED_HOSTS.split(",") if h.strip()]
    assert "api.telegram.org" in allowed
    assert "openapi.zalo.me" in allowed


# =====================================================================
# 4. KIỂM THỬ SCANNER & NGHIỆM THU TC-NOTIF-01 -> 03
# =====================================================================

async def test_tc_notif_01_level1_alert():
    """TC-NOTIF-01: Task còn 3 giờ làm việc -> cấp 1 tới người thực hiện; tạo WEB + TELEGRAM + ZALO."""
    scanner_fn = get_scan_deadlines_fn()
    sender_fn = get_send_deliveries_fn()

    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"], status="ACTIVE")
        attorney = create_test_user(conn, role="ATTORNEY")
        tg_id = f"tg_{uuid.uuid4().hex[:8]}"
        zalo_id = f"zalo_{uuid.uuid4().hex[:8]}"
        conn.execute(
            "UPDATE users SET telegram_chat_id = %s, zalo_user_id = %s WHERE id = %s",
            (tg_id, zalo_id, attorney["id"]),
        )
        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'EXECUTOR', NOW())""",
            (case["id"], attorney["id"]),
        )

        stage_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO case_stages (id, case_id, name, order_index, status) VALUES (%s, %s, 'Giai đoạn 1', 1, 'ACTIVE')",
            (stage_id, case["id"]),
        )

        task_id = str(uuid.uuid4())
        # Thứ Hai 2026-11-16 09:00: task hạn 13:00 cùng ngày (còn đúng 3 giờ làm việc: 9-12 = 3h)
        scan_now = datetime(2026, 11, 16, 9, 0, tzinfo=VN_TZ)
        due_at = datetime(2026, 11, 16, 13, 0, tzinfo=VN_TZ)

        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to, due_at)
               VALUES (%s, %s, %s, 'Nộp đơn đăng ký nhãn hiệu', 'IN_PROGRESS', %s, %s)""",
            (task_id, case["id"], stage_id, attorney["id"], due_at),
        )

    try:
        res = await _invoke(scanner_fn, now=scan_now)
        assert isinstance(res, dict)
        assert res.get("level1", 0) >= 1
        assert res.get("deliveries_created", 0) >= 2  # Ít nhất WEB + TELEGRAM + ZALO

        with db_conn() as conn:
            # Kiểm tra notification web trong bảng notifications
            n_row = conn.execute(
                "SELECT id, kind, title, body, link FROM notifications WHERE user_id = %s",
                (attorney["id"],),
            ).fetchone()
            assert n_row is not None, "Phải tạo notification cho người thực hiện"
            assert f"/cases/{case['id']}/tasks/{task_id}" in n_row[4]

            # Kiểm tra deliveries
            deliveries = conn.execute(
                "SELECT channel, dedupe_key, status FROM notification_deliveries WHERE notification_id = %s",
                (n_row[0],),
            ).fetchall()
            channels = {d[0] for d in deliveries}
            assert "WEB" in channels
            assert "TELEGRAM" in channels
            assert "ZALO" in channels

            # Dedupe key chuẩn theo blueprint
            tg_delivery = [d for d in deliveries if d[0] == "TELEGRAM"][0]
            expected_key = f"DEADLINE:{task_id}:L1:{attorney['id']}:TELEGRAM"
            assert tg_delivery[1] == expected_key
            assert tg_delivery[2] == "PENDING"

        # Gửi delivery qua mock transport để kiểm tra payload ra ngoài
        telegram_requests = []
        def mock_handler(request: httpx.Request) -> httpx.Response:
            if "api.telegram.org" in str(request.url):
                telegram_requests.append(request)
                return httpx.Response(200, json={"ok": True})
            return httpx.Response(200, json={"error": 0})

        transport = httpx.MockTransport(mock_handler)
        async with httpx.AsyncClient(transport=transport) as http_client:
            await _invoke(sender_fn, client=http_client)

        assert len(telegram_requests) >= 1, "Phải gửi message tới Telegram"
        tg_payload = json.loads(telegram_requests[0].content.decode("utf-8"))
        tg_text = tg_payload.get("text", "")
        assert case["case_code"] in tg_text
        assert "Nộp đơn đăng ký nhãn hiệu" in tg_text
        assert f"/cases/{case['id']}/tasks/{task_id}" in tg_text

        with db_conn() as conn:
            st = conn.execute(
                "SELECT status FROM notification_deliveries WHERE dedupe_key = %s",
                (expected_key,),
            ).fetchone()
            assert st[0] == "SENT"
    finally:
        with db_conn() as conn:
            conn.execute("DELETE FROM cases WHERE id = %s", (case["id"],))
            conn.execute("DELETE FROM users WHERE id = %s", (attorney["id"],))
            conn.execute("DELETE FROM matter_types WHERE id = %s", (mt["id"],))
            conn.execute("DELETE FROM clients WHERE id = %s", (client["id"],))
            conn.execute("DELETE FROM departments WHERE id = %s", (dept["id"],))


async def test_tc_notif_02_level2_escalation_and_dedupe():
    """TC-NOTIF-02: Quá hạn > 4 giờ làm việc -> cấp 2 tới Case Manager & Supervisor, không gửi người ngoài;
    chạy 2 lần -> lần 2 tạo 0."""
    scanner_fn = get_scan_deadlines_fn()

    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"], status="ACTIVE")

        cm_user = create_test_user(conn, role="MANAGER", full_name="Trưởng Vụ Case Manager")
        sp_user = create_test_user(conn, role="MANAGER", full_name="Giám sát Supervisor")
        ex_user = create_test_user(conn, role="ATTORNEY", full_name="Thực Hiện Executor")
        other_user = create_test_user(conn, role="ATTORNEY", full_name="Người Ngoài Vụ")

        conn.execute(
            """INSERT INTO case_assignments (case_id, user_id, role_in_case, assigned_at)
               VALUES (%s, %s, 'CASE_MANAGER', NOW()),
                      (%s, %s, 'SUPERVISOR', NOW()),
                      (%s, %s, 'EXECUTOR', NOW())""",
            (case["id"], cm_user["id"], case["id"], sp_user["id"], case["id"], ex_user["id"]),
        )

        stage_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO case_stages (id, case_id, name, order_index, status) VALUES (%s, %s, 'Giai đoạn 1', 1, 'ACTIVE')",
            (stage_id, case["id"]),
        )

        task_id = str(uuid.uuid4())
        # Quá hạn 5 giờ làm việc:
        # Hạn là 2026-11-16 09:00, quét lúc 2026-11-16 15:00
        # Từ 09:00 -> 15:00 có 09-12 (3h) + 13-15 (2h) = 5 giờ làm việc quá hạn (> 4h)
        due_at = datetime(2026, 11, 16, 9, 0, tzinfo=VN_TZ)
        scan_now = datetime(2026, 11, 16, 15, 0, tzinfo=VN_TZ)

        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to, due_at)
               VALUES (%s, %s, %s, 'Task Quá Hạn Nghiêm Trọng', 'TODO', %s, %s)""",
            (task_id, case["id"], stage_id, ex_user["id"], due_at),
        )

    try:
        # Lần chạy 1
        res1 = await _invoke(scanner_fn, now=scan_now)
        assert res1.get("level2", 0) >= 1
        assert res1.get("deliveries_created", 0) >= 2

        with db_conn() as conn:
            cm_notif = conn.execute(
                "SELECT id FROM notifications WHERE user_id = %s", (cm_user["id"],)
            ).fetchall()
            sp_notif = conn.execute(
                "SELECT id FROM notifications WHERE user_id = %s", (sp_user["id"],)
            ).fetchall()
            ex_notif = conn.execute(
                "SELECT id FROM notifications WHERE user_id = %s", (ex_user["id"],)
            ).fetchall()
            other_notif = conn.execute(
                "SELECT id FROM notifications WHERE user_id = %s", (other_user["id"],)
            ).fetchall()

            assert len(cm_notif) >= 1, "Case Manager phải nhận cảnh báo cấp 2"
            assert len(sp_notif) >= 1, "Supervisor phải nhận cảnh báo cấp 2"
            assert len(ex_notif) == 0, "Executor không nhận cảnh báo cấp 2 (trừ khi là CM/Supervisor)"
            assert len(other_notif) == 0, "Người ngoài vụ việc tuyệt đối không nhận cảnh báo"

            # Kiểm tra dedupe_key cấp 2
            cm_deliveries = conn.execute(
                "SELECT dedupe_key FROM notification_deliveries WHERE notification_id = %s",
                (cm_notif[0][0],),
            ).fetchall()
            assert any(f"DEADLINE:{task_id}:L2:{cm_user['id']}" in d[0] for d in cm_deliveries)

        # Lần chạy 2 (idempotency / chống trùng)
        res2 = await _invoke(scanner_fn, now=scan_now)
        assert res2.get("deliveries_created", 0) == 0, "Lần 2 chạy lại cùng mốc phải tạo 0 deliveries mới"

    finally:
        with db_conn() as conn:
            conn.execute("DELETE FROM cases WHERE id = %s", (case["id"],))
            conn.execute("DELETE FROM users WHERE id IN (%s, %s, %s, %s)",
                         (cm_user["id"], sp_user["id"], ex_user["id"], other_user["id"]))
            conn.execute("DELETE FROM matter_types WHERE id = %s", (mt["id"],))
            conn.execute("DELETE FROM clients WHERE id = %s", (client["id"],))
            conn.execute("DELETE FROM departments WHERE id = %s", (dept["id"],))


async def test_deadline_scanner_case_paused_or_closed_skipped():
    """Vụ việc ở trạng thái PAUSED hoặc CLOSED không được sinh cảnh báo hạn chót."""
    scanner_fn = get_scan_deadlines_fn()

    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case_paused = create_test_case(conn, client["id"], mt["id"], dept["id"], status="PAUSED")
        attorney = create_test_user(conn, role="ATTORNEY")

        conn.execute(
            "INSERT INTO case_assignments (case_id, user_id, role_in_case) VALUES (%s, %s, 'EXECUTOR')",
            (case_paused["id"], attorney["id"]),
        )
        stage_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO case_stages (id, case_id, name, order_index, status) VALUES (%s, %s, 'S1', 1, 'ACTIVE')",
            (stage_id, case_paused["id"]),
        )
        task_id = str(uuid.uuid4())
        scan_now = datetime(2026, 11, 16, 9, 0, tzinfo=VN_TZ)
        due_at = datetime(2026, 11, 16, 11, 0, tzinfo=VN_TZ)  # còn 2h làm việc

        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to, due_at)
               VALUES (%s, %s, %s, 'Task trong vụ paused', 'TODO', %s, %s)""",
            (task_id, case_paused["id"], stage_id, attorney["id"], due_at),
        )

    try:
        res = await _invoke(scanner_fn, now=scan_now)
        with db_conn() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM notifications WHERE user_id = %s", (attorney["id"],)
            ).fetchone()[0]
            assert count == 0, "Không sinh notification nào khi case ở trạng thái PAUSED"
    finally:
        with db_conn() as conn:
            conn.execute("DELETE FROM cases WHERE id = %s", (case_paused["id"],))
            conn.execute("DELETE FROM users WHERE id = %s", (attorney["id"],))
            conn.execute("DELETE FROM matter_types WHERE id = %s", (mt["id"],))
            conn.execute("DELETE FROM clients WHERE id = %s", (client["id"],))
            conn.execute("DELETE FROM departments WHERE id = %s", (dept["id"],))


async def test_deadline_scanner_deadline_over_24h_skipped():
    """Task còn > 24 giờ làm việc -> không sinh cảnh báo cấp 1."""
    scanner_fn = get_scan_deadlines_fn()

    with db_conn() as conn:
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"], status="ACTIVE")
        attorney = create_test_user(conn, role="ATTORNEY")

        conn.execute(
            "INSERT INTO case_assignments (case_id, user_id, role_in_case) VALUES (%s, %s, 'EXECUTOR')",
            (case["id"], attorney["id"]),
        )
        stage_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO case_stages (id, case_id, name, order_index, status) VALUES (%s, %s, 'S1', 1, 'ACTIVE')",
            (stage_id, case["id"]),
        )
        task_id = str(uuid.uuid4())
        # Thứ Hai 09:00 -> Thứ Hai tuần sau 09:00 = 40 giờ làm việc; vẫn > 24h kể cả khi DB dùng chung
        # còn sót một ngày lễ thử trong tuần (test đọc holidays chèn 17/11).
        scan_now = datetime(2026, 11, 16, 9, 0, tzinfo=VN_TZ)
        due_at = datetime(2026, 11, 23, 9, 0, tzinfo=VN_TZ)

        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to, due_at)
               VALUES (%s, %s, %s, 'Task còn xa hạn', 'TODO', %s, %s)""",
            (task_id, case["id"], stage_id, attorney["id"], due_at),
        )

    try:
        await _invoke(scanner_fn, now=scan_now)
        with db_conn() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM notifications WHERE user_id = %s", (attorney["id"],)
            ).fetchone()[0]
            assert count == 0, "Task còn > 24h làm việc không được kích hoạt cảnh báo"
    finally:
        with db_conn() as conn:
            conn.execute("DELETE FROM cases WHERE id = %s", (case["id"],))
            conn.execute("DELETE FROM users WHERE id = %s", (attorney["id"],))
            conn.execute("DELETE FROM matter_types WHERE id = %s", (mt["id"],))
            conn.execute("DELETE FROM clients WHERE id = %s", (client["id"],))
            conn.execute("DELETE FROM departments WHERE id = %s", (dept["id"],))


async def test_deadline_scanner_reads_holidays_from_db():
    """Scanner phải đọc bảng holidays trong Postgres để tính trừ ngày nghỉ lễ."""
    scanner_fn = get_scan_deadlines_fn()
    holiday_date = date(2026, 11, 17)  # Thứ Ba

    with db_conn() as conn:
        conn.execute(
            "INSERT INTO holidays (date, name) VALUES (%s, 'Ngày Lễ Thử Nghiệm') ON CONFLICT DO NOTHING",
            (holiday_date,),
        )
        dept = create_test_department(conn)
        client = create_test_client(conn)
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(conn, client["id"], mt["id"], dept["id"], status="ACTIVE")
        attorney = create_test_user(conn, role="ATTORNEY")

        conn.execute(
            "INSERT INTO case_assignments (case_id, user_id, role_in_case) VALUES (%s, %s, 'EXECUTOR')",
            (case["id"], attorney["id"]),
        )
        stage_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO case_stages (id, case_id, name, order_index, status) VALUES (%s, %s, 'S1', 1, 'ACTIVE')",
            (stage_id, case["id"]),
        )
        task_id = str(uuid.uuid4())
        # Thứ Hai 16:00 (2026-11-16) -> Thứ Năm 17:00 (2026-11-19).
        # Nếu không có ngày lễ: Thứ Hai (1h) + Ba (8h) + Tư (8h) + Năm (8h) = 25 giờ (> 24h -> không cảnh báo).
        # Có Thứ Ba là holiday trong DB: Thứ Hai (1h) + Ba (0h) + Tư (8h) + Năm (8h) = 17 giờ (<= 24h -> CÓ CẢNH BÁO).
        scan_now = datetime(2026, 11, 16, 16, 0, tzinfo=VN_TZ)
        due_at = datetime(2026, 11, 19, 17, 0, tzinfo=VN_TZ)

        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to, due_at)
               VALUES (%s, %s, %s, 'Task holiday test', 'IN_PROGRESS', %s, %s)""",
            (task_id, case["id"], stage_id, attorney["id"], due_at),
        )

    try:
        await _invoke(scanner_fn, now=scan_now)
        with db_conn() as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM notifications WHERE user_id = %s", (attorney["id"],)
            ).fetchone()[0]
            assert count >= 1, "Scanner phải tính trừ ngày nghỉ trong DB holidays để kích hoạt cấp 1"
    finally:
        with db_conn() as conn:
            conn.execute("DELETE FROM holidays WHERE date = %s", (holiday_date,))
            conn.execute("DELETE FROM cases WHERE id = %s", (case["id"],))
            conn.execute("DELETE FROM users WHERE id = %s", (attorney["id"],))
            conn.execute("DELETE FROM matter_types WHERE id = %s", (mt["id"],))
            conn.execute("DELETE FROM clients WHERE id = %s", (client["id"],))
            conn.execute("DELETE FROM departments WHERE id = %s", (dept["id"],))


async def test_tc_notif_03_zero_pii_leak():
    """TC-NOTIF-03: Tuyệt đối không lọt tên khách, tên vụ việc, MST, SĐT, email, số tiền ra dịch vụ ngoài (DEC-03)."""
    scanner_fn = get_scan_deadlines_fn()
    sender_fn = get_send_deliveries_fn()

    secret_client_name = "Tập Đoàn Tài Chính Bí Mật ASL"
    secret_case_title = "Vụ Kiện Bản Quyền Triệu Đô Tuyệt Mật"
    secret_tax_code = "01" + str(uuid.uuid4().int)[:8]  # MST ngẫu nhiên: cột tax_code UNIQUE trên DB dùng chung
    secret_phone = "0988776655"
    secret_email = "secret_ceo@aslgroup.vn"
    secret_money_raw = "9900000000"

    with db_conn() as conn:
        dept = create_test_department(conn)
        client_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO clients (id, client_type, name, normalized_name, tax_code, phone, email, address, category_group)
               VALUES (%s, 'ENTERPRISE', %s, %s, %s, %s, %s, '123 Secret St', 'VIP')""",
            (client_id, secret_client_name, secret_client_name.lower(), secret_tax_code, secret_phone, secret_email),
        )
        mt = create_test_matter_type(conn, dept["id"])
        case = create_test_case(
            conn,
            client_id,
            mt["id"],
            dept["id"],
            title=secret_case_title,
            contract_value=secret_money_raw,
            status="ACTIVE",
        )
        attorney = create_test_user(conn, role="ATTORNEY")
        tg_id = f"tg_{uuid.uuid4().hex[:8]}"
        conn.execute("UPDATE users SET telegram_chat_id = %s WHERE id = %s", (tg_id, attorney["id"]))
        conn.execute(
            "INSERT INTO case_assignments (case_id, user_id, role_in_case) VALUES (%s, %s, 'EXECUTOR')",
            (case["id"], attorney["id"]),
        )
        stage_id = str(uuid.uuid4())
        conn.execute(
            "INSERT INTO case_stages (id, case_id, name, order_index, status) VALUES (%s, %s, 'S1', 1, 'ACTIVE')",
            (stage_id, case["id"]),
        )
        task_id = str(uuid.uuid4())
        scan_now = datetime(2026, 11, 16, 9, 0, tzinfo=VN_TZ)
        due_at = datetime(2026, 11, 16, 12, 0, tzinfo=VN_TZ)  # 3h

        conn.execute(
            """INSERT INTO case_tasks (id, case_id, stage_id, title, status, assigned_to, due_at)
               VALUES (%s, %s, %s, 'Chuẩn bị hồ sơ pháp lý', 'IN_PROGRESS', %s, %s)""",
            (task_id, case["id"], stage_id, attorney["id"], due_at),
        )

    try:
        await _invoke(scanner_fn, now=scan_now)

        captured_requests = []
        def mock_handler(req: httpx.Request) -> httpx.Response:
            captured_requests.append(req)
            return httpx.Response(200, json={"ok": True})

        transport = httpx.MockTransport(mock_handler)
        async with httpx.AsyncClient(transport=transport) as http_client:
            await _invoke(sender_fn, client=http_client)

        # 1. Kiểm tra trong DB (bảng notifications)
        with db_conn() as conn:
            notifs = conn.execute(
                "SELECT title, body FROM notifications WHERE user_id = %s", (attorney["id"],)
            ).fetchall()
            for title, body in notifs:
                combined = f"{title} {body}"
                assert secret_client_name not in combined, "Không được lộ tên khách hàng trong notification"
                assert secret_case_title not in combined, "Không được lộ tên vụ việc trong notification"
                assert secret_tax_code not in combined, "Không được lộ MST trong notification"
                assert secret_phone not in combined, "Không được lộ SĐT trong notification"
                assert secret_email not in combined, "Không được lộ email trong notification"
                assert secret_money_raw not in combined, "Không được lộ số tiền trong notification"

        # 2. Kiểm tra mọi payload gửi ra ngoài (Telegram, Zalo)
        assert len(captured_requests) >= 1
        for req in captured_requests:
            content_str = req.content.decode("utf-8")
            assert secret_client_name not in content_str, "Không được lộ tên khách ra dịch vụ ngoài"
            assert secret_case_title not in content_str, "Không được lộ tên vụ việc ra dịch vụ ngoài"
            assert secret_tax_code not in content_str, "Không được lộ MST ra dịch vụ ngoài"
            assert secret_phone not in content_str, "Không được lộ SĐT ra dịch vụ ngoài"
            assert secret_email not in content_str, "Không được lộ email ra dịch vụ ngoài"
            assert secret_money_raw not in content_str, "Không được lộ số tiền hợp đồng ra dịch vụ ngoài"
    finally:
        with db_conn() as conn:
            conn.execute("DELETE FROM cases WHERE id = %s", (case["id"],))
            conn.execute("DELETE FROM users WHERE id = %s", (attorney["id"],))
            conn.execute("DELETE FROM matter_types WHERE id = %s", (mt["id"],))
            conn.execute("DELETE FROM clients WHERE id = %s", (client_id,))
            conn.execute("DELETE FROM departments WHERE id = %s", (dept["id"],))


# =====================================================================
# 5. KIỂM THỬ CLI & CONFIG
# =====================================================================

def test_run_deadline_scan_cli_entrypoint():
    """Module CLI backend.app.scripts.run_deadline_scan có thể import được và có hàm thực thi."""
    import importlib
    mod = importlib.import_module("backend.app.scripts.run_deadline_scan")
    assert hasattr(mod, "main") or hasattr(mod, "run_scan"), "CLI script phải có hàm main hoặc run_scan"


def test_config_settings_fields():
    """Config settings phải có đầy đủ các biến môi trường cấu hình theo brief mục 3 & 4."""
    assert hasattr(settings, "ERP_PUBLIC_URL"), "settings thiếu ERP_PUBLIC_URL"
    assert hasattr(settings, "OUTBOUND_ALLOWED_HOSTS"), "settings thiếu OUTBOUND_ALLOWED_HOSTS"
    assert hasattr(settings, "TELEGRAM_BOT_TOKEN"), "settings thiếu TELEGRAM_BOT_TOKEN"
    assert hasattr(settings, "ZALO_OA_ACCESS_TOKEN"), "settings thiếu ZALO_OA_ACCESS_TOKEN"
    assert settings.ERP_PUBLIC_URL.startswith("http")
    assert "api.telegram.org" in settings.OUTBOUND_ALLOWED_HOSTS
