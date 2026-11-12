"""Celery worker + beat cho tác vụ nền (docs/05-architecture.md).

Chạy: `celery -A backend.app.worker worker -l info` và `celery -A backend.app.worker beat -l info`
(xem `docker-compose.yml`, service `celery_worker` / `celery_beat`).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict

import redis
from celery import Celery
from celery.schedules import crontab

from backend.app.db.redis import get_redis_url

logger = logging.getLogger(__name__)

DEADLINE_SCAN_TASK = "deadlines.scan_and_send"
DEADLINE_SCAN_LOCK = "lock:deadline_scan"
DEADLINE_SCAN_LOCK_TTL = 14 * 60  # ngắn hơn chu kỳ 15 phút: worker chết giữa chừng thì lượt sau vẫn chạy

app = Celery("asl_erp", broker=get_redis_url())
app.conf.update(
    timezone="Asia/Ho_Chi_Minh",
    enable_utc=True,
    task_ignore_result=True,
    task_acks_late=False,
    worker_prefetch_multiplier=1,
    beat_schedule={
        # 12 §4.2: ngưỡng tính theo giờ làm việc (08–12, 13–17, thứ Hai–Sáu). Quét mỗi 15 phút trong khung
        # 07:00–17:59 để không nhắn đêm/cuối tuần; quá hạn qua đêm được bắt ở lượt sáng hôm sau.
        "deadline-scan": {
            "task": DEADLINE_SCAN_TASK,
            "schedule": crontab(minute="*/15", hour="7-17", day_of_week="mon-fri"),
        },
    },
)


async def _run_deadline_scan() -> Dict[str, Any]:
    from backend.app.db.postgres import engine
    from backend.app.scripts.run_deadline_scan import run_scan

    try:
        return await run_scan()
    finally:
        # Mỗi lượt là một event loop mới (asyncio.run): bỏ kết nối pool gắn với loop cũ.
        await engine.dispose()


@app.task(name=DEADLINE_SCAN_TASK)
def deadline_scan_task() -> Dict[str, Any]:
    """Quét hạn chót + gửi tin chờ. Bỏ qua nếu lượt trước chưa xong (khoá Redis)."""
    r = redis.Redis.from_url(get_redis_url())
    lock = r.lock(DEADLINE_SCAN_LOCK, timeout=DEADLINE_SCAN_LOCK_TTL, blocking=False)
    if not lock.acquire(blocking=False):
        logger.info("Bỏ qua quét hạn: lượt trước còn đang chạy")
        return {"skipped": True}
    try:
        res = asyncio.run(_run_deadline_scan())
        logger.info("Quét hạn xong: %s", res)
        return res
    finally:
        try:
            lock.release()
        except redis.exceptions.LockError:
            pass  # khoá đã hết hạn
