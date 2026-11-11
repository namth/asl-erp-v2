"""Nghiệm thu TASK-018 — Backend khách hàng & hồ sơ chi tiết (TSK-04).

Hợp đồng & đặc tả:
- handoff/tasks/TASK-018-khach-hang-backend-tsk04/brief.md
- docs/07-api-contracts.md §1.2, §1.3, §2, §3.3
- docs/06-database-schema.md (clients, client_interactions, case_parties, cases, notifications)
- docs/13-test-cases-and-qa.md TC-CRM-01, TC-CRM-03, TC-CRM-04

Kiểm thử hành vi thật:
- TC-CRM-01: Chặn trùng MST doanh nghiệp (409 DUPLICATE_TAX_CODE), định dạng MST (422).
- TC-CRM-03: Chặn trùng CCCD cá nhân (409 DUPLICATE_IDENTITY_NO), chuẩn hoá bỏ dấu chấm/khoảng trắng,
  che dữ liệu (********1234), mã hoá DB (AES-GCM) và hash HMAC-SHA256 (không lộ bản rõ).
- TC-CRM-04: Xung đột lợi ích khi trùng bên đối tụng vụ việc ACTIVE (201 + warnings[CONFLICT_OF_INTEREST]),
  thông báo cho Trưởng phòng, ghi audit CONFLICT_OF_INTEREST_WARNING.
- Tra cứu q không dấu/không hoa thường, phân trang meta.
- Phân quyền RBAC (ADMIN -> 403 FORBIDDEN_ROLE, ACCOUNTANT chỉ đọc, không xem tương tác).
- Bảo vệ CSRF cho các thao tác ghi (POST, PATCH).
- Need-to-know: Chi tiết khách hàng chỉ trả vụ việc người xem có quyền (scope progress).
- Dòng thời gian tương tác: mới nhất trước.
- Endpoint kiểm tra xung đột độc lập: POST /crm/conflict-check.
"""

import os
os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/12")
os.environ.setdefault("DATA_ENCRYPTION_MASTER_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")

import asyncio
import datetime
import hashlib
import hmac
import uuid
from typing import Any, Dict, List, Optional

import httpx
import psycopg
import pytest
import redis as redis_sync
from argon2 import PasswordHasher
from argon2.low_level import Type
from neo4j import GraphDatabase

from backend.app.core.config import settings
from backend.app.main import app

PASSWORD = "Asl@Secure2026"
TEST_HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4, type=Type.ID)


# ---------- HẠ TẦNG VÀ FIXTURE KIỂM THỬ ----------

@pytest.fixture(autouse=True)
def clean_redis():
    """Dùng Redis DB riêng số 12 theo brief; dọn dẹp trước và sau mỗi test."""
    r = redis_sync.Redis.from_url(os.environ["REDIS_URL"])
    try:
        r.flushdb()
    except Exception:
        pass
    yield
    try:
        r.flushdb()
    except Exception:
        pass


def db():
    return psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True)


def get_neo4j():
    return GraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD)
    )


def make_user(
    role: str = "ATTORNEY",
    *,
    is_executive: bool = False,
    department_id: Optional[str] = None,
    full_name: str = "Người Dùng Kiểm Thử",
    is_active: bool = True
) -> dict:
    email = f"tsk04-{uuid.uuid4().hex[:12]}@asllaw.vn"
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO users (email, password_hash, full_name, title, system_role,
                                      is_executive, department_id, totp_enabled, must_reset_password, is_active)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, false, false, %s) RETURNING id""",
                (email, TEST_HASHER.hash(PASSWORD), full_name, "Luật sư", role,
                 is_executive, department_id, is_active),
            )
            row = cur.fetchone()
    return {"id": str(row[0]), "email": email, "role": role}


def client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://testserver")


async def login(c: httpx.AsyncClient, email: str, password: str = PASSWORD) -> httpx.Response:
    # Cấp phiên bằng access token tự ký: ADMIN/MANAGER/ACCOUNTANT bắt buộc 2FA (DEC-02) nên không đăng nhập
    # bằng mật khẩu được; luồng đăng nhập đã có test riêng (test_auth, test_two_factor).
    import time as _time
    import jwt as _jwt
    from backend.app.core.config import settings as _settings
    with db() as conn:
        uid = str(conn.execute("SELECT id FROM users WHERE email = %s", (email,)).fetchone()[0])
    now = int(_time.time())
    token = _jwt.encode({"sub": uid, "jti": str(uuid.uuid4()), "iat": now, "exp": now + 1800, "typ": "access"},
                        _settings.SECRET_KEY, algorithm=_settings.JWT_ALGORITHM)
    c.cookies.set("access_token", token)
    c.cookies.set("csrf_token", "csrf-test-fixed")
    return httpx.Response(200, json={"success": True, "data": {}})


def csrf(c: httpx.AsyncClient) -> dict:
    return {"X-CSRF-Token": c.cookies.get("csrf_token") or ""}


def error_code(resp: httpx.Response) -> str:
    body = resp.json()
    assert body.get("success") is False, f"Mong đợi response thất bại nhưng nhận được: {body}"
    return body["error"]["code"]


def get_response_data(resp: httpx.Response) -> Any:
    body = resp.json()
    assert body.get("success") is True, f"Yêu cầu không thành công: {body}"
    return body.get("data")


def assert_no_plain_text(data: Any, plain_text: str):
    """Đảm bảo chuỗi nhạy cảm (như CCCD bản rõ) không xuất hiện ở bất kỳ trường nào trong response."""
    if isinstance(data, dict):
        for k, v in data.items():
            assert plain_text not in str(k), f"Chuỗi bản rõ xuất hiện trong key: {k}"
            assert_no_plain_text(v, plain_text)
    elif isinstance(data, list):
        for item in data:
            assert_no_plain_text(item, plain_text)
    elif isinstance(data, str):
        assert plain_text not in data, f"Chuỗi bản rõ xuất hiện trong dữ liệu text: {data}"


# ---------- TC-CRM-01: DOANH NGHIỆP, MST VÀ RÀNG BUỘC KIỂM TRÙNG ----------

@pytest.mark.asyncio
async def test_create_enterprise_client_success():
    """Tạo khách hàng doanh nghiệp thành công với MST 10 số hoặc 13 số, ghi audit CLIENT_CREATED."""
    attorney = make_user("ATTORNEY")
    rand_suffix = uuid.uuid4().hex[:6]
    mst = f"01{uuid.uuid4().int % 100000000:08d}"

    payload = {
        "client_type": "ENTERPRISE",
        "name": f"Công ty Cổ phần Công nghệ ASL {rand_suffix}",
        "tax_code": mst,
        "representative_name": "Phạm Minh Đức",
        "phone": "0912345678",
        "email": f"contact-{rand_suffix}@aslgate.vn",
        "address": "Tầng 5, 12 Duy Tân, Cầu Giấy, Hà Nội",
        "category_group": "NEW"
    }

    async with client() as c:
        await login(c, attorney["email"])
        resp = await c.post("/api/v1/crm/clients", json=payload, headers=csrf(c))

    assert resp.status_code == 201, resp.text
    data = get_response_data(resp)
    assert data["client_type"] == "ENTERPRISE"
    assert data["tax_code"] == mst
    assert data["name"] == payload["name"]
    client_id = data["id"]

    # Kiểm tra audit log CLIENT_CREATED
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT action, entity_name, entity_id FROM audit_logs
                   WHERE entity_id = %s AND action = 'CLIENT_CREATED'""",
                (str(client_id),)
            )
            audit_row = cur.fetchone()
            assert audit_row is not None, "Không tìm thấy bản ghi audit log CLIENT_CREATED"


