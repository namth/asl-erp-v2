"""Nghiệm thu TSK-21 (phần web) — trung tâm thông báo: danh sách, đánh dấu đã đọc, WebSocket, service tạo.

Hợp đồng: docs/07-api-contracts.md §3.10 · Schema: docs/06 bảng notifications
Kênh Telegram/Zalo, quét hạn & leo thang: task sau.
"""
import json
import time
import uuid

import jwt
import pytest
import redis as sync_redis
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.app.core.config import settings
from backend.app.db.redis import get_redis_url
from backend.app.main import app
from backend.tests.test_task_flow import create_test_user, db_conn, make_auth_client

import backend.app.services.notifications as svc

BASE = "/api/v1/notifications"


def insert_notif(user_id, *, kind="TASK_ASSIGNED", title="Bạn được giao task", body="Nộp đơn", link="/cases/x",
                 read=False, minutes_ago=0):
    nid = str(uuid.uuid4())
    with db_conn() as conn:
        conn.execute(
            """INSERT INTO notifications (id, user_id, kind, title, body, link, read_at, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, CASE WHEN %s THEN now() END, now() - make_interval(mins => %s))""",
            (nid, user_id, kind, title, body, link, read, minutes_ago),
        )
    return nid


def new_user(role="ATTORNEY"):
    with db_conn() as conn:
        return create_test_user(conn, role, full_name="Người nhận thông báo")


