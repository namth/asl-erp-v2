from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

import httpx
from sqlalchemy import text

from backend.app.core.config import settings
from backend.app.db.postgres import engine

logger = logging.getLogger(__name__)


def sanitize_error_message(msg: str) -> str:
    """Loại bỏ triệt để token, secret, bot token khỏi thông điệp lỗi trước khi lưu vào DB (DEC-03)."""
    if not msg:
        return "Unknown error"
    s = str(msg)

    # 1. Che token đã biết từ settings
    if getattr(settings, "TELEGRAM_BOT_TOKEN", None):
        s = s.replace(settings.TELEGRAM_BOT_TOKEN, "[REDACTED]")
    if getattr(settings, "ZALO_OA_ACCESS_TOKEN", None):
        s = s.replace(settings.ZALO_OA_ACCESS_TOKEN, "[REDACTED]")

    # 2. Che đường dẫn URL chứa bot token
    s = re.sub(r"/bot[^/\s]+/", "/bot[REDACTED]/", s)

    # 3. Che chuỗi regex dạng "bot <TOKEN>" hoặc "bot:<TOKEN>"
    s = re.sub(r"(bot[:/\s]+)[^\s,;\"'}{]+", r"\g<1>[REDACTED]", s, flags=re.IGNORECASE)

    # 4. Che các tham số access_token, token, secret
    s = re.sub(r"(access_token|token|secret)[=:\s]+[^\s,;\"'}{]+", r"\1=[REDACTED]", s, flags=re.IGNORECASE)

    return s[:500]


def is_host_allowed(url_str: str) -> bool:
    """Kiểm tra host của request có nằm trong OUTBOUND_ALLOWED_HOSTS không."""
    allowed = [h.strip().lower() for h in settings.OUTBOUND_ALLOWED_HOSTS.split(",") if h.strip()]
    parsed = urlparse(url_str)
    host = (parsed.hostname or "").lower()
    return host in allowed