@pytest.mark.asyncio
async def test_create_enterprise_client_13_digits_tax_code_success():
    """MST dạng chi nhánh 13 số khớp ^\\d{10}(-\\d{3})?$ được chấp nhận."""
    attorney = make_user("ATTORNEY")
    rand_suffix = uuid.uuid4().hex[:6]
    mst_13 = f"01{uuid.uuid4().int % 100000000:08d}-001"

    payload = {
        "client_type": "ENTERPRISE",
        "name": f"Chi nhánh Công ty ASL {rand_suffix}",
        "tax_code": mst_13,
        "phone": "0987654321",
        "address": "Số 1 Lê Duẩn, Quận 1, TP. Hồ Chí Minh"
    }

    async with client() as c:
        await login(c, attorney["email"])
        resp = await c.post("/api/v1/crm/clients", json=payload, headers=csrf(c))

    assert resp.status_code == 201, resp.text
    data = get_response_data(resp)
    assert data["tax_code"] == mst_13


@pytest.mark.asyncio
async def test_create_enterprise_duplicate_tax_code_409():
    """TC-CRM-01: 2 doanh nghiệp cùng MST -> bản thứ 2 nhận 409 DUPLICATE_TAX_CODE."""
    attorney = make_user("ATTORNEY")
    mst = f"01{uuid.uuid4().int % 100000000:08d}"

    payload_1 = {
        "client_type": "ENTERPRISE",
        "name": f"Công ty TNHH Đầu tiên {uuid.uuid4().hex[:4]}",
        "tax_code": mst,
        "phone": "0900000001",
        "address": "Hà Nội"
    }
    payload_2 = {
        "client_type": "ENTERPRISE",
        "name": f"Công ty TNHH Thứ hai {uuid.uuid4().hex[:4]}",
        "tax_code": mst,
        "phone": "0900000002",
        "address": "Đà Nẵng"
    }

    async with client() as c:
        await login(c, attorney["email"])
        resp1 = await c.post("/api/v1/crm/clients", json=payload_1, headers=csrf(c))
        assert resp1.status_code == 201, resp1.text

        resp2 = await c.post("/api/v1/crm/clients", json=payload_2, headers=csrf(c))
        assert resp2.status_code == 409, resp2.text
        assert error_code(resp2) == "DUPLICATE_TAX_CODE"


@pytest.mark.asyncio
async def test_create_enterprise_invalid_tax_code_422():
    """TC-CRM-01: Doanh nghiệp thiếu MST hoặc MST sai định dạng -> 422 VALIDATION_ERROR."""
    attorney = make_user("ATTORNEY")

    invalid_tax_codes = [
        "",                     # Rỗng
        "12345",                # Quá ngắn
        "010998877A",           # Chứa chữ cái
        "0109988776-1",         # Đuôi chỉ có 1 số
        "0109988776-1234",      # Đuôi có 4 số
        "010998877601",         # 12 số không dấu gạch
    ]

    async with client() as c:
        await login(c, attorney["email"])

        # Thiếu hẳn trường tax_code
        resp_missing = await c.post("/api/v1/crm/clients", json={
            "client_type": "ENTERPRISE",
            "name": f"Công ty Thiếu MST {uuid.uuid4().hex[:4]}",
            "phone": "0901234567",
            "address": "Hà Nội"
        }, headers=csrf(c))
        assert resp_missing.status_code == 422
        assert error_code(resp_missing) == "VALIDATION_ERROR"

        # Định dạng sai
        for bad_code in invalid_tax_codes:
            resp_bad = await c.post("/api/v1/crm/clients", json={
                "client_type": "ENTERPRISE",
                "name": f"Công ty MST Sai {uuid.uuid4().hex[:4]}",
                "tax_code": bad_code,
                "phone": "0901234567",
                "address": "Hà Nội"
            }, headers=csrf(c))
            assert resp_bad.status_code == 422, f"MST {bad_code} phải bị từ chối 422 nhưng nhận {resp_bad.status_code}"
            assert error_code(resp_bad) == "VALIDATION_ERROR"


# ---------- TC-CRM-03: CÁ NHÂN, CCCD MÃ HOÁ, MASK VÀ CHẶN TRÙNG ----------