def token_for(user_id):
    now = int(time.time())
    with db_conn() as c:
        c.execute("UPDATE users SET tokens_valid_after = now() - interval '10 minutes' WHERE id = %s", (user_id,))
    return jwt.encode({"sub": user_id, "jti": str(uuid.uuid4()), "iat": now, "exp": now + 1800, "typ": "access"},
                      settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


# ------------------------------------------------------------------ GET danh sách
async def test_danh_sach_chi_cua_toi_moi_nhat_truoc_va_meta():
    me, other = new_user(), new_user()
    n_old = insert_notif(me["id"], title="Cũ", minutes_ago=30, read=True)
    n_mid = insert_notif(me["id"], title="Giữa", minutes_ago=20)
    n_new = insert_notif(me["id"], title="Mới", minutes_ago=10, link="/approvals?id=1")
    insert_notif(other["id"], title="Của người khác")
    async with make_auth_client(me["id"]) as c:
        r = await c.get(BASE)
    assert r.status_code == 200, r.text
    j = r.json()
    assert [i["id"] for i in j["data"]] == [n_new, n_mid, n_old]
    item = j["data"][0]
    assert set(item) == {"id", "kind", "title", "body", "link", "created_at", "read_at"}
    assert item["title"] == "Mới" and item["link"] == "/approvals?id=1" and item["read_at"] is None
    assert j["data"][2]["read_at"] is not None
    assert j["meta"] == {"page": 1, "page_size": 20, "total": 3, "unread_count": 2}


async def test_loc_chua_doc_va_phan_trang():
    me = new_user()
    ids = [insert_notif(me["id"], title=f"T{i}", minutes_ago=100 - i) for i in range(5)]
    insert_notif(me["id"], title="Đã đọc", read=True, minutes_ago=1)
    async with make_auth_client(me["id"]) as c:
        r = await c.get(BASE, params={"unread_only": "true", "page": 1, "page_size": 2})
        j = r.json()
        assert [i["id"] for i in j["data"]] == [ids[4], ids[3]]
        assert j["meta"] == {"page": 1, "page_size": 2, "total": 5, "unread_count": 5}
        r = await c.get(BASE, params={"unread_only": "true", "page": 3, "page_size": 2})
        assert [i["id"] for i in r.json()["data"]] == [ids[0]]
        for bad in ({"page": 0}, {"page_size": 0}, {"page_size": 101}, {"unread_only": "co"}):
            r = await c.get(BASE, params=bad)
            assert r.status_code == 422, bad
            assert r.json()["error"]["code"] == "VALIDATION_ERROR"


async def test_chua_dang_nhap_401():
    import httpx
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://testserver") as anon:
        r = await anon.get(BASE)
    assert r.status_code == 401


# ------------------------------------------------------------------ đánh dấu đã đọc
async def test_danh_dau_da_doc_idempotent_va_khong_dung_cua_nguoi_khac():
    me, other = new_user(), new_user()
    mine = insert_notif(me["id"])
    theirs = insert_notif(other["id"])
    async with make_auth_client(me["id"]) as c:
        r1 = await c.post(f"{BASE}/{mine}/read")
        assert r1.status_code == 200, r1.text
        d1 = r1.json()["data"]
        assert d1["id"] == mine and d1["read_at"]
        r2 = await c.post(f"{BASE}/{mine}/read")
        assert r2.status_code == 200 and r2.json()["data"]["read_at"] == d1["read_at"]  # không ghi đè thời điểm
        r3 = await c.post(f"{BASE}/{theirs}/read")
        assert r3.status_code == 404 and r3.json()["error"]["code"] == "NOT_FOUND"
        r4 = await c.post(f"{BASE}/{uuid.uuid4()}/read")
        assert r4.status_code == 404
        r5 = await c.post(f"{BASE}/khong-phai-uuid/read")
        assert r5.status_code in (404, 422)
    with db_conn() as conn:
        assert conn.execute("SELECT read_at FROM notifications WHERE id = %s", (theirs,)).fetchone()[0] is None


async def test_read_all_chi_cua_toi():
    me, other = new_user(), new_user()
    for _ in range(3):
        insert_notif(me["id"])
    insert_notif(me["id"], read=True)
    theirs = insert_notif(other["id"])
    async with make_auth_client(me["id"]) as c:
        r = await c.post(f"{BASE}/read-all")
        assert r.status_code == 200, r.text
        assert r.json()["data"] == {"updated_count": 3}
        r = await c.post(f"{BASE}/read-all")
        assert r.json()["data"] == {"updated_count": 0}
        r = await c.get(BASE)
        assert r.json()["meta"]["unread_count"] == 0
    with db_conn() as conn:
        assert conn.execute("SELECT read_at FROM notifications WHERE id = %s", (theirs,)).fetchone()[0] is None


async def test_route_ghi_can_csrf():
    me = new_user()
    nid = insert_notif(me["id"])
    async with make_auth_client(me["id"]) as c:
        c.headers.pop("X-CSRF-Token")
        c.headers.pop("Authorization")
        r = await c.post(f"{BASE}/{nid}/read")
    assert r.status_code == 403 and r.json()["error"]["code"] == "CSRF_INVALID"


# ------------------------------------------------------------------ service tạo & phát
async def test_create_notification_ghi_db_va_phat_redis():
    me = new_user()
    r = sync_redis.Redis.from_url(get_redis_url(), decode_responses=True)
    ps = r.pubsub()
    ps.subscribe(f"notifications:{me['id']}")
    ps.get_message(timeout=2)  # xác nhận subscribe
    item = await svc.create_notification(me["id"], kind="PAYMENT_CONFIRMED", title="Đợt thu đã đủ",
                                         body="Giai đoạn 2 đã mở khoá", link="/cases/abc")
    assert set(item) == {"id", "kind", "title", "body", "link", "created_at", "read_at"}
    assert item["read_at"] is None and item["link"] == "/cases/abc"
    with db_conn() as conn:
        row = conn.execute("SELECT user_id::text, kind, title, link FROM notifications WHERE id = %s", (item["id"],)).fetchone()
    assert row == (me["id"], "PAYMENT_CONFIRMED", "Đợt thu đã đủ", "/cases/abc")
    msg = None
    for _ in range(20):
        msg = ps.get_message(timeout=0.5)
        if msg and msg["type"] == "message":
            break
    assert msg and msg["type"] == "message"
    assert json.loads(msg["data"]) == {"type": "NOTIFICATION_CREATED", "payload": item}
    ps.close()


@pytest.mark.parametrize("bad_link", ["https://evil.example/x", "//evil.example", "cases/x", "javascript:alert(1)", ""])
async def test_create_notification_tu_choi_link_ngoai(bad_link):
    me = new_user()
    with pytest.raises(ValueError):
        await svc.create_notification(me["id"], kind="X", title="t", body="b", link=bad_link)


# ------------------------------------------------------------------ WebSocket
def test_ws_khong_co_phien_bi_dong_4401():
    with TestClient(app) as tc:
        with pytest.raises(WebSocketDisconnect) as e:
            with tc.websocket_connect("/ws/notifications") as ws:
                ws.receive_json()
    assert e.value.code == 4401


def test_ws_nhan_thong_bao_cua_minh():
    me, other = new_user(), new_user()
    tok = token_for(me["id"])
    r = sync_redis.Redis.from_url(get_redis_url(), decode_responses=True)
    with TestClient(app) as tc:
        tc.cookies.set("access_token", tok)
        with tc.websocket_connect("/ws/notifications") as ws:
            assert ws.receive_json() == {"type": "READY"}
            other_msg = {"type": "NOTIFICATION_CREATED", "payload": {"id": "khac", "title": "không phải của tôi"}}
            r.publish(f"notifications:{other['id']}", json.dumps(other_msg))
            msg = {"type": "NOTIFICATION_CREATED", "payload": {"id": str(uuid.uuid4()), "kind": "TASK_ASSIGNED",
                                                               "title": "Giao task", "body": "b", "link": "/x",
                                                               "created_at": "2026-11-12T00:00:00Z", "read_at": None}}
            r.publish(f"notifications:{me['id']}", json.dumps(msg))
            assert ws.receive_json() == msg


def test_ws_token_sai_bi_dong_4401():
    with TestClient(app) as tc:
        tc.cookies.set("access_token", "khong-hop-le")
        with pytest.raises(WebSocketDisconnect) as e:
            with tc.websocket_connect("/ws/notifications") as ws:
                ws.receive_json()
    assert e.value.code == 4401
