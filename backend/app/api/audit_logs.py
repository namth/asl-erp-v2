"""API Nhật ký kiểm toán & kiểm toàn vẹn chuỗi băm (SCR-13, TSK-12).

Chỉ dành cho Quản trị viên (ADMIN). Chỉ đọc — không có route sửa/xoá.
"""
from __future__ import annotations

import asyncio
import json
import math
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, Query
from psycopg.rows import dict_row

from backend.app.core.errors import AppException
from backend.app.core.security import get_current_user
from backend.app.db.redis import get_redis
import backend.app.services.audit_logs as svc

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])

LAST_KEY = "audit:integrity:last"
LOCK_KEY = "audit:integrity:recheck_lock"


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Yêu cầu người dùng đăng nhập và có vai trò hệ thống ADMIN."""
    if user.get("system_role") != "ADMIN":
        raise AppException(403, "FORBIDDEN_ROLE", "Chức năng chỉ dành cho Quản trị viên (ADMIN)")
    return user


@router.get("")
async def list_audit_logs(
    actor_id: Optional[uuid.UUID] = Query(None, description="Lọc theo ID người thực hiện"),
    actor_type: Optional[Literal["USER", "SYSTEM"]] = Query(None, description="Lọc theo kiểu tác nhân"),
    action: Optional[str] = Query(None, description="Lọc theo hành động"),
    entity_name: Optional[str] = Query(None, description="Lọc theo tên thực thể"),
    entity_id: Optional[str] = Query(None, description="Lọc theo ID thực thể"),
    from_: Optional[datetime] = Query(None, alias="from", description="Lọc từ thời điểm (created_at >=)"),
    to: Optional[datetime] = Query(None, description="Lọc tới thời điểm (created_at <=)"),
    page: int = Query(1, ge=1, description="Số trang (bắt đầu từ 1)"),
    limit: int = Query(50, ge=1, le=200, description="Số bản ghi mỗi trang (1-200)"),
    user: dict = Depends(require_admin),
) -> Dict[str, Any]:
    """Lấy danh sách nhật ký kiểm toán có phân trang và bộ lọc. Sắp xếp id DESC."""
    conditions: List[str] = []
    params: List[Any] = []

    if actor_id is not None:
        conditions.append("a.actor_id = %s")
        params.append(str(actor_id))

    if actor_type is not None:
        conditions.append("a.actor_type = %s")
        params.append(actor_type)

    if action is not None:
        conditions.append("a.action = %s")
        params.append(action)

    if entity_name is not None:
        conditions.append("a.entity_name = %s")
        params.append(entity_name)

    if entity_id is not None:
        conditions.append("a.entity_id = %s")
        params.append(entity_id)

    if from_ is not None:
        conditions.append("a.created_at >= %s")
        params.append(from_)

    if to is not None:
        conditions.append("a.created_at <= %s")
        params.append(to)

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    def _query_db():
        with svc.get_db_conn() as conn:
            # 1. Đếm tổng số bản ghi với cùng điều kiện WHERE
            with conn.cursor() as cur:
                count_query = f"SELECT count(*) FROM audit_logs a {where_clause};"
                cur.execute(count_query, params)
                total_records = cur.fetchone()[0]

            total_pages = math.ceil(total_records / limit) if total_records > 0 else 0
            offset = (page - 1) * limit

            # 2. Lấy trang dữ liệu
            with conn.cursor(row_factory=dict_row) as cur:
                data_query = f"""
                    SELECT
                        a.id,
                        a.created_at,
                        a.actor_type,
                        a.actor_id,
                        u.id AS user_id,
                        u.full_name AS user_full_name,
                        u.email AS user_email,
                        a.action,
                        a.entity_name,
                        a.entity_id,
                        a.before_state,
                        a.after_state,
                        a.ip_address,
                        a.user_agent,
                        a.row_hash
                    FROM audit_logs a
                    LEFT JOIN users u ON a.actor_id = u.id
                    {where_clause}
                    ORDER BY a.id DESC
                    LIMIT %s OFFSET %s;
                """
                cur.execute(data_query, params + [limit, offset])
                rows = cur.fetchall()

            return total_records, total_pages, rows

    total_records, total_pages, rows = await asyncio.to_thread(_query_db)

    data = []
    for r in rows:
        actor = None
        if r["actor_id"] is not None and r["user_id"] is not None:
            actor = {
                "id": str(r["user_id"]),
                "full_name": r["user_full_name"],
                "email": r["user_email"]
            }

        dt = r["created_at"]
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        created_at_str = dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")

        b_state = r["before_state"]
        if isinstance(b_state, str):
            try:
                b_state = json.loads(b_state)
            except Exception:
                pass

        a_state = r["after_state"]
        if isinstance(a_state, str):
            try:
                a_state = json.loads(a_state)
            except Exception:
                pass

        item = {
            "id": r["id"],
            "created_at": created_at_str,
            "actor_type": r["actor_type"],
            "actor": actor,
            "action": r["action"],
            "entity_name": r["entity_name"],
            "entity_id": r["entity_id"],
            "before_state": b_state,
            "after_state": a_state,
            "ip_address": str(r["ip_address"]) if r["ip_address"] is not None else None,
            "user_agent": r["user_agent"],
            "row_hash": r["row_hash"]
        }
        data.append(item)

    return {
        "success": True,
        "data": data,
        "meta": {
            "page": page,
            "limit": limit,
            "total_records": total_records,
            "total_pages": total_pages
        }
    }


@router.get("/integrity")
async def get_integrity_status(
    recheck: bool = Query(False, description="Yêu cầu quét kiểm tra lại toàn bộ chuỗi băm"),
    user: dict = Depends(require_admin),
) -> Dict[str, Any]:
    """Lấy trạng thái toàn vẹn chuỗi băm hoặc yêu cầu quét lại (giới hạn 1 lần / 5 phút)."""
    redis_client = get_redis()

    if not recheck:
        cached = await redis_client.get(LAST_KEY)
        if cached:
            try:
                data = json.loads(cached)
                return {"success": True, "data": data}
            except Exception:
                pass
        return {
            "success": True,
            "data": {
                "status": "NEVER_CHECKED",
                "checked_rows": 0,
                "verified_at": None,
                "first_broken_id": None
            }
        }

    # recheck=True: Cần khoá phân tán trên Redis (NX EX 300)
    lock_acquired = await redis_client.set(LOCK_KEY, "1", nx=True, ex=300)
    if not lock_acquired:
        raise AppException(
            429,
            "RATE_LIMITED",
            "Kiểm tra toàn vẹn chuỗi băm chỉ được thực hiện tối đa 1 lần trong 5 phút"
        )

    # Chạy scan_chain qua module svc để test có thể monkeypatch svc.scan_chain
    def _execute_scan():
        with svc.get_db_conn() as conn:
            return svc.scan_chain(conn)

    checked_rows, first_broken_id = await asyncio.to_thread(_execute_scan)
    status = "BROKEN" if first_broken_id is not None else "OK"
    verified_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    payload = {
        "status": status,
        "checked_rows": checked_rows,
        "verified_at": verified_at,
        "first_broken_id": first_broken_id
    }

    # Lưu kết quả vào Redis không TTL
    await redis_client.set(LAST_KEY, json.dumps(payload))

    return {
        "success": True,
        "data": payload
    }
