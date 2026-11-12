from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Set

from sqlalchemy import text

from backend.app.core.config import settings
from backend.app.db.postgres import engine
from backend.app.services.business_hours import VN_TZ, working_hours_between
from backend.app.services.external_messages import render_external_message
from backend.app.services.notifications import format_iso_utc, publish_notification, validate_relative_link

logger = logging.getLogger(__name__)


def _normalize_date(val: Any) -> date:
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    return date.fromisoformat(str(val))


async def scan_deadlines(now: Optional[datetime] = None) -> Dict[str, int]:
    """Quét hạn chót các công việc theo giờ làm việc, leo thang 2 cấp (DEC-03, TSK-21).

    Cấp 1: 0 < working_hours_between(now, due_at) <= 24 -> người thực hiện.
    Cấp 2: working_hours_between(due_at, now) > 4 -> Case Manager & Supervisor của vụ việc.

    Trả về: {"level1": n, "level2": m, "deliveries_created": k}
    """
    if now is None:
        now = datetime.now(VN_TZ)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=VN_TZ)
    else:
        now = now.astimezone(VN_TZ)

    # 1. Đọc danh sách ngày lễ và task hợp lệ
    async with engine.connect() as r_conn:
        h_res = await r_conn.execute(text("SELECT date FROM holidays"))
        holidays: Set[date] = {_normalize_date(row[0]) for row in h_res.fetchall()}

        t_res = await r_conn.execute(
            text("""
                SELECT 
                    t.id AS task_id,
                    t.case_id,
                    t.title AS task_title,
                    t.status AS task_status,
                    t.assigned_to,
                    t.due_at,
                    c.case_code,
                    c.status AS case_status
                FROM case_tasks t
                JOIN cases c ON t.case_id = c.id
                WHERE t.status IN ('TODO', 'IN_PROGRESS')
                  AND t.due_at IS NOT NULL
                  AND t.assigned_to IS NOT NULL
                  AND c.status NOT IN ('PAUSED', 'CLOSED')
            """)
        )
        tasks = t_res.mappings().fetchall()

    level1_count = 0
    level2_count = 0
    deliveries_created = 0

    erp_base = settings.ERP_PUBLIC_URL.rstrip("/")

    for t in tasks:
        task_id = str(t["task_id"])
        case_id = str(t["case_id"])
        case_code = str(t["case_code"])
        task_title = str(t["task_title"])
        assigned_to = str(t["assigned_to"])
        raw_due = t["due_at"]

        if raw_due.tzinfo is None:
            due_vn = raw_due.replace(tzinfo=VN_TZ)
        else:
            due_vn = raw_due.astimezone(VN_TZ)

        # Tính toán giờ làm việc
        rem_hours = working_hours_between(now, due_vn, holidays=holidays)
        overdue_hours = working_hours_between(due_vn, now, holidays=holidays)

        is_level1 = Decimal("0") < rem_hours <= Decimal("24")
        is_level2 = overdue_hours > Decimal("4")

        if not is_level1 and not is_level2:
            continue

        level = 1 if is_level1 else 2

        # Xác định danh sách người nhận
        if level == 1:
            recipient_ids = [assigned_to]
        else:
            async with engine.connect() as r_conn:
                cm_sp_res = await r_conn.execute(
                    text("""
                        SELECT DISTINCT user_id::text
                        FROM case_assignments
                        WHERE case_id = :case_id
                          AND role_in_case IN ('CASE_MANAGER', 'SUPERVISOR')
                          AND unassigned_at IS NULL
                    """),
                    {"case_id": uuid.UUID(case_id)},
                )
                recipient_ids = [r[0] for r in cm_sp_res.fetchall()]

        if not recipient_ids:
            continue

        task_deliveries = 0
        link_rel = f"/cases/{case_id}/tasks/{task_id}"
        link_ext = f"{erp_base}/cases/{case_id}/tasks/{task_id}"
        msg_body = render_external_message(
            level=level,
            case_code=case_code,
            task_title=task_title,
            due_at=due_vn,
            link=link_ext,
            now=now,
        )
        msg_title = "QUÁ HẠN CÔNG VIỆC" if level == 2 else "HẠN CHÓT CÔNG VIỆC"

        for uid in recipient_ids:
            web_key = f"DEADLINE:{task_id}:L{level}:{uid}:WEB"

            # Kiểm tra chống trùng: chỉ tạo khi dòng WEB chưa từng tồn tại
            async with engine.connect() as r_conn:
                existing = await r_conn.execute(
                    text("SELECT 1 FROM notification_deliveries WHERE dedupe_key = :k"),
                    {"k": web_key},
                )
                if existing.fetchone() is not None:
                    continue

                # Lấy thông tin tài khoản người nhận
                u_res = await r_conn.execute(
                    text("SELECT id, telegram_chat_id, zalo_user_id FROM users WHERE id = :uid"),
                    {"uid": uuid.UUID(uid)},
                )
                user_row = u_res.mappings().fetchone()

            if not user_row:
                continue

            notif_uuid = uuid.uuid4()
            now_utc = datetime.now(timezone.utc)

            # Chèn notification và các dòng delivery trong một transaction duy nhất
            async with engine.begin() as w_conn:
                # 1. Chèn vào bảng notifications
                await w_conn.execute(
                    text("""
                        INSERT INTO notifications (id, user_id, kind, title, body, link, read_at, created_at)
                        VALUES (:id, :user_id, 'DEADLINE_ALERT', :title, :body, :link, NULL, :created_at)
                    """),
                    {
                        "id": notif_uuid,
                        "user_id": uuid.UUID(uid),
                        "title": msg_title,
                        "body": msg_body,
                        "link": link_rel,
                        "created_at": now_utc,
                    },
                )

                # 2. Chèn delivery WEB
                web_ins = await w_conn.execute(
                    text("""
                        INSERT INTO notification_deliveries (
                            id, notification_id, channel, dedupe_key, status, sent_at, attempts
                        ) VALUES (
                            :id, :notif_id, 'WEB', :k, 'SENT', :sent_at, 0
                        ) ON CONFLICT (dedupe_key) DO NOTHING
                    """),
                    {
                        "id": uuid.uuid4(),
                        "notif_id": notif_uuid,
                        "k": web_key,
                        "sent_at": now_utc,
                    },
                )
                if web_ins.rowcount > 0:
                    deliveries_created += 1
                    task_deliveries += 1

                # 3. Chèn delivery TELEGRAM nếu user có telegram_chat_id
                tg_id = user_row.get("telegram_chat_id")
                if tg_id:
                    tg_key = f"DEADLINE:{task_id}:L{level}:{uid}:TELEGRAM"
                    tg_ins = await w_conn.execute(
                        text("""
                            INSERT INTO notification_deliveries (
                                id, notification_id, channel, dedupe_key, status, attempts
                            ) VALUES (
                                :id, :notif_id, 'TELEGRAM', :k, 'PENDING', 0
                            ) ON CONFLICT (dedupe_key) DO NOTHING
                        """),
                        {
                            "id": uuid.uuid4(),
                            "notif_id": notif_uuid,
                            "k": tg_key,
                        },
                    )
                    if tg_ins.rowcount > 0:
                        deliveries_created += 1
                        task_deliveries += 1

                # 4. Chèn delivery ZALO nếu user có zalo_user_id
                zalo_id = user_row.get("zalo_user_id")
                if zalo_id:
                    zalo_key = f"DEADLINE:{task_id}:L{level}:{uid}:ZALO"
                    zalo_ins = await w_conn.execute(
                        text("""
                            INSERT INTO notification_deliveries (
                                id, notification_id, channel, dedupe_key, status, attempts
                            ) VALUES (
                                :id, :notif_id, 'ZALO', :k, 'PENDING', 0
                            ) ON CONFLICT (dedupe_key) DO NOTHING
                        """),
                        {
                            "id": uuid.uuid4(),
                            "notif_id": notif_uuid,
                            "k": zalo_key,
                        },
                    )
                    if zalo_ins.rowcount > 0:
                        deliveries_created += 1
                        task_deliveries += 1

            # Thử phát Redis pub/sub nếu có (không làm fail tiến trình nếu Redis lỗi)
            try:
                item = {
                    "id": str(notif_uuid),
                    "kind": "DEADLINE_ALERT",
                    "title": msg_title,
                    "body": msg_body,
                    "link": link_rel,
                    "created_at": format_iso_utc(now_utc),
                    "read_at": None,
                }
                await publish_notification(str(uid), item)
            except Exception:
                pass

        if task_deliveries > 0:
            if level == 1:
                level1_count += 1
            else:
                level2_count += 1

    return {
        "level1": level1_count,
        "level2": level2_count,
        "deliveries_created": deliveries_created,
    }
