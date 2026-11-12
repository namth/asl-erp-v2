"""Celery beat cho bộ quét hạn chót (12 §4.2) — không cần broker: gọi task trực tiếp."""
import os

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/14")

from datetime import datetime

import pytest
import redis

from backend.app import worker


def test_lich_beat_quet_han_moi_15_phut_gio_hanh_chinh():
    entry = worker.app.conf.beat_schedule["deadline-scan"]
    assert entry["task"] == worker.DEADLINE_SCAN_TASK
    assert worker.DEADLINE_SCAN_TASK in worker.app.tasks
    sched = entry["schedule"]
    assert worker.app.conf.timezone == "Asia/Ho_Chi_Minh"
    assert sched.minute == {0, 15, 30, 45}
    assert sched.hour == set(range(7, 18))
    assert sched.day_of_week == {1, 2, 3, 4, 5}
    assert worker.DEADLINE_SCAN_LOCK_TTL < 15 * 60


@pytest.fixture
def fake_scan(monkeypatch):
    calls = []

    async def fake():
        calls.append(datetime.now())
        return {"level1": 1, "level2": 0, "deliveries_created": 1, "sent_count": 1}

    monkeypatch.setattr(worker, "_run_deadline_scan", fake)
    r = redis.Redis.from_url(worker.get_redis_url())
    r.delete(worker.DEADLINE_SCAN_LOCK)
    yield calls, r
    r.delete(worker.DEADLINE_SCAN_LOCK)


def test_task_chay_quet_va_nha_khoa(fake_scan):
    calls, r = fake_scan
    res = worker.deadline_scan_task.apply().get()
    assert res["sent_count"] == 1 and len(calls) == 1
    assert not r.exists(worker.DEADLINE_SCAN_LOCK), "xong phải nhả khoá"
    worker.deadline_scan_task.apply().get()
    assert len(calls) == 2, "lượt sau vẫn chạy được"


def test_bo_qua_khi_luot_truoc_chua_xong(fake_scan):
    calls, r = fake_scan
    held = r.lock(worker.DEADLINE_SCAN_LOCK, timeout=60)
    assert held.acquire(blocking=False)
    try:
        res = worker.deadline_scan_task.apply().get()
    finally:
        held.release()
    assert res == {"skipped": True} and calls == []


def test_loi_quet_van_nha_khoa(monkeypatch, fake_scan):
    calls, r = fake_scan

    async def boom():
        raise RuntimeError("db down")

    monkeypatch.setattr(worker, "_run_deadline_scan", boom)
    result = worker.deadline_scan_task.apply()
    assert result.failed()
    assert not r.exists(worker.DEADLINE_SCAN_LOCK)
