from __future__ import annotations

import asyncio
import uuid
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, WebSocket
from starlette.websockets import WebSocketDisconnect
from sqlalchemy import text

from backend.app.core.errors import AppException
from backend.app.core.security import get_current_user, verify_csrf
from backend.app.db.postgres import engine
from backend.app.db.redis import get_redis
from backend.app.services.notifications import format_iso_utc

router = APIRouter(prefix="/notifications", tags=["Notifications"])
ws_router = APIRouter(tags=["Notifications WebSocket"])


@router.get("", response_model=None)
@router.get("/", response_model=None)
async def list_notifications(
    unread_only: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Lấy danh sách thông báo của chính người dùng, sắp xếp mới nhất trước kèm phân trang."""
    uid = uuid.UUID(current_user["id"])

    async with engine.connect() as conn:
        # Tổng số thông báo chưa đọc của người dùng
        unread_res = await conn.execute(
            text("SELECT COUNT(*) FROM notifications WHERE user_id = :uid AND read_at IS NULL"),
            {"uid": uid},
        )
        unread_count = unread_res.scalar() or 0

        # Tổng số thông báo theo bộ lọc
        if unread_only:
            total = unread_count
        else:
            total_res = await conn.execute(
                text("SELECT COUNT(*) FROM notifications WHERE user_id = :uid"),
                {"uid": uid},
            )
            total = total_res.scalar() or 0

        offset = (page - 1) * page_size
        where_sql = "WHERE user_id = :uid AND read_at IS NULL" if unread_only else "WHERE user_id = :uid"

        rows_res = await conn.execute(
            text(f"""
                SELECT id, kind, title, body, link, created_at, read_at
                FROM notifications
                {where_sql}
                ORDER BY created_at DESC, id DESC
                LIMIT :limit OFFSET :offset
            """),
            {"uid": uid, "limit": page_size, "offset": offset},
        )
        rows = rows_res.fetchall()

    items: List[Dict[str, Any]] = [
        {
            "id": str(r.id),
            "kind": r.kind,
            "title": r.title,
            "body": r.body,
            "link": r.link,
            "created_at": format_iso_utc(r.created_at),
            "read_at": format_iso_utc(r.read_at),
        }
        for r in rows
    ]

    return {
        "success": True,
        "data": items,
        "meta": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "unread_count": unread_count,
        },
    }


@router.post("/read-all", dependencies=[Depends(verify_csrf)])
async def mark_all_read(
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Đánh dấu đã đọc cho tất cả thông báo chưa đọc của người gọi."""
    uid = uuid.UUID(current_user["id"])

    async with engine.begin() as conn:
        res = await conn.execute(
            text("""
                UPDATE notifications
                SET read_at = now()
                WHERE user_id = :uid AND read_at IS NULL
            """),
            {"uid": uid},
        )
        updated_count = res.rowcount

    return {
        "success": True,
        "data": {
            "updated_count": updated_count,
        },
    }


@router.post("/{id}/read", dependencies=[Depends(verify_csrf)])
async def mark_single_read(
    id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Đánh dấu một thông báo là đã đọc (idempotent)."""
    try:
        nid = uuid.UUID(id)
    except (ValueError, TypeError):
        raise AppException(404, "NOT_FOUND", "Thông báo không tồn tại")

    uid = uuid.UUID(current_user["id"])

    async with engine.begin() as conn:
        res = await conn.execute(
            text("SELECT id, user_id, read_at FROM notifications WHERE id = :id"),
            {"id": nid},
        )
        row = res.fetchone()
        if not row or row.user_id != uid:
            raise AppException(404, "NOT_FOUND", "Thông báo không tồn tại")

        read_at = row.read_at
        if read_at is None:
            update_res = await conn.execute(
                text("UPDATE notifications SET read_at = now() WHERE id = :id RETURNING read_at"),
                {"id": nid},
            )
            read_at = update_res.scalar()

    return {
        "success": True,
        "data": {
            "id": str(nid),
            "read_at": format_iso_utc(read_at),
        },
    }


@ws_router.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket) -> None:
    """Kênh WebSocket nhận thông báo theo thời gian thực cho người dùng đã đăng nhập."""
    # 1. Xác thực bằng cookie access_token trước khi accept
    try:
        current_user = await get_current_user(websocket)
    except Exception:
        await websocket.close(code=4401)
        return

    user_id = str(current_user["id"])

    # 2. Hợp lệ -> chấp nhận kết nối
    await websocket.accept()

    # 3. Đăng ký kênh Redis Pub/Sub của người dùng
    r = get_redis()
    pubsub = r.pubsub()
    channel = f"notifications:{user_id}"

    try:
        await pubsub.subscribe(channel)
        # Gửi READY sau khi đã đăng ký kênh thành công
        await websocket.send_json({"type": "READY"})

        async def forward_messages() -> None:
            try:
                async for msg in pubsub.listen():
                    if msg and msg.get("type") == "message":
                        data = msg.get("data")
                        if isinstance(data, str):
                            await websocket.send_text(data)
                        elif isinstance(data, (dict, list)):
                            await websocket.send_json(data)
                        elif isinstance(data, bytes):
                            await websocket.send_text(data.decode("utf-8"))
            except (WebSocketDisconnect, asyncio.CancelledError):
                pass
            except Exception:
                pass

        async def client_reader() -> None:
            try:
                while True:
                    msg = await websocket.receive()
                    if msg.get("type") == "websocket.disconnect":
                        break
            except (WebSocketDisconnect, asyncio.CancelledError):
                pass
            except Exception:
                pass

        async def periodic_token_check() -> None:
            try:
                while True:
                    await asyncio.sleep(60)
                    try:
                        await get_current_user(websocket)
                    except Exception:
                        await websocket.close(code=4401)
                        break
            except (WebSocketDisconnect, asyncio.CancelledError):
                pass
            except Exception:
                pass

        reader_task = asyncio.create_task(client_reader())
        forwarder_task = asyncio.create_task(forward_messages())
        checker_task = asyncio.create_task(periodic_token_check())

        done, pending = await asyncio.wait(
            [reader_task, forwarder_task, checker_task],
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in pending:
            task.cancel()
        await asyncio.gather(*pending, return_exceptions=True)

    finally:
        try:
            await pubsub.unsubscribe(channel)
        except Exception:
            pass
        try:
            if hasattr(pubsub, "aclose"):
                await pubsub.aclose()
            else:
                await pubsub.close()
        except Exception:
            pass