@pytest.mark.asyncio
async def test_create_individual_client_success():
    """Tạo khách hàng cá nhân thành công với CCCD 12 số hoặc CMND 9 số."""
    attorney = make_user("ATTORNEY")
    cccd = f"079{uuid.uuid4().int % 1000000000:09d}"

    payload = {
        "client_type": "INDIVIDUAL",
        "name": "Nguyễn Văn Kiểm Thử",
        "identity_no": cccd,
        "phone": "0933333333",
        "address": "TP. Hồ Chí Minh"
    }

    async with client() as c:
        await login(c, attorney["email"])
        resp = await c.post("/api/v1/crm/clients", json=payload, headers=csrf(c))

    assert resp.status_code == 201, resp.text
    data = get_response_data(resp)
    assert data["client_type"] == "INDIVIDUAL"
    # Phải che CCCD trong phản hồi
    expected_masked = "********" + cccd[-4:]
    masked_returned = data.get("identity_no_masked") or data.get("identity_no")
    assert masked_returned == expected_masked
    assert_no_plain_text(data, cccd)


@pytest.mark.asyncio
async def test_create_individual_duplicate_identity_no_normalized_409():
    """TC-CRM-03: 2 cá nhân cùng CCCD (lần 2 có khoảng trắng/dấu chấm) -> 409 DUPLICATE_IDENTITY_NO."""
    attorney = make_user("ATTORNEY")
    raw_digits = f"079{uuid.uuid4().int % 1000000000:09d}"
    formatted_dots = f"{raw_digits[:3]}.{raw_digits[3:6]}.{raw_digits[6:9]}.{raw_digits[9:]}"
    formatted_spaces = f"{raw_digits[:3]} {raw_digits[3:6]} {raw_digits[6:12]}"

    async with client() as c:
        await login(c, attorney["email"])

        # Lần 1: gửi chuỗi số chuẩn
        resp1 = await c.post("/api/v1/crm/clients", json={
            "client_type": "INDIVIDUAL",
            "name": "Trần Văn A",
            "identity_no": raw_digits,
            "phone": "0911111111",
            "address": "Hà Nội"
        }, headers=csrf(c))
        assert resp1.status_code == 201, resp1.text

        # Lần 2: gửi cùng số nhưng có dấu chấm
        resp2 = await c.post("/api/v1/crm/clients", json={
            "client_type": "INDIVIDUAL",
            "name": "Trần Văn B (Trùng dấu chấm)",
            "identity_no": formatted_dots,
            "phone": "0922222222",
            "address": "Hà Nội"
        }, headers=csrf(c))
        assert resp2.status_code == 409, resp2.text
        assert error_code(resp2) == "DUPLICATE_IDENTITY_NO"

        # Lần 3: gửi cùng số nhưng có khoảng trắng
        resp3 = await c.post("/api/v1/crm/clients", json={
            "client_type": "INDIVIDUAL",
            "name": "Trần Văn C (Trùng khoảng trắng)",
            "identity_no": formatted_spaces,
            "phone": "0933333333",
            "address": "Hà Nội"
        }, headers=csrf(c))
        assert resp3.status_code == 409, resp3.text
        assert error_code(resp3) == "DUPLICATE_IDENTITY_NO"


