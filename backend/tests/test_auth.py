"""Nghiệm thu TSK-03 — xác thực nội bộ, phiên & thu hồi token.

Hợp đồng: docs/07-api-contracts.md §1.2–1.3, §3.1; chính sách: docs/10-env-and-security.md (Argon2id, CSRF,
tokens_valid_after, blocklist); test case TC-SEC-04..07 (docs/13).

Chạy thật với PostgreSQL dev (DATABASE_SYNC_URL) và Redis cục bộ (REDIS_URL, mặc định DB số 15 — bị FLUSHDB mỗi test).
Mỗi test tạo người dùng riêng (email ngẫu nhiên) nên chạy lặp được.
"""
import os

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/15")

import asyncio
import uuid

import httpx
import jwt
import psycopg
import pytest
import redis as redis_sync
from argon2 import PasswordHasher
from argon2.low_level import Type

from backend.app.core.config import settings
from backend.app.main import app

PASSWORD = "Asl@Secure2026"
NEW_PASSWORD = "Asl#Changed2027"
TEST_HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4, type=Type.ID)


# ---------- hạ tầng test ----------

@pytest.fixture(autouse=True)
def clean_redis():
    r = redis_sync.Redis.from_url(os.environ["REDIS_URL"])
    r.flushdb()
    yield
    r.flushdb()


def db():
    return psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True)


