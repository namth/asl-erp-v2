from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from sqlalchemy import text

from backend.app.db.postgres import engine
from backend.app.db.redis import get_redis


def format_iso_utc(dt_val: Optional[datetime]) -> Optional[str]:
    """Chuyển datetime sang định dạng chuẩn ISO 8601 UTC kết thúc bằng Z."""
    if dt_val is None:
        return None
    if dt_val.tzinfo is None:
        dt_val = dt_val.replace(tzinfo=timezone.utc)
    else:
        dt_val = dt_val.astimezone(timezone.utc)
    s = dt_val.isoformat()
    if s.endswith("+00:00"):
        s = s[:-6] + "Z"
    elif not s.endswith("Z"):
        s += "Z"
    return s


def validate_relative_link(link: str) -> None:
    """Link phải là đường dẫn tương đối trong app — bắt đầu bằng đúng một /, không //, không chứa ://, không rỗng."""
    if not link or not isinstance(link, str):
        raise ValueError("Link thông báo không được để trống")
    if not link.startswith("/") or link.startswith("//"):
        raise ValueError("Link thông báo phải bắt đầu bằng đúng một dấu '/'")
    if "://" in link:
        raise ValueError("Link thông báo không được chứa protocol ('://')")


async def publish_notification(user_id: str, item: dict) -> None:
    """Phát thông báo qua Redis Pub/Sub trên kênh notifications:{user_id}."""
    r = get_redis()
    message = json.dumps({"type": "NOTIFICATION_CREATED", "payload": item}, ensure_ascii=False)
    await r.publish(f"notifications:{user_id}", message)


async def create_notification(
    user_id: str,
    *,
    kind: str,
    title: str,
    body: str,
    link: str,
) -> dict:
    """Tạo bản ghi thông báo trong DB và phát tin qua Redis."""
    validate_relative_link(link)

    uid = uuid.UUID(str(user_id))
    nid = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc)

    async with engine.begin() as conn:
        await conn.execute(
            text("""
                INSERT INTO notifications (id, user_id, kind, title, body, link, read_at, created_at)
                VALUES (:id, :user_id, :kind, :title, :body, :link, NULL, :created_at)
            """),
            {
                "id": uuid.UUID(nid),
                "user_id": uid,
                "kind": kind,
                "title": title,
                "body": body,
                "link": link,
                "created_at": now_utc,
            },
        )

    item: Dict[str, Any] = {
        "id": nid,
        "kind": kind,
        "title": title,
        "body": body,
        "link": link,
        "created_at": format_iso_utc(now_utc),
        "read_at": None,
    }

    await publish_notification(str(user_id), item)
    return item