@pytest.mark.asyncio
async def test_create_individual_invalid_identity_no_422():
    """Cá nhân thiếu identity_no hoặc không đủ 9/12 số -> 422 VALIDATION_ERROR."""
    attorney = make_user("ATTORNEY")

    invalid_identities = [
        "",                     # Rỗng
        "12345678",             # 8 số (không phải 9 hoặc 12)
        "1234567890",           # 10 số
        "12345678901",          # 11 số
        "1234567890123",        # 13 số
        "07909012345A",         # Chứa ký tự chữ cái
    ]

    async with client() as c:
        await login(c, attorney["email"])

        # Thiếu hẳn trường identity_no
        resp_missing = await c.post("/api/v1/crm/clients", json={
            "client_type": "INDIVIDUAL",
            "name": "Cá Nhân Thiếu CCCD",
            "phone": "0900000000",
            "address": "Hà Nội"
        }, headers=csrf(c))
        assert resp_missing.status_code == 422
        assert error_code(resp_missing) == "VALIDATION_ERROR"

        for bad_id in invalid_identities:
            resp_bad = await c.post("/api/v1/crm/clients", json={
                "client_type": "INDIVIDUAL",
                "name": "Cá Nhân CCCD Sai",
                "identity_no": bad_id,
                "phone": "0900000000",
                "address": "Hà Nội"
            }, headers=csrf(c))
            assert resp_bad.status_code == 422, f"CCCD '{bad_id}' phải bị 422 nhưng nhận {resp_bad.status_code}"
            assert error_code(resp_bad) == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_individual_security_storage_and_masking():
    """TC-CRM-03: Kiểm tra DB không lưu CCCD bản rõ, identity_no_hash là HMAC, không lộ ở mọi phản hồi và audit."""
    attorney = make_user("ATTORNEY")
    cccd = f"079{uuid.uuid4().int % 1000000000:09d}"

    async with client() as c:
        await login(c, attorney["email"])
        resp = await c.post("/api/v1/crm/clients", json={
            "client_type": "INDIVIDUAL",
            "name": "Lê Hoàng Bảo Mật",
            "identity_no": cccd,
            "phone": "0944444444",
            "address": "TP. Cần Thơ"
        }, headers=csrf(c))
        assert resp.status_code == 201
        client_data = get_response_data(resp)
        client_id = client_data["id"]

        # Gọi GET /crm/clients/{id}
        get_resp = await c.get(f"/api/v1/crm/clients/{client_id}")
        assert get_resp.status_code == 200
        get_data = get_response_data(get_resp)

        # GET trả ********1234
        expected_mask = "********" + cccd[-4:]
        masked_val = get_data.get("identity_no_masked") or get_data.get("identity_no")
        assert masked_val == expected_mask
        assert_no_plain_text(get_data, cccd)

    # 1. Trực tiếp truy vấn PostgreSQL để kiểm tra cột bảo mật
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT identity_no_enc, identity_no_hash FROM clients WHERE id = %s""",
                (client_id,)
            )
            row = cur.fetchone()
            assert row is not None
            identity_no_enc, identity_no_hash = row

            # DB: identity_no_enc không chứa chuỗi số bản rõ
            assert identity_no_enc is not None
            enc_bytes = bytes(identity_no_enc)
            assert cccd.encode() not in enc_bytes, "identity_no_enc chứa chuỗi bản rõ!"

            # DB: identity_no_hash không phải SHA-256 trần của số (phải dùng HMAC-SHA256 với khoá)
            assert identity_no_hash is not None
            bare_sha256 = hashlib.sha256(cccd.encode()).hexdigest()
            assert identity_no_hash.strip().lower() != bare_sha256.lower(), (
                "identity_no_hash là SHA-256 trần! Bắt buộc phải là HMAC-SHA256 dẫn xuất từ khoá bí mật."
            )

            # 2. Kiểm tra nhật ký kiểm toán audit_logs: không chứa CCCD bản rõ trong before/after state
            cur.execute(
                """SELECT before_state, after_state FROM audit_logs WHERE entity_id = %s""",
                (str(client_id),)
            )
            for b_state, a_state in cur.fetchall():
                assert_no_plain_text(b_state, cccd)
                assert_no_plain_text(a_state, cccd)


# ---------- KHÁCH HÀNG NƯỚC NGOÀI (FOREIGN) ----------

@pytest.mark.asyncio
async def test_create_foreign_client_success():
    """Khách hàng nước ngoài (FOREIGN) không bắt buộc cả MST lẫn CCCD."""
    attorney = make_user("ATTORNEY")
    rand_suffix = uuid.uuid4().hex[:6]

    payload = {
        "client_type": "FOREIGN",
        "name": f"Global Legal Partner Ltd {rand_suffix}",
        "representative_name": "Johnathan Smith",
        "phone": "+14155552671",
        "email": f"partner-{rand_suffix}@globallegal.com",
        "address": "100 Montgomery St, San Francisco, CA, USA",
        "category_group": "STRATEGIC"
    }

    async with client() as c:
        await login(c, attorney["email"])
        resp = await c.post("/api/v1/crm/clients", json=payload, headers=csrf(c))

    assert resp.status_code == 201, resp.text
    data = get_response_data(resp)
    assert data["client_type"] == "FOREIGN"
    assert data["name"] == payload["name"]
    assert data.get("tax_code") is None


# ---------- TC-CRM-04: CẢNH BÁO XUNG ĐỘT LỢI ÍCH, THÔNG BÁO & AUDIT ----------

@pytest.mark.asyncio
async def test_conflict_of_interest_warning_notifications_and_audit():
    """TC-CRM-04: Vụ việc ACTIVE có bên đối tụng 'Công ty TNHH Minh Phát'; tạo khách hàng 'CÔNG TY TNHH MINH PHÁT'
    -> 201 + warnings[CONFLICT_OF_INTEREST] có đúng case_code; có notifications cho Trưởng phòng; có audit.
    """
    attorney = make_user("ATTORNEY")
    rand_suffix = uuid.uuid4().hex[:6]
    opposing_name = f"Công ty TNHH Minh Phát {rand_suffix}"
    normalized_opposing = f"cong ty tnhh minh phat {rand_suffix}"
    case_code = f"ASL-2026-TM-{uuid.uuid4().int % 9000 + 1000}"

    case_id = str(uuid.uuid4())
    dept_id = None
    leader_user_id = None

    # Thiết lập dữ liệu vụ việc và phòng ban trong PostgreSQL
    with db() as conn:
        with conn.cursor() as cur:
            # Lấy phòng ban DEPT_IP đã seed
            cur.execute("SELECT id FROM departments WHERE code = 'DEPT_IP'")
            dept_row = cur.fetchone()
            assert dept_row is not None, "DEPT_IP phải có sẵn từ seed"
            dept_id = dept_row[0]

            # Lấy Trưởng phòng DEPT_IP
            cur.execute("SELECT user_id FROM department_leaders WHERE department_id = %s LIMIT 1", (dept_id,))
            leader_row = cur.fetchone()
            assert leader_row is not None, "Phải có Trưởng phòng DEPT_IP"
            leader_user_id = leader_row[0]

            # Lấy matter_type TM
            cur.execute("SELECT id FROM matter_types WHERE code = 'TM'")
            mt_row = cur.fetchone()
            assert mt_row is not None
            matter_type_id = mt_row[0]

            # Tạo khách hàng giả lập cho vụ việc đối tụng
            cur.execute("""
                INSERT INTO clients (client_type, name, normalized_name, tax_code, phone, address)
                VALUES ('ENTERPRISE', 'Thân chủ đối tụng', 'than chu doi tung', %s, '0901112223', 'Hà Nội')
                RETURNING id
            """, (f"01{uuid.uuid4().int % 100000000:08d}",))
            existing_client_id = cur.fetchone()[0]

            # Tạo vụ việc ACTIVE trong PostgreSQL
            cur.execute("""
                INSERT INTO cases (id, case_code, title, client_id, department_id, matter_type_id,
                                  workflow_mode, contract_value, status)
                VALUES (%s, %s, %s, %s, %s, %s, 'STRICT', 100000000, 'ACTIVE')
            """, (case_id, case_code, f"Vụ việc kiểm thử xung đột {rand_suffix}",
                  existing_client_id, dept_id, matter_type_id))

            # Ghi nhận bên đối tụng vào case_parties
            cur.execute("""
                INSERT INTO case_parties (case_id, party_role, name, normalized_name)
                VALUES (%s, 'OPPOSING', %s, %s)
            """, (case_id, opposing_name, normalized_opposing))

    # Đồng bộ node và quan hệ sang Neo4j cho guard check_conflict_of_interest
    neo_driver = get_neo4j()
    db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
    kwargs = {"database": db_name} if db_name else {}
    with neo_driver.session(**kwargs) as session:
        session.run("""
            MERGE (c:Case {id: $case_id})
            SET c.status = 'ACTIVE', c.case_code = $case_code
            MERGE (p:Party {name: $opposing_name, normalized_name: $normalized_opposing})
            MERGE (p)-[:PARTY_IN {party_role: 'OPPOSING'}]->(c)
        """, case_id=case_id, case_code=case_code, opposing_name=opposing_name,
             normalized_opposing=normalized_opposing)
    neo_driver.close()

    # Tạo khách hàng mới có tên trùng (viết hoa toàn bộ 'CÔNG TY TNHH MINH PHÁT...')
    client_name_input = f"CÔNG TY TNHH MINH PHÁT {rand_suffix.upper()}"
    new_mst = f"01{uuid.uuid4().int % 100000000:08d}"

    async with client() as c:
        await login(c, attorney["email"])
        resp = await c.post("/api/v1/crm/clients", json={
            "client_type": "ENTERPRISE",
            "name": client_name_input,
            "tax_code": new_mst,
            "phone": "0999999999",
            "address": "TP. Hồ Chí Minh"
        }, headers=csrf(c))

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body.get("success") is True
    created_client_id = body["data"]["id"]

    # 1. warnings[CONFLICT_OF_INTEREST] có đúng case_code
    warnings = body.get("warnings") or body["data"].get("warnings") or []
    assert len(warnings) > 0, f"Không có cảnh báo warnings nào trong response: {body}"
    conflict_warning = next((w for w in warnings if w.get("code") == "CONFLICT_OF_INTEREST"), None)
    assert conflict_warning is not None, f"Không tìm thấy warning CONFLICT_OF_INTEREST trong: {warnings}"
    assert case_code in conflict_warning.get("case_codes", []), (
        f"case_codes phải chứa mã vụ việc {case_code}, nhận được: {conflict_warning.get('case_codes')}"
    )

    # 2. Ghi 1 dòng notifications cho mỗi Trưởng phòng của phòng ban vụ việc đó
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, title, body, user_id FROM notifications
                WHERE user_id = %s ORDER BY created_at DESC LIMIT 5
            """, (leader_user_id,))
            notifs = cur.fetchall()
            assert len(notifs) > 0, f"Không tìm thấy notification cho Trưởng phòng {leader_user_id}"
            found_notif = any(
                (case_code in n[1] or case_code in n[2] or "xung đột" in n[1].lower() or "xung đột" in n[2].lower())
                for n in notifs
            )
            assert found_notif, f"Thông báo không chứa thông tin về vụ việc/xung đột: {notifs}"

            # 3. Ghi audit CONFLICT_OF_INTEREST_WARNING
            cur.execute("""
                SELECT action, entity_id FROM audit_logs
                WHERE entity_id = %s AND action = 'CONFLICT_OF_INTEREST_WARNING'
            """, (str(created_client_id),))
            audit_warning = cur.fetchone()
            assert audit_warning is not None, "Không tìm thấy audit log CONFLICT_OF_INTEREST_WARNING"


