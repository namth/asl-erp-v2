"""Hợp đồng nghiệm thu TASK-011: Xác thực 2 lớp TOTP & mã khôi phục (TSK-17).

Tài liệu căn cứ:
- docs/14-decisions.md (DEC-02)
- docs/10-env-and-security.md (§2.2, §2.2a, chống brute-force, không ghi bí mật vào log)
- docs/07-api-contracts.md (§1.2-1.3 phong bì và mã lỗi, §3.1 xác thực)
- docs/13-test-cases-and-qa.md (TC-SEC-08, TC-SEC-09)
- handoff/tasks/TASK-011-totp-2fa-tsk17/brief.md

Chạy thật với PostgreSQL dev (DATABASE_SYNC_URL) và Redis cục bộ (REDIS_URL, mặc định DB 15).
Mỗi test tạo user riêng với email ngẫu nhiên tsk17-…@asllaw.vn.
"""
import asyncio
import os
import time
import uuid
from pathlib import Path

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/15")
os.environ.setdefault("DATA_ENCRYPTION_MASTER_KEY", "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=")

import httpx
import jwt
import psycopg
import pyotp
import pytest
import redis as redis_sync
from argon2 import PasswordHasher
from argon2.low_level import Type

from backend.app.core.config import settings
from backend.app.main import app