async def _process_deliveries(client: httpx.AsyncClient) -> int:
    """Lấy các dòng PENDING kênh ngoài gửi qua client httpx."""
    async with engine.connect() as r_conn:
        res = await r_conn.execute(
            text("""
                SELECT 
                    d.id AS delivery_id,
                    d.channel,
                    d.attempts,
                    n.title,
                    n.body,
                    n.link,
                    u.telegram_chat_id,
                    u.zalo_user_id
                FROM notification_deliveries d
                JOIN notifications n ON d.notification_id = n.id
                JOIN users u ON n.user_id = u.id
                WHERE d.status = 'PENDING'
                  AND d.channel IN ('TELEGRAM', 'ZALO')
                  AND d.attempts < 3
                ORDER BY d.created_at DESC, d.id DESC
            """)
        )
        deliveries = res.mappings().fetchall()

    sent_count = 0

    for d in deliveries:
        delivery_id = uuid.UUID(str(d["delivery_id"]))
        channel = d["channel"]
        attempts = int(d["attempts"])
        body_text = d["body"] or ""
        link = d["link"] or ""
        text_content = body_text
        if link and link not in text_content:
            text_content = f"{text_content}\n{link}".strip()

        # Chuẩn bị thông số gửi theo từng kênh
        if channel == "TELEGRAM":
            token = getattr(settings, "TELEGRAM_BOT_TOKEN", "")
            if not token:
                # Thiếu token kênh -> để PENDING, không gọi mạng
                continue

            chat_id = d["telegram_chat_id"]
            if not chat_id:
                # Không có chat_id -> không thể gửi
                new_attempts = attempts + 1
                new_status = "FAILED" if new_attempts >= 3 else "PENDING"
                async with engine.begin() as w_conn:
                    await w_conn.execute(
                        text("""
                            UPDATE notification_deliveries 
                            SET status = :status, attempts = :attempts, last_error = :err
                            WHERE id = :id
                        """),
                        {"status": new_status, "attempts": new_attempts, "err": "User has no telegram_chat_id", "id": delivery_id},
                    )
                continue

            target_url = f"https://api.telegram.org/bot{token}/sendMessage"
            payload = {"chat_id": str(chat_id), "text": text_content}
            headers = None

        elif channel == "ZALO":
            token = getattr(settings, "ZALO_OA_ACCESS_TOKEN", "")
            if not token:
                # Thiếu token kênh -> để PENDING, không gọi mạng
                continue

            zalo_uid = d["zalo_user_id"]
            if not zalo_uid:
                new_attempts = attempts + 1
                new_status = "FAILED" if new_attempts >= 3 else "PENDING"
                async with engine.begin() as w_conn:
                    await w_conn.execute(
                        text("""
                            UPDATE notification_deliveries 
                            SET status = :status, attempts = :attempts, last_error = :err
                            WHERE id = :id
                        """),
                        {"status": new_status, "attempts": new_attempts, "err": "User has no zalo_user_id", "id": delivery_id},
                    )
                continue

            target_url = "https://openapi.zalo.me/v3.0/oa/message/cs"
            headers = {"access_token": token}
            payload = {
                "recipient": {"user_id": str(zalo_uid)},
                "message": {"text": text_content},
            }
        else:
            continue

        # Kiểm tra Outbound Allowlist
        if not is_host_allowed(target_url):
            new_attempts = attempts + 1
            new_status = "FAILED" if new_attempts >= 3 else "PENDING"
            err = sanitize_error_message(f"Host not in OUTBOUND_ALLOWED_HOSTS: {target_url}")
            async with engine.begin() as w_conn:
                await w_conn.execute(
                    text("""
                        UPDATE notification_deliveries 
                        SET status = :status, attempts = :attempts, last_error = :err
                        WHERE id = :id
                    """),
                    {"status": new_status, "attempts": new_attempts, "err": err, "id": delivery_id},
                )
            continue

        # Thực hiện gửi qua httpx
        try:
            resp = await client.post(target_url, json=payload, headers=headers, timeout=15.0)

            # Phân tích kết quả
            is_success = False
            error_detail = ""

            if resp.status_code == 200:
                try:
                    data = resp.json()
                    if channel == "TELEGRAM":
                        if data.get("ok", True) is not False:
                            is_success = True
                        else:
                            error_detail = data.get("description", "Telegram API returned ok=false")
                    elif channel == "ZALO":
                        if data.get("error", 0) == 0:
                            is_success = True
                        else:
                            error_detail = data.get("message", f"Zalo API error {data.get('error')}")
                except Exception:
                    is_success = True
            else:
                error_detail = f"HTTP {resp.status_code}: {resp.text}"

            if is_success:
                now_utc = datetime.now(timezone.utc)
                async with engine.begin() as w_conn:
                    await w_conn.execute(
                        text("""
                            UPDATE notification_deliveries 
                            SET status = 'SENT', sent_at = :sent_at, last_error = NULL
                            WHERE id = :id
                        """),
                        {"sent_at": now_utc, "id": delivery_id},
                    )
                sent_count += 1
            else:
                new_attempts = attempts + 1
                new_status = "FAILED" if new_attempts >= 3 else "PENDING"
                clean_err = sanitize_error_message(error_detail)
                async with engine.begin() as w_conn:
                    await w_conn.execute(
                        text("""
                            UPDATE notification_deliveries 
                            SET status = :status, attempts = :attempts, last_error = :err
                            WHERE id = :id
                        """),
                        {"status": new_status, "attempts": new_attempts, "err": clean_err, "id": delivery_id},
                    )

        except Exception as exc:
            new_attempts = attempts + 1
            new_status = "FAILED" if new_attempts >= 3 else "PENDING"
            clean_err = sanitize_error_message(f"Request exception: {str(exc)}")
            async with engine.begin() as w_conn:
                await w_conn.execute(
                    text("""
                        UPDATE notification_deliveries 
                        SET status = :status, attempts = :attempts, last_error = :err
                        WHERE id = :id
                    """),
                    {"status": new_status, "attempts": new_attempts, "err": clean_err, "id": delivery_id},
                )

    return sent_count


async def send_pending_deliveries(client: Optional[httpx.AsyncClient] = None) -> int:
    """Gửi các delivery PENDING kênh ngoài (Telegram, Zalo).

    Nhận client tùy chọn để test có thể inject MockTransport.
    """
    if client is not None:
        return await _process_deliveries(client)
    else:
        async with httpx.AsyncClient() as default_client:
            return await _process_deliveries(default_client)