@pytest.mark.asyncio
async def test_standalone_conflict_check_endpoint():
    """POST /crm/conflict-check kiểm tra xung đột mà không tạo dữ liệu."""
    attorney = make_user("ATTORNEY")
    rand_suffix = uuid.uuid4().hex[:6]
    opposing_name = f"Doanh Nghiệp Đối Tụng {rand_suffix}"
    normalized_opposing = f"doanh nghiep doi tung {rand_suffix}"
    case_code = f"ASL-2026-TM-{uuid.uuid4().int % 9000 + 1000}"
    case_id = str(uuid.uuid4())

    neo_driver = get_neo4j()
    db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
    kwargs = {"database": db_name} if db_name else {}
    with neo_driver.session(**kwargs) as session:
        session.run("""
            MERGE (c:Case {id: $case_id})
            SET c.status = 'ACTIVE', c.case_code = $case_code
            MERGE (p:Party {name: $opposing_name, normalized_name: $normalized_opposing})
            MERGE (p)-[:PARTY_IN {party_role: 'OPPOSING'}]->(c)
        """, case_id=case_id, case_code=case_code, opposing_name=opposing_name,
             normalized_opposing=normalized_opposing)
    neo_driver.close()

    async with client() as c:
        await login(c, attorney["email"])
        resp = await c.post("/api/v1/crm/conflict-check", json={
            "name": opposing_name.upper()
        }, headers=csrf(c))

    assert resp.status_code == 200, resp.text
    data = get_response_data(resp)
    conflicts = data.get("conflicts", [])
    assert len(conflicts) > 0
    matched = any(c.get("case_code") == case_code for c in conflicts)
    assert matched, f"Không tìm thấy case_code {case_code} trong conflicts: {conflicts}"

    # Đảm bảo không tạo bản ghi nào trong bảng clients
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM clients WHERE normalized_name = %s", (normalized_opposing,))
            count = cur.fetchone()[0]
            assert count == 0, "Endpoint conflict-check không được tạo dữ liệu trong clients"


# ---------- TÌM KIẾM KHÔNG DẤU, KHÔNG HOA THƯỜNG & PHÂN TRANG META ----------