def make_user(role="ATTORNEY", *, totp_enabled=False, must_reset=False, is_active=True) -> dict:
    email = f"tsk03-{uuid.uuid4().hex[:12]}@asllaw.vn"
    with db() as conn:
        row = conn.execute(
            """INSERT INTO users (email, password_hash, full_name, title, system_role,
                                  totp_enabled, must_reset_password, is_active)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (email, TEST_HASHER.hash(PASSWORD), "Người Dùng Kiểm Thử", "Luật sư", role,
             totp_enabled, must_reset, is_active),
        ).fetchone()
    return {"id": str(row[0]), "email": email}


def client() -> httpx.AsyncClient:
    # https để cookie cờ Secure được gửi lại
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://testserver")


async def login(c: httpx.AsyncClient, email: str, password: str = PASSWORD) -> httpx.Response:
    return await c.post("/api/v1/auth/login", json={"email": email, "password": password})


def csrf(c: httpx.AsyncClient) -> dict:
    return {"X-CSRF-Token": c.cookies.get("csrf_token") or ""}


def error_code(resp: httpx.Response) -> str:
    body = resp.json()
    assert body.get("success") is False, body
    return body["error"]["code"]


def set_cookie_headers(resp: httpx.Response) -> dict[str, str]:
    out = {}
    for h in resp.headers.get_list("set-cookie"):
        out[h.split("=", 1)[0].strip()] = h
    return out


# ---------- đăng nhập ----------

async def test_login_success_sets_secure_cookies_and_returns_user():
    u = make_user()
    async with client() as c:
        r = await login(c, u["email"])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True
    data = body["data"]
    assert data["expires_in"] == 1800
    user = data["user"]
    assert user["id"] == u["id"] and user["email"] == u["email"]
    assert user["system_role"] == "ATTORNEY"
    for key in ("full_name", "title", "is_executive", "led_department_ids", "totp_enabled"):
        assert key in user, key
    assert "password_hash" not in r.text and "totp_secret" not in r.text

    cookies = set_cookie_headers(r)
    for name in ("access_token", "refresh_token", "csrf_token"):
        assert name in cookies, f"thiếu cookie {name}"
        assert "secure" in cookies[name].lower(), name
        assert "samesite=strict" in cookies[name].lower(), name
    for name in ("access_token", "refresh_token"):
        assert "httponly" in cookies[name].lower(), f"{name} phải HttpOnly"
    assert "httponly" not in cookies["csrf_token"].lower(), "csrf_token phải đọc được từ JS"


async def test_access_token_lives_30_minutes_and_has_jti():
    u = make_user()
    async with client() as c:
        await login(c, u["email"])
        claims = jwt.decode(c.cookies.get("access_token"), options={"verify_signature": False})
    assert claims["exp"] - claims["iat"] == 1800
    assert claims.get("jti") and claims.get("sub") == u["id"]


async def test_wrong_password_and_unknown_email_look_identical():
    u = make_user()
    async with client() as c:
        wrong = await login(c, u["email"], "Sai@Matkhau999")
        unknown = await login(c, f"khong-ton-tai-{uuid.uuid4().hex[:8]}@asllaw.vn")
    assert wrong.status_code == unknown.status_code == 401
    assert error_code(wrong) == error_code(unknown) == "UNAUTHENTICATED"
    assert wrong.json()["error"]["message"] == unknown.json()["error"]["message"]


async def test_inactive_account_cannot_login():
    u = make_user(is_active=False)
    async with client() as c:
        r = await login(c, u["email"])
    assert r.status_code == 423
    assert error_code(r) == "ACCOUNT_LOCKED"


async def test_validation_error_envelope():
    async with client() as c:
        r = await c.post("/api/v1/auth/login", json={"email": "khong-phai-email"})
    assert r.status_code == 422
    assert error_code(r) == "VALIDATION_ERROR"
    assert "fields" in r.json()["error"].get("details", {})


# ---------- /me & token ----------

async def test_me_requires_valid_access_token():
    u = make_user()
    async with client() as c:
        anon = await c.get("/api/v1/auth/me")
        assert anon.status_code == 401 and error_code(anon) == "UNAUTHENTICATED"
        await login(c, u["email"])
        me = await c.get("/api/v1/auth/me")
        assert me.status_code == 200, me.text
        assert me.json()["data"]["user"]["id"] == u["id"]
        c.cookies.set("access_token", c.cookies.get("access_token")[:-4] + "abcd")
        forged = await c.get("/api/v1/auth/me")
        assert forged.status_code == 401 and error_code(forged) == "UNAUTHENTICATED"


async def test_tc_sec_04_logout_revokes_access_token():
    u = make_user()
    async with client() as c:
        await login(c, u["email"])
        old_access = c.cookies.get("access_token")
        out = await c.post("/api/v1/auth/logout", headers=csrf(c))
        assert out.status_code == 204, out.text
    async with client() as replay:
        replay.cookies.set("access_token", old_access)
        r = await replay.get("/api/v1/auth/me")
    assert r.status_code == 401
    assert error_code(r) == "TOKEN_REVOKED"


async def test_write_requests_require_csrf_header():
    u = make_user()
    async with client() as c:
        await login(c, u["email"])
        missing = await c.post("/api/v1/auth/logout")
        wrong = await c.post("/api/v1/auth/logout", headers={"X-CSRF-Token": "sai"})
        still_in = await c.get("/api/v1/auth/me")
    assert missing.status_code == wrong.status_code == 403
    assert error_code(missing) == error_code(wrong) == "CSRF_INVALID"
    assert still_in.status_code == 200, "logout bị từ chối thì phiên phải còn nguyên"


# ---------- refresh xoay vòng ----------

async def test_tc_sec_05_refresh_rotation_and_reuse_detection():
    u = make_user()
    async with client() as c:
        await login(c, u["email"])
        old_refresh = c.cookies.get("refresh_token")
        r1 = await c.post("/api/v1/auth/refresh", headers=csrf(c))
        assert r1.status_code == 200, r1.text
        new_refresh = c.cookies.get("refresh_token")
        assert new_refresh and new_refresh != old_refresh
        assert (await c.get("/api/v1/auth/me")).status_code == 200

    async with client() as attacker:  # dùng lại refresh token đã bị thay
        attacker.cookies.set("refresh_token", old_refresh)
        attacker.cookies.set("csrf_token", "x")
        reuse = await attacker.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": "x"})
    assert reuse.status_code == 401 and error_code(reuse) == "TOKEN_REVOKED"

    async with client() as victim:  # cả chuỗi bị thu hồi, kể cả token mới
        victim.cookies.set("refresh_token", new_refresh)
        victim.cookies.set("csrf_token", "y")
        after = await victim.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": "y"})
    assert after.status_code == 401 and error_code(after) == "TOKEN_REVOKED"

    with db() as conn:
        rows = conn.execute("SELECT count(*), count(revoked_at), count(DISTINCT family_id) "
                            "FROM refresh_tokens WHERE user_id = %s", (u["id"],)).fetchone()
    assert rows[0] >= 2 and rows[0] == rows[1] and rows[2] == 1, rows


# ---------- thu hồi mọi phiên ----------

async def test_tc_sec_06_revoke_all_sessions():
    from backend.app.services.sessions import revoke_user_sessions

    u = make_user()
    async with client() as a, client() as b:
        await login(a, u["email"])
        await login(b, u["email"])
        assert (await a.get("/api/v1/auth/me")).status_code == 200  # nạp cache nếu có
        await revoke_user_sessions(uuid.UUID(u["id"]))
        ra, rb = await a.get("/api/v1/auth/me"), await b.get("/api/v1/auth/me")
        refresh = await a.post("/api/v1/auth/refresh", headers=csrf(a))
    for r in (ra, rb):
        assert r.status_code == 401 and error_code(r) == "TOKEN_REVOKED", r.text
    assert refresh.status_code == 401, "refresh token cũ cũng phải hết hiệu lực"

    await asyncio.sleep(1.1)  # iat tính theo giây
    async with client() as fresh:
        assert (await login(fresh, u["email"])).status_code == 200
        assert (await fresh.get("/api/v1/auth/me")).status_code == 200, "phiên mới sau mốc thu hồi phải dùng được"


# ---------- chống brute-force ----------

async def test_tc_sec_07_lockout_after_5_failures():
    u = make_user()
    async with client() as c:
        for _ in range(5):
            r = await login(c, u["email"], "Sai@Matkhau999")
            assert r.status_code == 401
        locked = await login(c, u["email"])
    assert locked.status_code == 423
    assert error_code(locked) == "ACCOUNT_LOCKED"
    retry = locked.json()["error"]["details"]["retry_after_seconds"]
    assert 1700 <= retry <= 1800, retry  # khoá 30 phút
    with db() as conn:
        n = conn.execute("SELECT count(*) FROM audit_logs WHERE action = 'ACCOUNT_LOCKED' "
                         "AND entity_name = 'users' AND entity_id = %s", (u["id"],)).fetchone()[0]
    assert n == 1, "khoá tài khoản phải ghi đúng 1 dòng audit ACCOUNT_LOCKED (để cảnh báo Quản trị viên)"


async def test_lockout_is_per_account():
    victim, other = make_user(), make_user()
    async with client() as c:
        for _ in range(5):
            await login(c, victim["email"], "Sai@Matkhau999")
        assert (await login(c, other["email"])).status_code == 200


async def test_success_resets_failure_counter():
    u = make_user()
    async with client() as c:
        for _ in range(4):
            await login(c, u["email"], "Sai@Matkhau999")
        assert (await login(c, u["email"])).status_code == 200
        for _ in range(4):
            await login(c, u["email"], "Sai@Matkhau999")
        assert (await login(c, u["email"])).status_code == 200


# ---------- 2FA & đặt lại mật khẩu (nhánh của login) ----------

@pytest.mark.parametrize("role", ["ADMIN", "MANAGER", "ACCOUNTANT"])
async def test_roles_requiring_2fa_get_setup_token_only(role):
    u = make_user(role)
    async with client() as c:
        r = await login(c, u["email"])
        assert r.status_code == 403 and error_code(r) == "TOTP_SETUP_REQUIRED"
        setup_token = r.json()["error"]["details"]["setup_token"]
        assert not c.cookies.get("access_token"), "chưa qua 2FA thì không được cấp phiên"
        me = await c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {setup_token}"})
    assert me.status_code == 401, "setup_token không được dùng như access token"


async def test_totp_enabled_user_gets_challenge():
    u = make_user(totp_enabled=True)
    async with client() as c:
        r = await login(c, u["email"])
    assert r.status_code == 401 and error_code(r) == "TOTP_REQUIRED"
    assert r.json()["error"]["details"]["challenge_id"]
    assert not c.cookies.get("access_token")


async def test_must_reset_password_flow():
    u = make_user(must_reset=True)
    async with client() as c:
        r = await login(c, u["email"])
        assert r.status_code == 403 and error_code(r) == "PASSWORD_RESET_REQUIRED"
        reset_token = r.json()["error"]["details"]["reset_token"]
        auth = {"Authorization": f"Bearer {reset_token}"}
        assert (await c.get("/api/v1/auth/me", headers=auth)).status_code == 401

        weak = await c.post("/api/v1/auth/password", headers=auth, json={"new_password": "ngan"})
        assert weak.status_code == 422 and error_code(weak) == "VALIDATION_ERROR"
        ok = await c.post("/api/v1/auth/password", headers=auth, json={"new_password": NEW_PASSWORD})
        assert ok.status_code in (200, 204), ok.text
        reuse = await c.post("/api/v1/auth/password", headers=auth, json={"new_password": "Asl$Another2028"})
        assert reuse.status_code == 401, "reset_token chỉ dùng một lần"

    async with client() as c:
        assert (await login(c, u["email"])).status_code == 401
        assert (await login(c, u["email"], NEW_PASSWORD)).status_code == 200
    with db() as conn:
        h, must = conn.execute("SELECT password_hash, must_reset_password FROM users WHERE id = %s",
                               (u["id"],)).fetchone()
    assert must is False
    assert h.startswith("$argon2id$") and "m=65536" in h and "t=3" in h and "p=4" in h, h


async def test_change_password_revokes_other_sessions():
    u = make_user()
    async with client() as a, client() as b:
        await login(a, u["email"])
        await login(b, u["email"])
        bad = await a.post("/api/v1/auth/password", headers=csrf(a),
                           json={"current_password": "Sai@Matkhau999", "new_password": NEW_PASSWORD})
        assert bad.status_code == 401
        ok = await a.post("/api/v1/auth/password", headers=csrf(a),
                          json={"current_password": PASSWORD, "new_password": NEW_PASSWORD})
        assert ok.status_code in (200, 204), ok.text
        rb = await b.get("/api/v1/auth/me")
    assert rb.status_code == 401 and error_code(rb) == "TOKEN_REVOKED"


# ---------- chống lách ----------

def test_no_plaintext_secrets_or_hardcoded_test_bypass():
    from pathlib import Path
    src = "\n".join(p.read_text(encoding="utf-8") for p in Path("backend/app").rglob("*.py"))
    assert "tsk03-" not in src and "pytest" not in src, "code sản phẩm không được có nhánh riêng cho test"
    assert "argon2" in src, "phải băm bằng Argon2id"
