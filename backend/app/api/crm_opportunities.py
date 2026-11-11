import asyncio
import hashlib
import json
import time
from typing import Dict, Any, Optional, Tuple

from fastapi import APIRouter, Request, Depends, Header
from fastapi.responses import JSONResponse
import jwt

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.core.security import get_current_user, verify_csrf
from backend.app.db.redis import get_redis
from backend.app.schemas.crm import (
    OpportunityPatchRequest,
    OpportunityConvertRequest,
    OpportunityResponse,
    CaseConvertResponse,
)
from backend.app.services.opportunities import update_opportunity
from backend.app.services.case_factory import convert_opportunity_to_case

router = APIRouter(prefix="/crm/opportunities", tags=["CRM - Opportunities"])

# Semaphore giới hạn tối đa 3 transaction đồng thời vào DB pool (tránh quá tải Supabase pool_size: 15)
_convert_semaphore = asyncio.Semaphore(3)

# Single-flight cache cho user authentication (ngăn chặn Cache Stampede làm cạn kiệt asyncpg pool)
_user_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_user_fetch_lock = asyncio.Lock()


async def get_current_user_cached(request: Request) -> Dict[str, Any]:
    cookie_token = request.cookies.get("access_token")
    auth_header = request.headers.get("Authorization", "")
    token = cookie_token or (auth_header[7:].strip() if auth_header.startswith("Bearer ") else None)

    if not token:
        return await get_current_user(request)

    user_id_str = None
    try:
        claims = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id_str = claims.get("sub")
        if user_id_str and user_id_str in _user_cache:
            ts, user = _user_cache[user_id_str]
            if time.time() - ts < 120:
                return user
    except Exception:
        pass

    # Double-checked locking pattern: chỉ cho phép đúng 1 coroutine truy vấn DB lấy user
    async with _user_fetch_lock:
        if user_id_str and user_id_str in _user_cache:
            ts, user = _user_cache[user_id_str]
            if time.time() - ts < 120:
                return user

        user = await get_current_user(request)
        if user and "id" in user:
            _user_cache[str(user["id"])] = (time.time(), user)
        return user


def require_opportunity_role(current_user: Dict[str, Any]) -> None:
    role = current_user.get("system_role")
    if role not in ("MANAGER", "ATTORNEY"):
        raise AppException(
            403,
            "FORBIDDEN_ROLE",
            f"Vai trò {role} không có quyền truy cập cơ hội kinh doanh"
        )


@router.patch("/{opportunity_id}")
async def patch_opportunity_endpoint(
    opportunity_id: str,
    payload: OpportunityPatchRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user_cached),
):
    """Cập nhật cơ hội và chuyển trạng thái theo máy trạng thái CRM §1.1."""
    verify_csrf(request)
    require_opportunity_role(current_user)

    updated = await asyncio.to_thread(update_opportunity, opportunity_id, payload, current_user)
    return {
        "success": True,
        "data": {
            "id": str(updated["id"]),
            "client_id": str(updated["client_id"]),
            "title": updated["title"],
            "lead_source": updated["lead_source"],
            "expected_value": str(updated["expected_value"]),
            "probability_pct": updated["probability_pct"],
            "stage": updated["stage"],
            "lost_reason": updated["lost_reason"],
            "originator_id": str(updated["originator_id"]),
            "converted_case_id": str(updated["converted_case_id"]) if updated["converted_case_id"] else None,
        }
    }


@router.post("/{opportunity_id}/convert")
async def convert_opportunity_endpoint(
    opportunity_id: str,
    payload: OpportunityConvertRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user_cached),
):
    """Chuyển đổi 1-chạm cơ hội WON thành vụ việc INITIALIZING đầy đủ."""
    verify_csrf(request)
    require_opportunity_role(current_user)

    idempotency_key = request.headers.get("Idempotency-Key")
    if not idempotency_key or not idempotency_key.strip():
        raise AppException(
            422,
            "VALIDATION_ERROR",
            "Thiếu header Idempotency-Key",
            details={"fields": [{"field": "Idempotency-Key", "message": "Header Idempotency-Key là bắt buộc"}]}
        )

    # Compute deterministic payload hash
    payload_dict = payload.model_dump(mode="json")
    payload_str = json.dumps(payload_dict, sort_keys=True, separators=(",", ":"))
    payload_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

    redis_client = get_redis()
    redis_key = f"idempotency:opportunity_convert:{current_user['id']}:{idempotency_key}"

    # Check cached response
    cached = await redis_client.get(redis_key)
    if cached:
        try:
            cached_entry = json.loads(cached)
            if cached_entry.get("payload_hash") != payload_hash:
                raise AppException(
                    409,
                    "IDEMPOTENCY_KEY_REUSED",
                    "Idempotency-Key đã được sử dụng với payload khác"
                )
            return JSONResponse(
                status_code=200,
                content={
                    "success": True,
                    "data": cached_entry["data"],
                    "message": "Đã tạo vụ việc. Cần phân công nhân sự để bắt đầu."
                }
            )
        except AppException:
            raise
        except Exception:
            pass

    # Execute conversion in dedicated thread pool with semaphore to protect DB pool
    async with _convert_semaphore:
        result = await asyncio.to_thread(
            convert_opportunity_to_case,
            opportunity_id,
            payload,
            current_user
        )

    # Cache successful response in Redis (24 hours)
    cache_entry = {
        "payload_hash": payload_hash,
        "data": result,
    }
    await redis_client.set(redis_key, json.dumps(cache_entry), ex=86400)

    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "data": result,
            "message": "Đã tạo vụ việc. Cần phân công nhân sự để bắt đầu."
        }
    )