@pytest.mark.asyncio
async def test_search_clients_unaccented_and_case_insensitive():
    """GET /crm/clients?q= tìm theo tên (không phân biệt hoa thường, không dấu) hoặc MST."""
    attorney = make_user("ATTORNEY")
    rand_prefix = f"tsk04-{uuid.uuid4().hex[:6]}"
    name1 = f"{rand_prefix} Nguyễn Văn Tuấn Khang"
    name2 = f"{rand_prefix} Trần Đình Trọng"
    mst1 = f"01{uuid.uuid4().int % 100000000:08d}"
    mst2 = f"01{uuid.uuid4().int % 100000000:08d}"

    async with client() as c:
        await login(c, attorney["email"])
        # Tạo 2 khách hàng
        await c.post("/api/v1/crm/clients", json={
            "client_type": "ENTERPRISE",
            "name": name1,
            "tax_code": mst1,
            "phone": "0911112222",
            "address": "Hà Nội",
            "category_group": "VIP"
        }, headers=csrf(c))

        await c.post("/api/v1/crm/clients", json={
            "client_type": "ENTERPRISE",
            "name": name2,
            "tax_code": mst2,
            "phone": "0911113333",
            "address": "Hà Nội",
            "category_group": "POTENTIAL"
        }, headers=csrf(c))

        # 1. Tìm không dấu, chữ thường: 'nguyen van tuan'
        resp_q1 = await c.get(f"/api/v1/crm/clients?q={rand_prefix} nguyen van tuan")
        assert resp_q1.status_code == 200
        items1 = get_response_data(resp_q1)
        if isinstance(items1, dict) and "items" in items1:
            items1 = items1["items"]
        assert any(name1 in item["name"] for item in items1)
        assert not any(name2 in item["name"] for item in items1)

        # 2. Tìm chữ HOA, có dấu: 'TRẦN ĐÌNH'
        resp_q2 = await c.get(f"/api/v1/crm/clients?q={rand_prefix.upper()} TRẦN ĐÌNH")
        assert resp_q2.status_code == 200
        items2 = get_response_data(resp_q2)
        if isinstance(items2, dict) and "items" in items2:
            items2 = items2["items"]
        assert any(name2 in item["name"] for item in items2)

        # 3. Tìm theo MST
        resp_mst = await c.get(f"/api/v1/crm/clients?q={mst1}")
        assert resp_mst.status_code == 200
        items_mst = get_response_data(resp_mst)
        if isinstance(items_mst, dict) and "items" in items_mst:
            items_mst = items_mst["items"]
        assert any(item["tax_code"] == mst1 for item in items_mst)

        # 4. Lọc theo category_group
        resp_cat = await c.get(f"/api/v1/crm/clients?q={rand_prefix}&category_group=VIP")
        assert resp_cat.status_code == 200
        items_cat = get_response_data(resp_cat)
        if isinstance(items_cat, dict) and "items" in items_cat:
            items_cat = items_cat["items"]
        assert all(item["category_group"] == "VIP" for item in items_cat)


@pytest.mark.asyncio
async def test_clients_pagination_meta():
    """Phân trang meta có page, limit, total_records, total_pages."""
    attorney = make_user("ATTORNEY")
    async with client() as c:
        await login(c, attorney["email"])
        resp = await c.get("/api/v1/crm/clients?page=1&limit=2")
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("success") is True

        meta = body.get("meta") or (body.get("data", {}) if isinstance(body.get("data"), dict) else {}).get("meta")
        assert meta is not None, f"Không tìm thấy meta phân trang: {body}"
        assert meta["page"] == 1
        assert meta["limit"] == 2
        assert "total_records" in meta
        assert "total_pages" in meta


# ---------- PHÂN QUYỀN RBAC VÀ BẢO VỆ CSRF ----------

@pytest.mark.asyncio
async def test_rbac_admin_forbidden_403():
    """ADMIN bị từ chối 403 FORBIDDEN_ROLE cả khi đọc và ghi (Quản trị viên không đọc hồ sơ thân chủ)."""
    admin = make_user("ADMIN")

    async with client() as c:
        await login(c, admin["email"])

        # Đọc danh sách
        r_list = await c.get("/api/v1/crm/clients")
        assert r_list.status_code == 403
        assert error_code(r_list) == "FORBIDDEN_ROLE"

        # Tạo mới
        r_post = await c.post("/api/v1/crm/clients", json={
            "client_type": "FOREIGN",
            "name": "Khách Test Admin",
            "phone": "0911223344",
            "address": "USA"
        }, headers=csrf(c))
        assert r_post.status_code == 403
        assert error_code(r_post) == "FORBIDDEN_ROLE"

        # Đọc chi tiết
        dummy_id = str(uuid.uuid4())
        r_detail = await c.get(f"/api/v1/crm/clients/{dummy_id}")
        assert r_detail.status_code == 403
        assert error_code(r_detail) == "FORBIDDEN_ROLE"


@pytest.mark.asyncio
async def test_rbac_accountant_read_only_and_forbidden_write():
    """ACCOUNTANT đọc được danh sách/chi tiết nhưng bị từ chối 403 khi ghi hoặc xem interactions."""
    accountant = make_user("ACCOUNTANT")
    attorney = make_user("ATTORNEY")

    # Tạo trước 1 khách hàng bằng quyền ATTORNEY
    mst = f"01{uuid.uuid4().int % 100000000:08d}"
    async with client() as c_att:
        await login(c_att, attorney["email"])
        r_create = await c_att.post("/api/v1/crm/clients", json={
            "client_type": "ENTERPRISE",
            "name": "Công ty Kiểm thử Kế toán",
            "tax_code": mst,
            "phone": "0900001122",
            "address": "Hà Nội"
        }, headers=csrf(c_att))
        assert r_create.status_code == 201
        client_id = get_response_data(r_create)["id"]

    # Đăng nhập bằng tài khoản Kế toán
    async with client() as c_acc:
        await login(c_acc, accountant["email"])

        # 1. Kế toán ĐỌC danh sách -> 200 OK
        r_list = await c_acc.get("/api/v1/crm/clients")
        assert r_list.status_code == 200

        # 2. Kế toán ĐỌC chi tiết -> 200 OK
        r_detail = await c_acc.get(f"/api/v1/crm/clients/{client_id}")
        assert r_detail.status_code == 200

        # 3. Kế toán GHI tạo mới -> 403 FORBIDDEN_ROLE
        r_post = await c_acc.post("/api/v1/crm/clients", json={
            "client_type": "FOREIGN",
            "name": "Công ty Nước Ngoài Do Kế Toán Tạo",
            "phone": "0900001133",
            "address": "Singapore"
        }, headers=csrf(c_acc))
        assert r_post.status_code == 403
        assert error_code(r_post) == "FORBIDDEN_ROLE"

        # 4. Kế toán SỬA PATCH -> 403 FORBIDDEN_ROLE
        r_patch = await c_acc.patch(f"/api/v1/crm/clients/{client_id}", json={
            "phone": "0900009999"
        }, headers=csrf(c_acc))
        assert r_patch.status_code == 403
        assert error_code(r_patch) == "FORBIDDEN_ROLE"

        # 5. Kế toán xem tương tác interactions -> 403 FORBIDDEN_ROLE
        r_interactions = await c_acc.get(f"/api/v1/crm/clients/{client_id}/interactions")
        assert r_interactions.status_code == 403
        assert error_code(r_interactions) == "FORBIDDEN_ROLE"


