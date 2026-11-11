"""Nghiệm thu TSK-12 (phần API) — Nhật ký kiểm toán cho Quản trị viên (SCR-13).

Hợp đồng: docs/07-api-contracts.md §3.2a (GET /audit-logs, GET /audit-logs/integrity), §1.2 phân trang, §1.3 mã lỗi.
Bất biến: audit_logs chỉ INSERT/SELECT — API chỉ đọc, không có endpoint sửa/xoá.
Kết quả kiểm chuỗi lưu ở Redis: khoá `audit:integrity:last` (JSON), khoá chặn kiểm lại `audit:integrity:recheck_lock` (TTL 300 s).
"""
import json
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import jwt
import psycopg
import pytest
import redis

from backend.app.core.config import settings
from backend.app.main import app
from backend.app.services.audit import log_audit_event

LAST_KEY = "audit:integrity:last"
LOCK_KEY = "audit:integrity:recheck_lock"


def db_conn():
    return psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True)


def redis_sync():
    return redis.Redis.from_url(os.getenv("REDIS_URL", settings.REDIS_URL), decode_responses=True)


def create_test_user(conn, role: str = "ADMIN", *, full_name: str = "Quản trị Kiểm toán") -> dict:
    user_id = str(uuid.uuid4())
    email = f"tsk12-{uuid.uuid4().hex[:8]}@asllaw.vn"
    conn.execute(
        """INSERT INTO users (id, email, password_hash, full_name, title, system_role,
                              is_executive, totp_enabled, must_reset_password, is_active)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (user_id, email, "testhash", full_name, "Nhân sự", role, False, False, False, True),
    )
    return {"id": user_id, "email": email, "role": role, "full_name": full_name}


def make_auth_client(user_id: str) -> httpx.AsyncClient:
    now = int(time.time())
    # đồng hồ DB có thể nhanh hơn máy chạy test → lùi tokens_valid_after thay vì lùi iat
    with db_conn() as _c:
        _c.execute("UPDATE users SET tokens_valid_after = now() - interval '10 minutes' WHERE id = %s", (str(user_id),))
    token = jwt.encode(
        {"sub": str(user_id), "jti": str(uuid.uuid4()), "iat": now, "exp": now + 1800, "typ": "access"},
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    csrf_token = uuid.uuid4().hex
    c = httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://testserver",
        headers={"X-CSRF-Token": csrf_token, "Authorization": f"Bearer {token}"},
    )
    c.cookies.set("access_token", token)
    c.cookies.set("csrf_token", csrf_token)
    return c


def anon_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://testserver")


def error_code(resp: httpx.Response) -> str:
    body = resp.json()
    assert body.get("success") is False, body
    return body["error"]["code"]


@pytest.fixture
def seeded():
    """3 bản ghi audit có action riêng cho lần chạy này: 2 USER (cùng entity) + 1 SYSTEM."""
    tag = uuid.uuid4().hex[:8].upper()
    action = f"TEST_API_{tag}"
    with db_conn() as conn:
        admin = create_test_user(conn, "ADMIN")
        actor = create_test_user(conn, "MANAGER", full_name="Trưởng phòng Kiểm toán")
        entity_id = str(uuid.uuid4())
        id1, _ = log_audit_event(conn, actor_type="USER", action=action, entity_name="users",
                                 entity_id=entity_id, actor_id=actor["id"],
                                 before_state={"is_active": True}, after_state={"is_active": False},
                                 ip_address="10.0.0.12", user_agent="pytest")
        id2, _ = log_audit_event(conn, actor_type="USER", action=action, entity_name="users",
                                 entity_id=entity_id, actor_id=actor["id"],
                                 before_state={"is_active": False}, after_state={"is_active": True},
                                 ip_address="10.0.0.12", user_agent="pytest")
        id3, _ = log_audit_event(conn, actor_type="SYSTEM", action=action, entity_name="cases",
                                 entity_id=str(uuid.uuid4()), after_state={"job": "nightly"}, ip_address=None)
    return {"admin": admin, "actor": actor, "action": action, "entity_id": entity_id, "ids": [id1, id2, id3]}


# ---------- Phân quyền ----------

@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["MANAGER", "ACCOUNTANT", "ATTORNEY"])
async def test_non_admin_forbidden(role):
    with db_conn() as conn:
        u = create_test_user(conn, role)
    async with make_auth_client(u["id"]) as c:
        r1 = await c.get("/api/v1/audit-logs")
        r2 = await c.get("/api/v1/audit-logs/integrity")
    assert r1.status_code == 403 and error_code(r1) == "FORBIDDEN_ROLE", r1.text
    assert r2.status_code == 403 and error_code(r2) == "FORBIDDEN_ROLE", r2.text


@pytest.mark.asyncio
async def test_unauthenticated_401():
    async with anon_client() as c:
        r1 = await c.get("/api/v1/audit-logs")
        r2 = await c.get("/api/v1/audit-logs/integrity")
    assert r1.status_code == 401
    assert r2.status_code == 401


@pytest.mark.asyncio
async def test_no_write_endpoints(seeded):
    """Chỉ đọc: không có POST/PUT/PATCH/DELETE trên /audit-logs."""
    async with make_auth_client(seeded["admin"]["id"]) as c:
        for method, path in [("POST", "/api/v1/audit-logs"), ("PUT", f"/api/v1/audit-logs/{seeded['ids'][0]}"),
                             ("PATCH", f"/api/v1/audit-logs/{seeded['ids'][0]}"),
                             ("DELETE", f"/api/v1/audit-logs/{seeded['ids'][0]}")]:
            r = await c.request(method, path, json={})
            assert r.status_code in (404, 405), f"{method} {path} → {r.status_code}"
    with db_conn() as conn:
        n = conn.execute("SELECT count(*) FROM audit_logs WHERE id = ANY(%s)", (seeded["ids"],)).fetchone()[0]
    assert n == 3


# ---------- Danh sách & lọc ----------

@pytest.mark.asyncio
async def test_list_filter_by_action_newest_first_and_shape(seeded):
    async with make_auth_client(seeded["admin"]["id"]) as c:
        r = await c.get("/api/v1/audit-logs", params={"action": seeded["action"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    rows = body["data"]
    assert [row["id"] for row in rows] == sorted(seeded["ids"], reverse=True), "Mới nhất trước"
    assert body["meta"]["total_records"] == 3
    assert body["meta"]["page"] == 1 and body["meta"]["limit"] == 50 and body["meta"]["total_pages"] == 1

    user_row = next(row for row in rows if row["id"] == seeded["ids"][0])
    for key in ("id", "created_at", "actor_type", "actor", "action", "entity_name", "entity_id",
                "before_state", "after_state", "ip_address", "user_agent", "row_hash"):
        assert key in user_row, key
    assert user_row["actor_type"] == "USER"
    assert user_row["actor"] == {"id": seeded["actor"]["id"], "full_name": seeded["actor"]["full_name"],
                                 "email": user_row["actor"]["email"]}
    assert user_row["actor"]["email"].endswith("@asllaw.vn")
    assert user_row["before_state"] == {"is_active": True}
    assert user_row["after_state"] == {"is_active": False}
    assert user_row["ip_address"] == "10.0.0.12"
    assert len(user_row["row_hash"]) == 64
    datetime.fromisoformat(user_row["created_at"].replace("Z", "+00:00"))

    system_row = next(row for row in rows if row["id"] == seeded["ids"][2])
    assert system_row["actor_type"] == "SYSTEM"
    assert system_row["actor"] is None
    # không lộ cột nội bộ không có trong hợp đồng
    assert "password_hash" not in r.text


@pytest.mark.asyncio
async def test_list_filters_combine(seeded):
    a = seeded["action"]
    async with make_auth_client(seeded["admin"]["id"]) as c:
        r_ent = await c.get("/api/v1/audit-logs", params={"action": a, "entity_name": "users",
                                                          "entity_id": seeded["entity_id"]})
        r_actor = await c.get("/api/v1/audit-logs", params={"action": a, "actor_id": seeded["actor"]["id"]})
        r_sys = await c.get("/api/v1/audit-logs", params={"action": a, "actor_type": "SYSTEM"})
        future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        r_from_future = await c.get("/api/v1/audit-logs", params={"action": a, "from": future})
        r_range = await c.get("/api/v1/audit-logs", params={"action": a, "from": past, "to": future})
        r_to_past = await c.get("/api/v1/audit-logs", params={"action": a, "to": past})
    assert {x["id"] for x in r_ent.json()["data"]} == set(seeded["ids"][:2])
    assert {x["id"] for x in r_actor.json()["data"]} == set(seeded["ids"][:2])
    assert [x["id"] for x in r_sys.json()["data"]] == [seeded["ids"][2]]
    assert r_from_future.json()["data"] == []
    assert r_from_future.json()["meta"]["total_records"] == 0
    assert len(r_range.json()["data"]) == 3
    assert r_to_past.json()["data"] == []


@pytest.mark.asyncio
async def test_pagination_and_limit_bounds(seeded):
    a = seeded["action"]
    async with make_auth_client(seeded["admin"]["id"]) as c:
        p1 = await c.get("/api/v1/audit-logs", params={"action": a, "limit": 2, "page": 1})
        p2 = await c.get("/api/v1/audit-logs", params={"action": a, "limit": 2, "page": 2})
        too_big = await c.get("/api/v1/audit-logs", params={"limit": 201})
        zero = await c.get("/api/v1/audit-logs", params={"limit": 0})
        bad_page = await c.get("/api/v1/audit-logs", params={"page": 0})
        bad_type = await c.get("/api/v1/audit-logs", params={"actor_type": "ROBOT"})
        bad_date = await c.get("/api/v1/audit-logs", params={"from": "hôm-qua"})
        max_ok = await c.get("/api/v1/audit-logs", params={"limit": 200})
    assert p1.status_code == 200 and p2.status_code == 200
    ids = [x["id"] for x in p1.json()["data"]] + [x["id"] for x in p2.json()["data"]]
    assert ids == sorted(seeded["ids"], reverse=True)
    assert p1.json()["meta"] == {"page": 1, "limit": 2, "total_records": 3, "total_pages": 2}
    for r in (too_big, zero, bad_page, bad_type, bad_date):
        assert r.status_code == 422, r.text
        assert error_code(r) == "VALIDATION_ERROR"
    assert max_ok.status_code == 200 and len(max_ok.json()["data"]) <= 200


# ---------- Toàn vẹn chuỗi băm ----------

@pytest.mark.asyncio
async def test_integrity_never_checked_then_recheck_then_rate_limited(seeded):
    rd = redis_sync()
    rd.delete(LAST_KEY, LOCK_KEY)
    async with make_auth_client(seeded["admin"]["id"]) as c:
        r0 = await c.get("/api/v1/audit-logs/integrity")
        assert r0.status_code == 200, r0.text
        assert r0.json()["data"] == {"status": "NEVER_CHECKED", "checked_rows": 0,
                                     "verified_at": None, "first_broken_id": None}

        r1 = await c.get("/api/v1/audit-logs/integrity", params={"recheck": "true"})
        assert r1.status_code == 200, r1.text
        d1 = r1.json()["data"]
        assert d1["status"] in ("OK", "BROKEN")
        assert (d1["first_broken_id"] is None) == (d1["status"] == "OK")
        with db_conn() as conn:
            total = conn.execute("SELECT count(*) FROM audit_logs").fetchone()[0]
        assert d1["checked_rows"] >= 3 and d1["checked_rows"] <= total + 10
        verified = datetime.fromisoformat(d1["verified_at"].replace("Z", "+00:00"))
        assert abs((datetime.now(timezone.utc) - verified).total_seconds()) < 600

        r2 = await c.get("/api/v1/audit-logs/integrity", params={"recheck": "true"})
        assert r2.status_code == 429, r2.text
        assert error_code(r2) == "RATE_LIMITED"

        r3 = await c.get("/api/v1/audit-logs/integrity")
        assert r3.status_code == 200
        assert r3.json()["data"] == d1, "Không recheck → trả kết quả lần kiểm gần nhất"

    assert 0 < rd.ttl(LOCK_KEY) <= 300
    assert json.loads(rd.get(LAST_KEY))["status"] == d1["status"]
    rd.delete(LAST_KEY, LOCK_KEY)


@pytest.mark.asyncio
async def test_integrity_reports_first_broken_id(seeded, monkeypatch):
    """Khi chuỗi gãy, API trả BROKEN + first_broken_id lấy từ services.audit_logs.scan_chain."""
    import backend.app.services.audit_logs as svc

    broken_at = seeded["ids"][1]
    monkeypatch.setattr(svc, "scan_chain", lambda conn: (1234, broken_at))
    rd = redis_sync()
    rd.delete(LAST_KEY, LOCK_KEY)
    async with make_auth_client(seeded["admin"]["id"]) as c:
        r = await c.get("/api/v1/audit-logs/integrity", params={"recheck": "true"})
    rd.delete(LAST_KEY, LOCK_KEY)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["status"] == "BROKEN"
    assert d["first_broken_id"] == broken_at
    assert d["checked_rows"] == 1234


def test_scan_chain_detects_break_on_synthetic_rows():
    """scan_chain_rows(rows) là hàm thuần: nhận các dòng (id, actor_type, actor_id, action, entity_name, entity_id,
    before_state, after_state, ip_address, prev_hash, row_hash) theo id tăng dần, trả (số dòng, id gãy đầu tiên|None).
    Dòng đầu tiên phải nối từ GENESIS_HASH."""
    from backend.app.services.audit import GENESIS_HASH, canonical_json, compute_row_hash
    from backend.app.services.audit_logs import scan_chain_rows

    def mk(i, prev, action="X"):
        payload = "|".join(["SYSTEM", "", action, "cases", str(i), canonical_json(None), canonical_json({"i": i}), ""])
        h = compute_row_hash(prev, payload)
        return (i, "SYSTEM", None, action, "cases", str(i), None, {"i": i}, None, prev, h)

    r1 = mk(1, GENESIS_HASH)
    r2 = mk(2, r1[10])
    r3 = mk(3, r2[10])
    assert scan_chain_rows([r1, r2, r3]) == (3, None)
    assert scan_chain_rows([]) == (0, None)

    tampered = list(r2)
    tampered[7] = {"i": 999}  # sửa nội dung nhưng giữ hash cũ
    assert scan_chain_rows([r1, tuple(tampered), r3]) == (3, 2)

    wrong_link = mk(3, "f" * 64)
    assert scan_chain_rows([r1, r2, wrong_link]) == (3, 3)

    not_from_genesis = mk(1, "a" * 64)
    assert scan_chain_rows([not_from_genesis]) == (1, 1)
