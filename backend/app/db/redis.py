import os
import asyncio
from typing import Dict, Optional, Tuple
import redis.asyncio as aioredis
from backend.app.core.config import settings

_clients: Dict[Tuple[Optional[asyncio.AbstractEventLoop], str], aioredis.Redis] = {}

def get_redis_url() -> str:
    return os.getenv("REDIS_URL", settings.REDIS_URL)

def get_redis() -> aioredis.Redis:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    url = get_redis_url()
    key = (loop, url)
    client = _clients.get(key)
    if client is None:
        client = aioredis.from_url(url, decode_responses=True)
        _clients[key] = client
    return client

async def close_redis() -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    keys_to_remove = [k for k in _clients if k[0] is loop]
    for k in keys_to_remove:
        client = _clients.pop(k, None)
        if client:
            await client.aclose()