@pytest.mark.asyncio
async def test_csrf_token_required_on_writes():
    """Thiếu hoặc sai X-CSRF-Token ở route ghi -> 403 CSRF_INVALID."""
    attorney = make_user("ATTORNEY")

    async with client() as c:
        await login(c, attorney["email"])

        # POST không có header X-CSRF-Token
        r_no_csrf = await c.post("/api/v1/crm/clients", json={
            "client_type": "FOREIGN",
            "name": "Khách Không Header CSRF",
            "phone": "0911223344",
            "address": "USA"
        })
        assert r_no_csrf.status_code == 403
        assert error_code(r_no_csrf) == "CSRF_INVALID"

        # POST với token sai lệch
        r_bad_csrf = await c.post("/api/v1/crm/clients", json={
            "client_type": "FOREIGN",
            "name": "Khách CSRF Sai",
            "phone": "0911223344",
            "address": "USA"
        }, headers={"X-CSRF-Token": "invalid-token-12345"})
        assert r_bad_csrf.status_code == 403
        assert error_code(r_bad_csrf) == "CSRF_INVALID"


# ---------- NEED-TO-KNOW: DANH SÁCH VỤ VIỆC TRONG CHI TIẾT KHÁCH HÀNG ----------

@pytest.mark.asyncio
async def test_client_detail_cases_filtered_by_need_to_know():
    """GET /crm/clients/{id}: danh sách cases chỉ trả vụ việc người xem vượt qua verify_need_to_know
    (phạm vi progress); luật sư không được phân công không thấy vụ việc đó.
    """
    attorney_assigned = make_user("ATTORNEY")
    attorney_unassigned = make_user("ATTORNEY")

    rand_suffix = uuid.uuid4().hex[:6]
    case_code_assigned = f"ASL-2026-TM-{uuid.uuid4().int % 9000 + 1000}"
    case_code_secret = f"ASL-2026-TM-{uuid.uuid4().int % 9000 + 1000}"
    case_id_assigned = str(uuid.uuid4())
    case_id_secret = str(uuid.uuid4())

    client_id = str(uuid.uuid4())

    # Thiết lập trong DB
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM departments WHERE code = 'DEPT_IP'")
            dept_id = cur.fetchone()[0]
            cur.execute("SELECT id FROM matter_types WHERE code = 'TM'")
            matter_type_id = cur.fetchone()[0]

            # Tạo khách hàng
            cur.execute("""
                INSERT INTO clients (id, client_type, name, normalized_name, phone, address)
                VALUES (%s, 'FOREIGN', %s, %s, '0988776655', 'Tokyo, Japan')
            """, (client_id, f"Client With Cases {rand_suffix}", f"client with cases {rand_suffix}"))

            # Tạo 2 vụ việc
            cur.execute("""
                INSERT INTO cases (id, case_code, title, client_id, department_id, matter_type_id,
                                  workflow_mode, contract_value, status)
                VALUES (%s, %s, 'Vụ việc được gán', %s, %s, %s, 'STRICT', 50000000, 'ACTIVE')
            """, (case_id_assigned, case_code_assigned, client_id, dept_id, matter_type_id))

            cur.execute("""
                INSERT INTO cases (id, case_code, title, client_id, department_id, matter_type_id,
                                  workflow_mode, contract_value, status)
                VALUES (%s, %s, 'Vụ việc bí mật', %s, %s, %s, 'STRICT', 80000000, 'ACTIVE')
            """, (case_id_secret, case_code_secret, client_id, dept_id, matter_type_id))

            # Phân công attorney_assigned vào case_assigned trong PostgreSQL
            cur.execute("""
                INSERT INTO case_assignments (case_id, user_id, role_in_case)
                VALUES (%s, %s, 'EXECUTOR')
            """, (case_id_assigned, attorney_assigned["id"]))

    # Đồng bộ sang Neo4j cho facts query (ASSIGNED_TO)
    neo_driver = get_neo4j()
    db_name = settings.NEO4J_DATABASE if settings.NEO4J_DATABASE and settings.NEO4J_DATABASE != "neo4j" else None
    kwargs = {"database": db_name} if db_name else {}
    with neo_driver.session(**kwargs) as session:
        session.run("""
            MERGE (u:User {id: $user_id}) SET u.system_role = 'ATTORNEY', u.is_active = true
            MERGE (c1:Case {id: $case1_id}) SET c1.case_code = $c1_code
            MERGE (c2:Case {id: $case2_id}) SET c2.case_code = $c2_code
            MERGE (u)-[:ASSIGNED_TO {role: 'EXECUTOR'}]->(c1)
        """, user_id=attorney_assigned["id"], case1_id=case_id_assigned, c1_code=case_code_assigned,
             case2_id=case_id_secret, c2_code=case_code_secret)
        # Attorney unassigned cũng có node trong Neo4j nhưng không có cạnh
        session.run("""
            MERGE (u:User {id: $user_id}) SET u.system_role = 'ATTORNEY', u.is_active = true
        """, user_id=attorney_unassigned["id"])
    neo_driver.close()

    # 1. Luật sư được phân công: chỉ thấy vụ việc được phân công
    async with client() as c1:
        await login(c1, attorney_assigned["email"])
        resp1 = await c1.get(f"/api/v1/crm/clients/{client_id}")
        assert resp1.status_code == 200
        data1 = get_response_data(resp1)
        cases_returned1 = data1.get("cases", [])
        assert any(c["case_code"] == case_code_assigned for c in cases_returned1)
        assert not any(c["case_code"] == case_code_secret for c in cases_returned1), (
            "Luật sư không được phân công vụ việc bí mật nhưng lại thấy trong cases list!"
        )

    # 2. Luật sư không được phân công vụ nào: nhận cases: []
    async with client() as c2:
        await login(c2, attorney_unassigned["email"])
        resp2 = await c2.get(f"/api/v1/crm/clients/{client_id}")
        assert resp2.status_code == 200
        data2 = get_response_data(resp2)
        cases_returned2 = data2.get("cases", [])
        assert cases_returned2 == [], f"Không có quyền nhưng cases không rỗng: {cases_returned2}"


