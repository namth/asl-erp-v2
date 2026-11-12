from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query, WebSocket
from starlette.websockets import WebSocketDisconnect

from backend.app.core.security import get_current_user
from backend.app.db.redis import get_redis
from backend.app.services.floorplan import get_floorplan_data_sync, resolve_floorplan_dept_id

router = APIRouter(prefix="/operations/floorplan", tags=["Floorplan"])
ws_router = APIRouter(tags=["Floorplan WebSocket"])


@router.get("", response_model=None)
@router.get("/", response_model=None)
async def get_floorplan(
    department_id: Optional[str] = Query(default=None),
    current_user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    """Lấy dữ liệu bố cục phòng ban và hàng đợi duyệt cho Văn phòng số."""
    return await asyncio.to_thread(get_floorplan_data_sync, current_user, department_id)


@ws_router.websocket("/ws/operations/floorplan")
async def websocket_floorplan(websocket: WebSocket) -> None:
    """Kênh WebSocket nhận sự kiện cập nhật thời gian thực cho Văn phòng số theo phòng ban."""
    # 1. Xác thực bằng cookie access_token trước khi accept
    try:
        current_user = await get_current_user(websocket)
    except Exception:
        await websocket.close(code=4401)
        return

    # 2. Kiểm tra vai trò MANAGER
    if current_user.get("system_role") != "MANAGER":
        await websocket.close(code=4403)
        return

    # 3. Kiểm tra và phân giải department_id
    dept_param = websocket.query_params.get("department_id")
    try:
        resolved_dept_id = await asyncio.to_thread(resolve_floorplan_dept_id, current_user, dept_param)
    except Exception:
        await websocket.close(code=4403)
        return

    # 4. Chấp nhận kết nối
    await websocket.accept()

    # 5. Đăng ký kênh Redis Pub/Sub của phòng ban
    r = get_redis()
    pubsub = r.pubsub()
    channel = f"floorplan:{resolved_dept_id}"

    try:
        await pubsub.subscribe(channel)
        await websocket.send_json({"type": "READY"})

        async def forward_messages() -> None:
            try:
                async for msg in pubsub.listen():
                    if msg and msg.get("type") == "message":
                        data = msg.get("data")
                        if isinstance(data, str):
                            try:
                                json_obj = json.loads(data)
                                await websocket.send_json(json_obj)
                            except Exception:
                                await websocket.send_text(data)
                        elif isinstance(data, (dict, list)):
                            await websocket.send_json(data)
                        elif isinstance(data, bytes):
                            try:
                                json_obj = json.loads(data.decode("utf-8"))
                                await websocket.send_json(json_obj)
                            except Exception:
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