PASSWORD = "Asl@Secure2026"
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
    email = f"tsk17-{uuid.uuid4().hex[:12]}@asllaw.vn"
    with db() as conn:
        row = conn.execute(
            """INSERT INTO users (email, password_hash, full_name, title, system_role,
                                  totp_enabled, must_reset_password, is_active)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (email, TEST_HASHER.hash(PASSWORD), "Người Dùng Kiểm Thử 2FA", "Luật sư", role,
             totp_enabled, must_reset, is_active),
        ).fetchone()
    return {"id": str(row[0]), "email": email}


def client() -> httpx.AsyncClient:
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


# ---------- 1. TC-SEC-08: Phân quyền bắt buộc 2FA theo vai trò ----------

@pytest.mark.parametrize("role", ["ADMIN", "MANAGER", "ACCOUNTANT"])
async def test_tc_sec_08_roles_requiring_2fa_must_setup(role):
    """TC-SEC-08: Vai trò bắt buộc 2FA (ADMIN, MANAGER, ACCOUNTANT) chưa kích hoạt -> 403 TOTP_SETUP_REQUIRED."""
    u = make_user(role, totp_enabled=False)
    async with client() as c:
        r = await login(c, u["email"])
        assert r.status_code == 403, r.text
        assert error_code(r) == "TOTP_SETUP_REQUIRED"
        setup_token = r.json()["error"]["details"]["setup_token"]
        assert setup_token, "phải trả setup_token trong error.details"
        assert not c.cookies.get("access_token"), "chưa thiết lập 2FA thì tuyệt đối không cấp access_token cookie"

        # setup_token không thể dùng như access token gọi /auth/me
        me = await c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {setup_token}"})
        assert me.status_code == 401
        assert error_code(me) == "UNAUTHENTICATED"


async def test_tc_sec_08_attorney_optional_2fa_login_success():
    """TC-SEC-08: Vai trò ATTORNEY chưa bật 2FA thì đăng nhập bình thường (200 OK + cấp phiên)."""
    u = make_user("ATTORNEY", totp_enabled=False)
    async with client() as c:
        r = await login(c, u["email"])
        assert r.status_code == 200, r.text
        assert r.json()["success"] is True
        assert c.cookies.get("access_token"), "ATTORNEY chưa bật 2FA được cấp access_token ngay"
        me = await c.get("/api/v1/auth/me")
        assert me.status_code == 200
        assert me.json()["data"]["user"]["id"] == u["id"]


# ---------- 2. Luồng đầy đủ: Setup -> Enable -> Verify ----------

async def test_full_2fa_flow_setup_enable_and_verify():
    """Luồng đầy đủ:
    1. login -> 403 TOTP_SETUP_REQUIRED + setup_token
    2. POST /auth/2fa/setup bằng setup_token -> nhận secret base32 & otpauth_uri
    3. POST /auth/2fa/enable sai mã -> 401 TOTP_INVALID
    4. POST /auth/2fa/enable đúng mã -> totp_enabled = TRUE, nhận 10 mã khôi phục, có phiên ngay
    5. Đăng nhập lần sau -> 401 TOTP_REQUIRED + challenge_id
    6. POST /auth/2fa/verify đúng mã TOTP -> 200 OK + phiên làm việc + /auth/me dùng được
    """
    u = make_user("ACCOUNTANT", totp_enabled=False)

    # 1. Đăng nhập lấy setup_token
    async with client() as c:
        login_res = await login(c, u["email"])
        assert login_res.status_code == 403
        assert error_code(login_res) == "TOTP_SETUP_REQUIRED"
        setup_token = login_res.json()["error"]["details"]["setup_token"]

        # 2. Setup 2FA qua setup_token
        auth_header = {"Authorization": f"Bearer {setup_token}"}
        setup_res = await c.post("/api/v1/auth/2fa/setup", headers=auth_header)
        assert setup_res.status_code == 200, setup_res.text
        setup_body = setup_res.json()
        assert setup_body["success"] is True
        setup_data = setup_body.get("data", setup_body)
        secret = setup_data["secret"]
        otpauth_uri = setup_data["otpauth_uri"]

        assert len(secret) >= 16, "Bí mật TOTP base32 phải đủ độ dài an toàn"
        assert "otpauth://totp/" in otpauth_uri
        assert "secret=" in otpauth_uri
        assert "ASL" in otpauth_uri
        assert u["email"] in otpauth_uri

        totp = pyotp.TOTP(secret)

        # 3. Kích hoạt thử bằng mã sai -> 401 TOTP_INVALID
        wrong_enable = await c.post("/api/v1/auth/2fa/enable", headers=auth_header, json={"code": "000000"})
        assert wrong_enable.status_code == 401
        assert error_code(wrong_enable) == "TOTP_INVALID"

        # Kiểm tra DB chưa bật
        with db() as conn:
            enabled_status = conn.execute("SELECT totp_enabled FROM users WHERE id = %s", (u["id"],)).fetchone()[0]
        assert enabled_status is False, "Kích hoạt sai mã thì totp_enabled vẫn phải là FALSE"

        # 4. Kích hoạt bằng mã đúng sinh từ pyotp
        valid_code = totp.now()
        enable_res = await c.post("/api/v1/auth/2fa/enable", headers=auth_header, json={"code": valid_code})
        assert enable_res.status_code == 200, enable_res.text
        enable_body = enable_res.json()
        assert enable_body["success"] is True
        enable_data = enable_body.get("data", enable_body)
        recovery_codes = enable_data["recovery_codes"]

        assert isinstance(recovery_codes, list)
        assert len(recovery_codes) == 10, "Phải sinh đúng 10 mã khôi phục"
        for code in recovery_codes:
            assert len(code) == 10 and code.isalnum() and code.isupper(), f"Mã {code} không khớp định dạng 10 ký tự [A-Z0-9]"

        # Do dùng setup_token kích hoạt, hệ thống phải cấp phiên ngay (như login 200)
        assert c.cookies.get("access_token"), "Kích hoạt bằng setup_token thành công phải cấp access_token cookie"
        cookies_header = set_cookie_headers(enable_res)
        for name in ("access_token", "refresh_token", "csrf_token"):
            assert name in cookies_header
            assert "secure" in cookies_header[name].lower()
            assert "samesite=strict" in cookies_header[name].lower()

        # Gọi /auth/me ngay sau kích hoạt thành công
        me_after_enable = await c.get("/api/v1/auth/me")
        assert me_after_enable.status_code == 200
        assert me_after_enable.json()["data"]["user"]["id"] == u["id"]

    # Kiểm tra DB đã chuyển TRUE
    with db() as conn:
        enabled_now = conn.execute("SELECT totp_enabled FROM users WHERE id = %s", (u["id"],)).fetchone()[0]
    assert enabled_now is True, "Sau khi enable thành công, DB phải có totp_enabled = TRUE"

    # 5. Đăng nhập lần tiếp theo -> 401 TOTP_REQUIRED + challenge_id
    async with client() as c2:
        step1 = await login(c2, u["email"])
        assert step1.status_code == 401
        assert error_code(step1) == "TOTP_REQUIRED"
        challenge_id = step1.json()["error"]["details"]["challenge_id"]
        assert challenge_id, "Phải trả challenge_id để xác thực bước 2"
        assert not c2.cookies.get("access_token")

        # 6. Xác thực bước 2 qua /auth/2fa/verify
        verify_code = totp.now()
        step2 = await c2.post("/api/v1/auth/2fa/verify", json={"challenge_id": challenge_id, "code": verify_code})
        assert step2.status_code == 200, step2.text
        step2_body = step2.json()
        assert step2_body["success"] is True
        assert step2_body["data"]["user"]["id"] == u["id"]
        assert c2.cookies.get("access_token")

        me_step2 = await c2.get("/api/v1/auth/me")
        assert me_step2.status_code == 200
        assert me_step2.json()["data"]["user"]["id"] == u["id"]


# ---------- 3. Setup qua phiên đăng nhập (Cookie + CSRF) ----------

async def test_voluntary_2fa_setup_via_cookie_session_and_regenerate():
    """Người dùng tự nguyện bật 2FA khi đang đăng nhập (cookie + CSRF).
    Gọi lại /auth/2fa/setup sinh bí mật mới và huỷ bí mật chưa xác nhận trước đó.
    """
    u = make_user("ATTORNEY", totp_enabled=False)
    async with client() as c:
        # Đăng nhập bình thường
        login_res = await login(c, u["email"])
        assert login_res.status_code == 200

        # Thiếu CSRF -> 403 CSRF_INVALID
        no_csrf = await c.post("/api/v1/auth/2fa/setup")
        assert no_csrf.status_code == 403
        assert error_code(no_csrf) == "CSRF_INVALID"

        # Lần setup thứ nhất
        s1_res = await c.post("/api/v1/auth/2fa/setup", headers=csrf(c))
        assert s1_res.status_code == 200
        secret1 = s1_res.json()["data"]["secret"]

        # Lần setup thứ hai (chưa bật) -> sinh bí mật mới
        s2_res = await c.post("/api/v1/auth/2fa/setup", headers=csrf(c))
        assert s2_res.status_code == 200
        secret2 = s2_res.json()["data"]["secret"]
        assert secret1 != secret2, "Gọi lại setup phải sinh bí mật mới"

        # Thử kích hoạt bằng mã của secret1 cũ -> phải bị từ chối
        code_old = pyotp.TOTP(secret1).now()
        bad_enable = await c.post("/api/v1/auth/2fa/enable", headers=csrf(c), json={"code": code_old})
        assert bad_enable.status_code == 401
        assert error_code(bad_enable) == "TOTP_INVALID"

        # Kích hoạt bằng mã của secret2 mới -> thành công
        code_new = pyotp.TOTP(secret2).now()
        ok_enable = await c.post("/api/v1/auth/2fa/enable", headers=csrf(c), json={"code": code_new})
        assert ok_enable.status_code == 200
        assert len(ok_enable.json()["data"]["recovery_codes"]) == 10

    with db() as conn:
        assert conn.execute("SELECT totp_enabled FROM users WHERE id = %s", (u["id"],)).fetchone()[0] is True


# ---------- 4. Cửa sổ thời gian lệch ±1 bước & chống phát lại ----------

async def test_totp_step_window_and_anti_replay():
    """Kiểm tra:
    - Mã lệch ±1 bước (30s) được chấp nhận (valid_window = 1).
    - Mã lệch ±3 bước (90s) bị từ chối (401 TOTP_INVALID).
    - Chống phát lại: mã TOTP đã dùng thành công trong bước 30s không được dùng lại trong cùng bước.
    """
    u = make_user("ACCOUNTANT", totp_enabled=False)

    # Setup & Enable để lấy secret
    async with client() as c:
        l = await login(c, u["email"])
        token = l.json()["error"]["details"]["setup_token"]
        auth = {"Authorization": f"Bearer {token}"}
        s_res = await c.post("/api/v1/auth/2fa/setup", headers=auth)
        secret = s_res.json()["data"]["secret"]
        totp = pyotp.TOTP(secret)
        await c.post("/api/v1/auth/2fa/enable", headers=auth, json={"code": totp.now()})

    # Kiểm tra mã lệch -1 bước (-30s) -> 200 OK
    async with client() as c:
        chal_res = await login(c, u["email"])
        chal_id = chal_res.json()["error"]["details"]["challenge_id"]
        code_prev = totp.at(time.time() - 30)
        v = await c.post("/api/v1/auth/2fa/verify", json={"challenge_id": chal_id, "code": code_prev})
        assert v.status_code == 200, f"Mã lệch -1 bước phải được chấp nhận: {v.text}"

    # Kiểm tra mã lệch +1 bước (+30s) -> 200 OK
    async with client() as c:
        chal_res = await login(c, u["email"])
        chal_id = chal_res.json()["error"]["details"]["challenge_id"]
        code_next = totp.at(time.time() + 30)
        v = await c.post("/api/v1/auth/2fa/verify", json={"challenge_id": chal_id, "code": code_next})
        assert v.status_code == 200, f"Mã lệch +1 bước phải được chấp nhận: {v.text}"

    # Kiểm tra mã lệch -3 bước (-90s) -> 401 TOTP_INVALID
    async with client() as c:
        chal_res = await login(c, u["email"])
        chal_id = chal_res.json()["error"]["details"]["challenge_id"]
        code_old = totp.at(time.time() - 90)
        v = await c.post("/api/v1/auth/2fa/verify", json={"challenge_id": chal_id, "code": code_old})
        assert v.status_code == 401 and error_code(v) == "TOTP_INVALID"

    # Kiểm tra mã lệch +3 bước (+90s) -> 401 TOTP_INVALID
    async with client() as c:
        chal_res = await login(c, u["email"])
        chal_id = chal_res.json()["error"]["details"]["challenge_id"]
        code_future = totp.at(time.time() + 90)
        v = await c.post("/api/v1/auth/2fa/verify", json={"challenge_id": chal_id, "code": code_future})
        assert v.status_code == 401 and error_code(v) == "TOTP_INVALID"

    # Chống phát lại (Anti-replay): người dùng mới, để bước hiện tại chưa bị dùng ở enable/verify phía trên
    u = make_user("ACCOUNTANT", totp_enabled=False)
    async with client() as c:
        l = await login(c, u["email"])
        auth = {"Authorization": f"Bearer {l.json()['error']['details']['setup_token']}"}
        secret = (await c.post("/api/v1/auth/2fa/setup", headers=auth)).json()["data"]["secret"]
        totp = pyotp.TOTP(secret)
        await c.post("/api/v1/auth/2fa/enable", headers=auth, json={"code": totp.at(time.time() - 30)})
    async with client() as c:
        chal_res1 = await login(c, u["email"])
        chal_id1 = chal_res1.json()["error"]["details"]["challenge_id"]
        current_code = totp.now()
        v1 = await c.post("/api/v1/auth/2fa/verify", json={"challenge_id": chal_id1, "code": current_code})
        assert v1.status_code == 200

        # Yêu cầu challenge mới trong cùng bước 30s
        chal_res2 = await login(c, u["email"])
        chal_id2 = chal_res2.json()["error"]["details"]["challenge_id"]
        v2 = await c.post("/api/v1/auth/2fa/verify", json={"challenge_id": chal_id2, "code": current_code})
        assert v2.status_code == 401, "Mã TOTP đã dùng trong cùng bước 30s không được dùng lại (chống phát lại)"
        assert error_code(v2) == "TOTP_INVALID"


# ---------- 5. TC-SEC-09: Khóa tài khoản sau 5 lần verify sai ----------

async def test_tc_sec_09_verify_lockout_after_5_failures():
    """TC-SEC-09: Xác thực sai bước 2 quá 5 lần trong 15 phút -> tính vào bộ đếm khóa tài khoản.
    Lần thứ 6 (dù nhập đúng) -> 423 ACCOUNT_LOCKED, kèm đúng 1 dòng audit ACCOUNT_LOCKED.
    """
    u = make_user("ACCOUNTANT", totp_enabled=False)

    # Setup & Enable
    async with client() as c:
        l = await login(c, u["email"])
        token = l.json()["error"]["details"]["setup_token"]
        auth = {"Authorization": f"Bearer {token}"}
        s_res = await c.post("/api/v1/auth/2fa/setup", headers=auth)
        secret = s_res.json()["data"]["secret"]
        totp = pyotp.TOTP(secret)
        await c.post("/api/v1/auth/2fa/enable", headers=auth, json={"code": totp.now()})

    # Thử sai 5 lần liên tiếp
    async with client() as c:
        for i in range(5):
            login_res = await login(c, u["email"])
            assert login_res.status_code == 401
            chal_id = login_res.json()["error"]["details"]["challenge_id"]
            bad_verify = await c.post("/api/v1/auth/2fa/verify", json={"challenge_id": chal_id, "code": "000000"})
            assert bad_verify.status_code == 401
            assert error_code(bad_verify) == "TOTP_INVALID"

        # Lần thứ 6: dù nhập mật khẩu đúng, bước login hoặc verify phải báo tài khoản bị khóa 423
        locked_attempt = await login(c, u["email"])
        assert locked_attempt.status_code == 423, locked_attempt.text
        assert error_code(locked_attempt) == "ACCOUNT_LOCKED"
        retry_seconds = locked_attempt.json()["error"]["details"]["retry_after_seconds"]
        assert 1700 <= retry_seconds <= 1800, retry_seconds

    # Kiểm tra đúng 1 dòng audit ACCOUNT_LOCKED
    with db() as conn:
        n = conn.execute(
            """SELECT count(*) FROM audit_logs
               WHERE action = 'ACCOUNT_LOCKED' AND entity_name = 'users' AND entity_id = %s""",
            (u["id"],),
        ).fetchone()[0]
    assert n == 1, "Khóa tài khoản do sai 2FA phải ghi đúng 1 dòng audit ACCOUNT_LOCKED"


# ---------- 6. TC-SEC-09: Mã khôi phục dùng 1 lần & từ chối dùng lại ----------

async def test_tc_sec_09_recovery_code_one_time_use_and_invalidation():
    """TC-SEC-09:
    - Mã khôi phục 10 ký tự [A-Z0-9] xác thực thành công tại /auth/2fa/verify.
    - Dùng lại chính mã khôi phục đó lần thứ 2 -> 401 TOTP_INVALID.
    - Mã khôi phục khác trong danh sách vẫn dùng được.
    """
    u = make_user("MANAGER", totp_enabled=False)

    # Setup & Enable để nhận 10 mã khôi phục
    async with client() as c:
        l = await login(c, u["email"])
        token = l.json()["error"]["details"]["setup_token"]
        auth = {"Authorization": f"Bearer {token}"}
        s_res = await c.post("/api/v1/auth/2fa/setup", headers=auth)
        secret = s_res.json()["data"]["secret"]
        totp = pyotp.TOTP(secret)
        e_res = await c.post("/api/v1/auth/2fa/enable", headers=auth, json={"code": totp.now()})
        recovery_codes = e_res.json()["data"]["recovery_codes"]

    code1 = recovery_codes[0]
    code2 = recovery_codes[1]

    # Lần 1: Dùng code1 xác thực -> 200 OK
    async with client() as c1:
        step1 = await login(c1, u["email"])
        chal1 = step1.json()["error"]["details"]["challenge_id"]
        v1 = await c1.post("/api/v1/auth/2fa/verify", json={"challenge_id": chal1, "code": code1})
        assert v1.status_code == 200, v1.text
        assert v1.json()["success"] is True
        assert c1.cookies.get("access_token")
        assert (await c1.get("/api/v1/auth/me")).status_code == 200

    # Kiểm tra trong DB: code1 đã được đánh dấu used_at
    with db() as conn:
        used_at_count = conn.execute(
            "SELECT count(*) FROM user_recovery_codes WHERE user_id = %s AND used_at IS NOT NULL",
            (u["id"],),
        ).fetchone()[0]
    assert used_at_count == 1, "Sau 1 lần dùng mã khôi phục, đúng 1 dòng phải có used_at IS NOT NULL"

    # Lần 2: Cố tình dùng lại code1 -> 401 TOTP_INVALID
    async with client() as c2:
        step2 = await login(c2, u["email"])
        chal2 = step2.json()["error"]["details"]["challenge_id"]
        v2 = await c2.post("/api/v1/auth/2fa/verify", json={"challenge_id": chal2, "code": code1})
        assert v2.status_code == 401, "Mã khôi phục đã dùng một lần không được phép dùng lại"
        assert error_code(v2) == "TOTP_INVALID"

    # Lần 3: Dùng code2 -> 200 OK
    async with client() as c3:
        step3 = await login(c3, u["email"])
        chal3 = step3.json()["error"]["details"]["challenge_id"]
        v3 = await c3.post("/api/v1/auth/2fa/verify", json={"challenge_id": chal3, "code": code2})
        assert v3.status_code == 200, v3.text
        assert c3.cookies.get("access_token")


# ---------- 7. Bảo mật challenge_id & setup_token ----------

async def test_challenge_id_and_setup_token_security():
    """Kiểm tra:
    - challenge_id không thể dùng lại sau khi verify thành công.
    - challenge_id không tồn tại hoặc hết hạn -> 401 UNAUTHENTICATED.
    - setup_token không thể gọi /auth/me hoặc /auth/logout.
    """
    u = make_user("ACCOUNTANT", totp_enabled=False)

    async with client() as c:
        l = await login(c, u["email"])
        token = l.json()["error"]["details"]["setup_token"]
        auth = {"Authorization": f"Bearer {token}"}

        # setup_token không gọi được các API của phiên
        me_resp = await c.get("/api/v1/auth/me", headers=auth)
        assert me_resp.status_code == 401 and error_code(me_resp) == "UNAUTHENTICATED"

        logout_resp = await c.post("/api/v1/auth/logout", headers=auth)
        assert logout_resp.status_code == 401 and error_code(logout_resp) == "UNAUTHENTICATED"

        # Kích hoạt 2FA
        s_res = await c.post("/api/v1/auth/2fa/setup", headers=auth)
        secret = s_res.json()["data"]["secret"]
        totp = pyotp.TOTP(secret)
        await c.post("/api/v1/auth/2fa/enable", headers=auth, json={"code": totp.now()})

    # Đăng nhập lấy challenge_id
    async with client() as c:
        l2 = await login(c, u["email"])
        chal_id = l2.json()["error"]["details"]["challenge_id"]

        # Verify thành công
        v1 = await c.post("/api/v1/auth/2fa/verify", json={"challenge_id": chal_id, "code": totp.now()})
        assert v1.status_code == 200

        # Dùng lại chính challenge_id đó -> 401 UNAUTHENTICATED
        v_replay = await c.post("/api/v1/auth/2fa/verify", json={"challenge_id": chal_id, "code": totp.now()})
        assert v_replay.status_code == 401
        assert error_code(v_replay) == "UNAUTHENTICATED"

        # challenge_id ngẫu nhiên giả mạo -> 401 UNAUTHENTICATED
        v_fake = await c.post("/api/v1/auth/2fa/verify", json={"challenge_id": str(uuid.uuid4()), "code": totp.now()})
        assert v_fake.status_code == 401
        assert error_code(v_fake) == "UNAUTHENTICATED"


# ---------- 8. Không lưu bí mật bản rõ trong DB & Audit logs ----------

async def test_db_and_audit_no_plaintext_secrets():
    """Kiểm tra DB & Audit logs:
    - users.totp_secret_enc không chứa secret base32 bản rõ (phải là BYTEA mã hoá AES-256-GCM).
    - user_recovery_codes.code_hash bắt đầu bằng $argon2id$ và không chứa mã bản rõ.
    - Không dòng audit_logs nào chứa bí mật TOTP hoặc mã khôi phục bản rõ.
    """
    u = make_user("ADMIN", totp_enabled=False)

    async with client() as c:
        l = await login(c, u["email"])
        token = l.json()["error"]["details"]["setup_token"]
        auth = {"Authorization": f"Bearer {token}"}
        s_res = await c.post("/api/v1/auth/2fa/setup", headers=auth)
        secret = s_res.json()["data"]["secret"]
        totp = pyotp.TOTP(secret)
        e_res = await c.post("/api/v1/auth/2fa/enable", headers=auth, json={"code": totp.now()})
        recovery_codes = e_res.json()["data"]["recovery_codes"]

    with db() as conn:
        # 1. Kiểm tra users.totp_secret_enc
        row = conn.execute("SELECT totp_secret_enc, totp_enabled FROM users WHERE id = %s", (u["id"],)).fetchone()
        assert row[1] is True
        secret_enc = bytes(row[0]) if row[0] is not None else b""
        assert len(secret_enc) >= 28, "totp_secret_enc phải chứa nonce (12 byte) + ciphertext + auth tag (16 byte)"
        assert secret.encode("ascii") not in secret_enc, "Bí mật TOTP base32 tuyệt đối không lưu bản rõ trong DB"

        # 2. Kiểm tra user_recovery_codes
        rc_rows = conn.execute("SELECT code_hash, used_at FROM user_recovery_codes WHERE user_id = %s", (u["id"],)).fetchall()
        assert len(rc_rows) == 10, "Phải có đúng 10 bản ghi mã khôi phục trong DB"
        for h, used in rc_rows:
            assert h.startswith("$argon2id$"), f"Mã băm khôi phục phải dùng Argon2id: {h}"
            assert "m=65536" in h or "t=3" in h or "p=4" in h
            for plain in recovery_codes:
                assert plain not in h, f"Mã khôi phục bản rõ {plain} không được xuất hiện trong code_hash"

        # 3. Kiểm tra audit_logs không lộ bí mật
        logs = conn.execute("SELECT before_state, after_state FROM audit_logs").fetchall()
        for before_state, after_state in logs:
            text_dump = f"{before_state or ''} {after_state or ''}"
            assert secret not in text_dump, "Bí mật TOTP không bao giờ được ghi vào audit_logs"
            for plain in recovery_codes:
                assert plain not in text_dump, f"Mã khôi phục {plain} không bao giờ được ghi vào audit_logs"


# ---------- 9. ADMIN reset 2FA: Phân quyền, CSRF, Audit & Thu hồi phiên ----------

async def test_admin_reset_2fa_flow_permissions_and_audit():
    """POST /users/{id}/2fa/reset:
    - Chỉ ADMIN mới có quyền gọi (ATTORNEY gọi -> 403).
    - ADMIN không thể tự reset chính mình -> 403.
    - Thiếu hoặc lý do < 10 ký tự -> 422 VALIDATION_ERROR.
    - Yêu cầu CSRF token (nếu thiếu -> 403 CSRF_INVALID).
    - Thành công: xoá secret, xoá mã khôi phục, totp_enabled = FALSE.
    - Thu hồi toàn bộ phiên của người bị reset (phiên cũ gọi /auth/me -> 401 TOKEN_REVOKED).
    - Ghi đúng 1 audit log RESET_2FA (after_state chỉ có lý do, không có bí mật).
    """
    admin1 = make_user("ADMIN", totp_enabled=False)
    admin2 = make_user("ADMIN", totp_enabled=False)
    target = make_user("ACCOUNTANT", totp_enabled=False)

    # 1. Target thiết lập và kích hoạt 2FA, mở một phiên đăng nhập
    async with client() as c_target:
        l = await login(c_target, target["email"])
        token = l.json()["error"]["details"]["setup_token"]
        auth = {"Authorization": f"Bearer {token}"}
        s_res = await c_target.post("/api/v1/auth/2fa/setup", headers=auth)
        secret = s_res.json()["data"]["secret"]
        totp = pyotp.TOTP(secret)
        await c_target.post("/api/v1/auth/2fa/enable", headers=auth, json={"code": totp.now()})

        # Mở phiên hợp lệ cho target
        l2 = await login(c_target, target["email"])
        chal = l2.json()["error"]["details"]["challenge_id"]
        v = await c_target.post("/api/v1/auth/2fa/verify", json={"challenge_id": chal, "code": totp.now()})
        assert v.status_code == 200
        target_cookie_session = c_target.cookies.get("access_token")
        assert (await c_target.get("/api/v1/auth/me")).status_code == 200

    # 2. ATTORNEY cố tình gọi reset -> 403 FORBIDDEN
    attorney = make_user("ATTORNEY", totp_enabled=False)
    async with client() as c_attorney:
        await login(c_attorney, attorney["email"])
        r_attorney = await c_attorney.post(
            f"/api/v1/users/{target['id']}/2fa/reset",
            headers=csrf(c_attorney),
            json={"reason": "Tôi muốn reset 2FA của đồng nghiệp"},
        )
        assert r_attorney.status_code == 403, r_attorney.text

    # 3. ADMIN tự reset chính mình -> 403 FORBIDDEN
    # Bật 2FA cho admin1 trước
    async with client() as c_admin1:
        l_a1 = await login(c_admin1, admin1["email"])
        t_a1 = l_a1.json()["error"]["details"]["setup_token"]
        auth_a1 = {"Authorization": f"Bearer {t_a1}"}
        s_a1 = await c_admin1.post("/api/v1/auth/2fa/setup", headers=auth_a1)
        totp_a1 = pyotp.TOTP(s_a1.json()["data"]["secret"])
        await c_admin1.post("/api/v1/auth/2fa/enable", headers=auth_a1, json={"code": totp_a1.now()})

        # admin1 đăng nhập
        l_a1_in = await login(c_admin1, admin1["email"])
        await c_admin1.post("/api/v1/auth/2fa/verify", json={"challenge_id": l_a1_in.json()["error"]["details"]["challenge_id"], "code": totp_a1.now()})

        # admin1 tự reset chính mình -> 403
        self_reset = await c_admin1.post(
            f"/api/v1/users/{admin1['id']}/2fa/reset",
            headers=csrf(c_admin1),
            json={"reason": "Tự reset thiết bị 2FA cá nhân"},
        )
        assert self_reset.status_code == 403, "Admin không được tự reset 2FA của chính mình"

    # 4. ADMIN2 đăng nhập để reset cho target
    async with client() as c_admin2:
        l_a2 = await login(c_admin2, admin2["email"])
        t_a2 = l_a2.json()["error"]["details"]["setup_token"]
        auth_a2 = {"Authorization": f"Bearer {t_a2}"}
        s_a2 = await c_admin2.post("/api/v1/auth/2fa/setup", headers=auth_a2)
        totp_a2 = pyotp.TOTP(s_a2.json()["data"]["secret"])
        await c_admin2.post("/api/v1/auth/2fa/enable", headers=auth_a2, json={"code": totp_a2.now()})

        # admin2 đăng nhập có phiên
        l_a2_in = await login(c_admin2, admin2["email"])
        await c_admin2.post("/api/v1/auth/2fa/verify", json={"challenge_id": l_a2_in.json()["error"]["details"]["challenge_id"], "code": totp_a2.now()})

        # Thử thiếu CSRF -> 403 CSRF_INVALID
        no_csrf = await c_admin2.post(
            f"/api/v1/users/{target['id']}/2fa/reset",
            json={"reason": "Mất máy điện thoại chứa authenticator"},
        )
        assert no_csrf.status_code == 403 and error_code(no_csrf) == "CSRF_INVALID"

        # Thử lý do < 10 ký tự -> 422 VALIDATION_ERROR
        short_reason = await c_admin2.post(
            f"/api/v1/users/{target['id']}/2fa/reset",
            headers=csrf(c_admin2),
            json={"reason": "Mất máy"},
        )
        assert short_reason.status_code == 422 and error_code(short_reason) == "VALIDATION_ERROR"

        # Thử thiếu hẳn reason -> 422 VALIDATION_ERROR
        empty_reason = await c_admin2.post(
            f"/api/v1/users/{target['id']}/2fa/reset",
            headers=csrf(c_admin2),
            json={},
        )
        assert empty_reason.status_code == 422 and error_code(empty_reason) == "VALIDATION_ERROR"

        # Reset hợp lệ bởi ADMIN2
        valid_reason = "Nhân viên bị hỏng điện thoại và mất ứng dụng xác thực"
        reset_ok = await c_admin2.post(
            f"/api/v1/users/{target['id']}/2fa/reset",
            headers=csrf(c_admin2),
            json={"reason": valid_reason},
        )
        assert reset_ok.status_code in (200, 204), reset_ok.text

    # 5. Kiểm tra hệ quả của Reset:
    with db() as conn:
        # DB target: totp_enabled = FALSE, totp_secret_enc IS NULL
        t_row = conn.execute("SELECT totp_enabled, totp_secret_enc FROM users WHERE id = %s", (target["id"],)).fetchone()
        assert t_row[0] is False, "Sau khi reset, totp_enabled phải trở về FALSE"
        assert t_row[1] is None, "Sau khi reset, totp_secret_enc phải được xoá về NULL"

        # Bảng recovery codes của target phải rỗng (hoặc bị xoá)
        rc_cnt = conn.execute("SELECT count(*) FROM user_recovery_codes WHERE user_id = %s", (target["id"],)).fetchone()[0]
        assert rc_cnt == 0, "Sau khi reset, mọi mã khôi phục cũ phải bị xoá"

        # Đúng 1 dòng audit RESET_2FA
        audit_rows = conn.execute(
            """SELECT actor_id, action, entity_name, entity_id, after_state
               FROM audit_logs
               WHERE action = 'RESET_2FA' AND entity_name = 'users' AND entity_id = %s""",
            (target["id"],),
        ).fetchall()
        assert len(audit_rows) == 1, f"Phải ghi đúng 1 dòng audit RESET_2FA, tìm thấy {len(audit_rows)}"
        audit_entry = audit_rows[0]
        assert audit_entry[0] == admin2["id"], "actor_id phải là ADMIN2 thực hiện reset"
        assert valid_reason in str(audit_entry[4]), "after_state phải ghi nhận lý do reset"
        assert "secret" not in str(audit_entry[4]), "after_state không được chứa bí mật"

    # 6. Phiên cũ của Target bị thu hồi ngay lập tức
    async with client() as c_revoked:
        c_revoked.cookies.set("access_token", target_cookie_session)
        revoked_check = await c_revoked.get("/api/v1/auth/me")
        assert revoked_check.status_code == 401, "Phiên cũ của người bị reset 2FA phải bị thu hồi ngay lập tức"
        assert error_code(revoked_check) == "TOKEN_REVOKED"


# ---------- 10. Chống lách & Ràng buộc mã hoá ----------

def test_anti_tampering_and_crypto_standards():
    """Kiểm tra:
    - Code sản phẩm trong backend/app không chứa chuỗi lách test ('tsk17-', 'pytest').
    - Sử dụng hmac.compare_digest khi so sánh mã.
    - Bí mật mã hoá AES-256-GCM với DATA_ENCRYPTION_MASTER_KEY.
    """
    src_files = list(Path("backend/app").rglob("*.py"))
    src = "\n".join(p.read_text(encoding="utf-8") for p in src_files)

    assert "tsk17-" not in src and "pytest" not in src, "Code sản phẩm không được có nhánh riêng cho test"
    assert "compare_digest" in src, "Phải dùng hmac.compare_digest chống tấn công đo thời gian"
    assert "argon2" in src, "Mã khôi phục phải được băm bằng Argon2id"
    assert "DATA_ENCRYPTION_MASTER_KEY" in src or "AESGCM" in src or "AES" in src, "Phải dùng mã hoá AES theo cấu hình"