# ---------- CẬP NHẬT THÔNG TIN KHÁCH HÀNG (PATCH) & AUDIT CLIENT_UPDATED ----------

@pytest.mark.asyncio
async def test_patch_client_and_audit():
    """PATCH /crm/clients/{id}: cập nhật thông tin liên hệ, nhóm, kiểm trùng và audit CLIENT_UPDATED."""
    attorney = make_user("ATTORNEY")
    rand_suffix = uuid.uuid4().hex[:6]
    old_mst = f"01{uuid.uuid4().int % 100000000:08d}"
    new_mst = f"01{uuid.uuid4().int % 100000000:08d}"

    async with client() as c:
        await login(c, attorney["email"])
        # Tạo khách hàng ban đầu
        r_create = await c.post("/api/v1/crm/clients", json={
            "client_type": "ENTERPRISE",
            "name": f"Công ty Trước Khi Sửa {rand_suffix}",
            "tax_code": old_mst,
            "phone": "0911222333",
            "address": "Số 1 Cũ, Hà Nội",
            "category_group": "NEW"
        }, headers=csrf(c))
        assert r_create.status_code == 201
        client_id = get_response_data(r_create)["id"]

        # Cập nhật thông tin liên hệ và nhóm sang VIP
        r_patch = await c.patch(f"/api/v1/crm/clients/{client_id}", json={
            "phone": "0988999888",
            "address": "Số 2 Mới, Hà Nội",
            "category_group": "VIP",
            "tax_code": new_mst
        }, headers=csrf(c))
        assert r_patch.status_code == 200, r_patch.text
        data_updated = get_response_data(r_patch)
        assert data_updated["phone"] == "0988999888"
        assert data_updated["category_group"] == "VIP"
        assert data_updated["tax_code"] == new_mst

    # Kiểm tra audit log CLIENT_UPDATED
    with db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT action, before_state, after_state FROM audit_logs
                WHERE entity_id = %s AND action = 'CLIENT_UPDATED'
                ORDER BY created_at DESC LIMIT 1
            """, (str(client_id),))
            row = cur.fetchone()
            assert row is not None, "Không tìm thấy audit log CLIENT_UPDATED"
            action, b_state, a_state = row
            assert action == "CLIENT_UPDATED"


@pytest.mark.asyncio
async def test_patch_client_duplicate_tax_code_409():
    """PATCH đổi MST sang MST đã có của doanh nghiệp khác -> 409 DUPLICATE_TAX_CODE."""
    attorney = make_user("ATTORNEY")
    mst_taken = f"01{uuid.uuid4().int % 100000000:08d}"
    mst_client = f"01{uuid.uuid4().int % 100000000:08d}"

    async with client() as c:
        await login(c, attorney["email"])

        # Khách 1 giữ mst_taken
        await c.post("/api/v1/crm/clients", json={
            "client_type": "ENTERPRISE",
            "name": "Công ty Giữ MST",
            "tax_code": mst_taken,
            "phone": "0900000001",
            "address": "Hà Nội"
        }, headers=csrf(c))

        # Khách 2 ban đầu giữ mst_client
        r2 = await c.post("/api/v1/crm/clients", json={
            "client_type": "ENTERPRISE",
            "name": "Công ty Muốn Đổi MST",
            "tax_code": mst_client,
            "phone": "0900000002",
            "address": "Hà Nội"
        }, headers=csrf(c))
        client2_id = get_response_data(r2)["id"]

        # Thử đổi MST của khách 2 thành mst_taken -> 409
        r_dup = await c.patch(f"/api/v1/crm/clients/{client2_id}", json={
            "tax_code": mst_taken
        }, headers=csrf(c))
        assert r_dup.status_code == 409
        assert error_code(r_dup) == "DUPLICATE_TAX_CODE"


# ---------- DÒNG THỜI GIAN TƯƠNG TÁC (INTERACTIONS) ----------

@pytest.mark.asyncio
async def test_client_interactions_crud_and_ordering():
    """GET/POST /crm/clients/{id}/interactions: thêm và liệt kê mới nhất trước."""
    attorney = make_user("ATTORNEY")

    async with client() as c:
        await login(c, attorney["email"])

        # Tạo khách hàng
        r_create = await c.post("/api/v1/crm/clients", json={
            "client_type": "FOREIGN",
            "name": f"Khách Hàng Tương Tác {uuid.uuid4().hex[:4]}",
            "phone": "0900999888",
            "address": "Singapore"
        }, headers=csrf(c))
        client_id = get_response_data(r_create)["id"]

        t_earlier = "2026-10-01T08:00:00Z"
        t_later = "2026-10-15T14:30:00Z"

        # 1. Thêm tương tác 1 (thời gian trước)
        r_int1 = await c.post(f"/api/v1/crm/clients/{client_id}/interactions", json={
            "kind": "CALL",
            "summary": "Cuộc gọi điện thoại tư vấn bước đầu",
            "occurred_at": t_earlier
        }, headers=csrf(c))
        assert r_int1.status_code == 201, r_int1.text

        # 2. Thêm tương tác 2 (thời gian sau)
        r_int2 = await c.post(f"/api/v1/crm/clients/{client_id}/interactions", json={
            "kind": "MEETING",
            "summary": "Gặp mặt trực tiếp ký kết hợp đồng",
            "occurred_at": t_later
        }, headers=csrf(c))
        assert r_int2.status_code == 201, r_int2.text

        # 3. Lấy danh sách tương tác
        r_get = await c.get(f"/api/v1/crm/clients/{client_id}/interactions")
        assert r_get.status_code == 200
        interactions = get_response_data(r_get)
        assert len(interactions) >= 2

        # Kiểm tra thứ tự mới nhất trước
        assert interactions[0]["summary"] == "Gặp mặt trực tiếp ký kết hợp đồng"
        assert interactions[1]["summary"] == "Cuộc gọi điện thoại tư vấn bước đầu"
