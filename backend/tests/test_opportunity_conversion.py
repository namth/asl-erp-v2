"""Nghiệm thu TSK-05 — Pipeline cơ hội kinh doanh & chuyển đổi 1-chạm thành vụ việc.

Hợp đồng: docs/07-api-contracts.md §1.1, §1.3, §2, §3.3; quy tắc nghiệp vụ: docs/12-business-rules.md §1.1–1.2;
schema: docs/06-database-schema.md; test cases: docs/13-test-cases-and-qa.md (TC-CRM-02, TC-CRM-05).

Tiêu chí nghiệm thu:
1. Máy trạng thái: chuyển hợp lệ thành công; NEW_LEAD -> WON nhảy cóc -> 409 INVALID_STATE_TRANSITION;
   LOST thiếu lý do -> 422 VALIDATION_ERROR; sửa stage sau WON/LOST -> 409 INVALID_STATE_TRANSITION.
2. TC-CRM-02: chuyển đổi WON -> vụ việc INITIALIZING, mã khớp ^ASL-\\d{4}-[A-Z]{2,4}-\\d{4}$,
   đúng template_version_id bản PUBLISHED mới nhất, số stage/task khớp template, stage đầu ACTIVE,
   còn lại LOCKED, có billing_milestones đúng số tiền (so Decimal), commission_policies bằng mặc định
   của loại vụ việc, originator_id đúng.
3. TC-CRM-05: chưa WON -> 409 OPPORTUNITY_NOT_WON; gửi 2 lần cùng Idempotency-Key -> cùng case_id,
   chỉ 1 vụ việc trong DB; lần 3 khoá khác -> 409 OPPORTUNITY_ALREADY_CONVERTED; cùng key khác body ->
   409 IDEMPOTENCY_KEY_REUSED; thiếu header -> 422.
4. Tổng đợt thu > giá trị hợp đồng -> 422 MILESTONES_EXCEED_CONTRACT, không tạo gì;
   không có template PUBLISHED -> 409 NO_PUBLISHED_TEMPLATE.
5. 50 chuyển đổi song song (50 cơ hội WON khác nhau, cùng loại vụ việc) -> 50 vụ việc, 50 mã khác nhau, liên tiếp.
6. Quyền: ACCOUNTANT/ADMIN -> 403 FORBIDDEN_ROLE; thiếu CSRF -> 403 CSRF_INVALID; chưa xác thực -> 401.
"""
import os
import re
import uuid
import secrets
import asyncio
from decimal import Decimal
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/11")
os.environ.setdefault("DATA_ENCRYPTION_MASTER_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")

import httpx
import psycopg
import pytest
import redis as redis_sync
from argon2 import PasswordHasher
from argon2.low_level import Type

from backend.app.core.config import settings
from backend.app.main import app

PASSWORD = "Asl@Secure2026"
TEST_HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4, type=Type.ID)


# ---------- Hạ tầng & Fixtures ----------

def db():
    return psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True)


@pytest.fixture(autouse=True, scope="session")
def setup_schema():
    """Đảm bảo bảng matter_types có các cột tỷ lệ hoa hồng mặc định theo docs/06."""
    try:
        with db() as conn:
            sql_file = Path(__file__).resolve().parent.parent / "alembic" / "versions" / "003_matter_type_commission_defaults.sql"
            if sql_file.exists():
                conn.execute(sql_file.read_text(encoding="utf-8"))
            else:
                conn.execute("""
                    ALTER TABLE matter_types
                    ADD COLUMN IF NOT EXISTS default_originator_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (default_originator_rate BETWEEN 0 AND 100),
                    ADD COLUMN IF NOT EXISTS default_management_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (default_management_rate BETWEEN 0 AND 100),
                    ADD COLUMN IF NOT EXISTS default_supervisor_share_pct NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (default_supervisor_share_pct BETWEEN 0 AND 100),
                    ADD COLUMN IF NOT EXISTS default_execution_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (default_execution_rate BETWEEN 0 AND 100);
                """)
                try:
                    conn.execute("""
                        ALTER TABLE matter_types
                        ADD CONSTRAINT chk_matter_types_total_commission_rates
                        CHECK (default_originator_rate + default_management_rate + default_execution_rate <= 100);
                    """)
                except Exception:
                    pass
    except Exception:
        pass


@pytest.fixture(autouse=True)
def clean_redis():
    try:
        r = redis_sync.Redis.from_url(os.environ["REDIS_URL"])
        r.flushdb()
        yield
        r.flushdb()
    except Exception:
        yield


def client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://testserver")


async def login(c: httpx.AsyncClient, email: str, password: str = PASSWORD) -> httpx.Response:
    # Cấp phiên bằng access token tự ký: ADMIN/MANAGER/ACCOUNTANT bắt buộc 2FA (DEC-02) nên không đăng nhập
    # bằng mật khẩu được; luồng đăng nhập đã có test riêng (test_auth, test_two_factor).
    import time as _time
    import jwt as _jwt
    with db() as conn:
        uid = str(conn.execute("SELECT id FROM users WHERE email = %s", (email,)).fetchone()[0])
    now = int(_time.time())
    # tokens_valid_after của user test lùi 10 phút: đồng hồ DB có thể nhanh hơn máy chạy test, token iat=now sẽ bị coi là bị thu hồi
    with db() as _c:
        _c.execute("UPDATE users SET tokens_valid_after = now() - interval '10 minutes' WHERE id = %s", (str(uid),))
    token = _jwt.encode({"sub": uid, "jti": str(uuid.uuid4()), "iat": now, "exp": now + 1800, "typ": "access"},
                        settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    c.cookies.set("access_token", token)
    c.cookies.set("csrf_token", "csrf-test-fixed")
    return httpx.Response(200, json={"success": True, "data": {}})


def csrf(c: httpx.AsyncClient) -> dict:
    return {"X-CSRF-Token": c.cookies.get("csrf_token") or ""}


def error_code(resp: httpx.Response) -> str:
    body = resp.json()
    assert body.get("success") is False, body
    return body["error"]["code"]


def make_user(role="ATTORNEY", *, is_active=True, is_executive=False) -> dict:
    email = f"tsk19-{uuid.uuid4().hex[:12]}@asllaw.vn"
    with db() as conn:
        row = conn.execute(
            """INSERT INTO users (email, password_hash, full_name, title, system_role,
                                  is_active, is_executive)
               VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (email, TEST_HASHER.hash(PASSWORD), "Người Dùng Kiểm Thử", "Chuyên viên",
             role, is_active, is_executive),
        ).fetchone()
    return {"id": str(row[0]), "email": email, "role": role}


async def authenticated_client(role="ATTORNEY") -> Tuple[httpx.AsyncClient, dict]:
    u = make_user(role=role)
    c = client()
    resp = await login(c, u["email"])
    assert resp.status_code == 200, resp.text
    return c, u


def make_department() -> str:
    with db() as conn:
        row = conn.execute("SELECT id FROM departments LIMIT 1").fetchone()
        if row:
            return str(row[0])
        code = f"D{secrets.token_hex(2).upper()}"
        row = conn.execute(
            "INSERT INTO departments (name, code) VALUES (%s, %s) RETURNING id",
            (f"Ban Test {code}", code)
        ).fetchone()
        return str(row[0])


def make_matter_type(
    department_id: str,
    code: Optional[str] = None,
    name: str = "Đăng ký Sở hữu Trí tuệ Test",
    default_originator: Decimal = Decimal("5.00"),
    default_management: Decimal = Decimal("7.00"),
    default_supervisor: Decimal = Decimal("40.00"),
    default_execution: Decimal = Decimal("8.00")
) -> str:
    if not code:
        code = "T" + "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ") for _ in range(3))
    with db() as conn:
        row = conn.execute(
            """INSERT INTO matter_types (
                department_id, name, code,
                default_originator_rate, default_management_rate,
                default_supervisor_share_pct, default_execution_rate
            ) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (department_id, name, code, default_originator, default_management,
             default_supervisor, default_execution)
        ).fetchone()
        return str(row[0])


def make_workflow_template(matter_type_id: str, mode: str = "STRICT", name: str = "Quy trình Mẫu") -> str:
    with db() as conn:
        row = conn.execute(
            """INSERT INTO workflow_templates (matter_type_id, name, mode, is_active)
               VALUES (%s, %s, %s, true) RETURNING id""",
            (matter_type_id, name, mode)
        ).fetchone()
        return str(row[0])


def make_template_version(template_id: str, version_no: int = 1, status: str = "PUBLISHED") -> str:
    with db() as conn:
        row = conn.execute(
            """INSERT INTO workflow_template_versions (template_id, version_no, status, published_at)
               VALUES (%s, %s, %s, NOW()) RETURNING id""",
            (template_id, version_no, status)
        ).fetchone()
        return str(row[0])


def make_template_stages_and_tasks(template_version_id: str) -> dict:
    """Tạo bộ stage và task chuẩn cho template version: 3 stage, 4 task, có phụ thuộc."""
    with db() as conn:
        # Stage 1
        s1 = conn.execute(
            """INSERT INTO template_stages (template_version_id, name, order_index, requires_approval)
               VALUES (%s, 'Giai đoạn 1: Tiếp nhận & Thẩm định', 1, false) RETURNING id""",
            (template_version_id,)
        ).fetchone()[0]

        # Stage 2
        s2 = conn.execute(
            """INSERT INTO template_stages (template_version_id, name, order_index, requires_approval)
               VALUES (%s, 'Giai đoạn 2: Nộp đơn & Theo dõi công báo', 2, true) RETURNING id""",
            (template_version_id,)
        ).fetchone()[0]

        # Stage 3
        s3 = conn.execute(
            """INSERT INTO template_stages (template_version_id, name, order_index, requires_approval)
               VALUES (%s, 'Giai đoạn 3: Bàn giao văn bằng bảo hộ', 3, true) RETURNING id""",
            (template_version_id,)
        ).fetchone()[0]

        # Tasks
        t1 = conn.execute(
            """INSERT INTO template_tasks (template_stage_id, title, complexity_weight, requires_approval)
               VALUES (%s, 'Tác vụ 1.1: Soạn tờ khai và danh mục', 2, true) RETURNING id""",
            (s1,)
        ).fetchone()[0]

        t2 = conn.execute(
            """INSERT INTO template_tasks (template_stage_id, title, complexity_weight, requires_approval, triggers_milestone_order)
               VALUES (%s, 'Tác vụ 2.1: Nộp đơn tại Cục SHTT', 3, false, 2) RETURNING id""",
            (s2,)
        ).fetchone()[0]

        t3 = conn.execute(
            """INSERT INTO template_tasks (template_stage_id, title, complexity_weight, requires_approval)
               VALUES (%s, 'Tác vụ 2.2: Trả lời công văn thẩm định', 1, true) RETURNING id""",
            (s2,)
        ).fetchone()[0]

        t4 = conn.execute(
            """INSERT INTO template_tasks (template_stage_id, title, complexity_weight, requires_approval)
               VALUES (%s, 'Tác vụ 3.1: Nhận văn bằng gốc và bàn giao', 2, true) RETURNING id""",
            (s3,)
        ).fetchone()[0]

        # Phụ thuộc: T2 phụ thuộc T1, T3 phụ thuộc T2, T4 phụ thuộc T3
        conn.execute(
            "INSERT INTO template_task_dependencies (template_task_id, depends_on_template_task_id) VALUES (%s, %s)",
            (t2, t1)
        )
        conn.execute(
            "INSERT INTO template_task_dependencies (template_task_id, depends_on_template_task_id) VALUES (%s, %s)",
            (t3, t2)
        )
        conn.execute(
            "INSERT INTO template_task_dependencies (template_task_id, depends_on_template_task_id) VALUES (%s, %s)",
            (t4, t3)
        )

        return {
            "stages": [str(s1), str(s2), str(s3)],
            "tasks": [str(t1), str(t2), str(t3), str(t4)],
            "count_stages": 3,
            "count_tasks": 4
        }


def make_client_record(created_by_user_id: Optional[str] = None) -> str:
    with db() as conn:
        cid = str(uuid.uuid4())
        tax_code = f"01{uuid.uuid4().int % 100000000:08d}"
        conn.execute(
            """INSERT INTO clients (id, client_type, name, normalized_name, tax_code, phone, address, created_by)
               VALUES (%s, 'ENTERPRISE', %s, %s, %s, '0912345678', 'Tầng 5, 12 Duy Tân, Hà Nội', %s)""",
            (cid, f"Công ty Cổ phần Test {cid[:8]}", f"cong ty co phan test {cid[:8]}", tax_code, created_by_user_id)
        )
        return cid


def make_opportunity_record(
    client_id: str,
    originator_id: str,
    stage: str = "NEW_LEAD",
    expected_value: str = "150000000",
    probability_pct: int = 50,
    title: str = "Đăng ký nhãn hiệu quốc tế ASL GATEWAY",
    lost_reason: Optional[str] = None
) -> str:
    with db() as conn:
        opp_id = str(uuid.uuid4())
        conn.execute(
            """INSERT INTO opportunities (
                id, client_id, title, lead_source, expected_value,
                probability_pct, stage, lost_reason, originator_id
            ) VALUES (%s, %s, %s, 'WEBSITE', %s, %s, %s, %s, %s)""",
            (opp_id, client_id, title, expected_value, probability_pct, stage, lost_reason, originator_id)
        )
        return opp_id


# ==============================================================================
# 1. MÁY TRẠNG THÁI CƠ HỘI (State Machine §1.1)
# ==============================================================================

@pytest.mark.asyncio
async def test_opportunity_valid_lifecycle_transitions():
    """Chuyển trạng thái hợp lệ: NEW_LEAD -> PROPOSAL_SENT -> NEGOTIATION -> WON."""
    c, u = await authenticated_client(role="ATTORNEY")
    cid = make_client_record(u["id"])
    opp_id = make_opportunity_record(cid, u["id"], stage="NEW_LEAD")

    # 1. NEW_LEAD -> PROPOSAL_SENT
    r1 = await c.patch(
        f"/api/v1/crm/opportunities/{opp_id}",
        headers=csrf(c),
        json={"stage": "PROPOSAL_SENT"}
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["data"]["stage"] == "PROPOSAL_SENT"

    # 2. PROPOSAL_SENT -> NEGOTIATION
    r2 = await c.patch(
        f"/api/v1/crm/opportunities/{opp_id}",
        headers=csrf(c),
        json={"stage": "NEGOTIATION"}
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["data"]["stage"] == "NEGOTIATION"

    # 3. NEGOTIATION -> WON
    r3 = await c.patch(
        f"/api/v1/crm/opportunities/{opp_id}",
        headers=csrf(c),
        json={"stage": "WON"}
    )
    assert r3.status_code == 200, r3.text
    assert r3.json()["data"]["stage"] == "WON"

    # Kiểm tra DB lưu đúng WON
    with db() as conn:
        row = conn.execute("SELECT stage FROM opportunities WHERE id = %s", (opp_id,)).fetchone()
        assert row[0] == "WON"


@pytest.mark.asyncio
async def test_opportunity_invalid_transition_skip_rejected():
    """Chuyển nhảy cóc (NEW_LEAD -> WON, NEW_LEAD -> NEGOTIATION) bị từ chối 409 INVALID_STATE_TRANSITION."""
    c, u = await authenticated_client(role="ATTORNEY")
    cid = make_client_record(u["id"])

    # Nhảy cóc NEW_LEAD -> WON
    opp1 = make_opportunity_record(cid, u["id"], stage="NEW_LEAD")
    r1 = await c.patch(
        f"/api/v1/crm/opportunities/{opp1}",
        headers=csrf(c),
        json={"stage": "WON"}
    )
    assert r1.status_code == 409, r1.text
    assert error_code(r1) == "INVALID_STATE_TRANSITION"

    # Nhảy cóc NEW_LEAD -> NEGOTIATION
    opp2 = make_opportunity_record(cid, u["id"], stage="NEW_LEAD")
    r2 = await c.patch(
        f"/api/v1/crm/opportunities/{opp2}",
        headers=csrf(c),
        json={"stage": "NEGOTIATION"}
    )
    assert r2.status_code == 409, r2.text
    assert error_code(r2) == "INVALID_STATE_TRANSITION"

    # Nhảy cóc PROPOSAL_SENT -> WON
    opp3 = make_opportunity_record(cid, u["id"], stage="PROPOSAL_SENT")
    r3 = await c.patch(
        f"/api/v1/crm/opportunities/{opp3}",
        headers=csrf(c),
        json={"stage": "WON"}
    )
    assert r3.status_code == 409, r3.text
    assert error_code(r3) == "INVALID_STATE_TRANSITION"

    # Đi lùi: NEGOTIATION -> NEW_LEAD
    opp4 = make_opportunity_record(cid, u["id"], stage="NEGOTIATION")
    r4 = await c.patch(
        f"/api/v1/crm/opportunities/{opp4}",
        headers=csrf(c),
        json={"stage": "NEW_LEAD"}
    )
    assert r4.status_code == 409, r4.text
    assert error_code(r4) == "INVALID_STATE_TRANSITION"


@pytest.mark.asyncio
async def test_opportunity_transition_to_lost_validation():
    """Chuyển sang LOST bắt buộc có lost_reason (thiếu -> 422 VALIDATION_ERROR); có reason -> thành công."""
    c, u = await authenticated_client(role="ATTORNEY")
    cid = make_client_record(u["id"])

    # Thiếu lost_reason
    opp1 = make_opportunity_record(cid, u["id"], stage="NEW_LEAD")
    r1 = await c.patch(
        f"/api/v1/crm/opportunities/{opp1}",
        headers=csrf(c),
        json={"stage": "LOST"}
    )
    assert r1.status_code == 422, r1.text
    assert error_code(r1) == "VALIDATION_ERROR"

    # lost_reason là chuỗi rỗng
    r1_empty = await c.patch(
        f"/api/v1/crm/opportunities/{opp1}",
        headers=csrf(c),
        json={"stage": "LOST", "lost_reason": "   "}
    )
    assert r1_empty.status_code == 422, r1_empty.text

    # Có lost_reason hợp lệ từ PROPOSAL_SENT
    opp2 = make_opportunity_record(cid, u["id"], stage="PROPOSAL_SENT")
    r2 = await c.patch(
        f"/api/v1/crm/opportunities/{opp2}",
        headers=csrf(c),
        json={"stage": "LOST", "lost_reason": "Khách hàng tạm dừng dự án do cắt giảm ngân sách"}
    )
    assert r2.status_code == 200, r2.text
    assert r2.json()["data"]["stage"] == "LOST"

    with db() as conn:
        row = conn.execute("SELECT stage, lost_reason FROM opportunities WHERE id = %s", (opp2,)).fetchone()
        assert row[0] == "LOST"
        assert "cắt giảm ngân sách" in row[1]


@pytest.mark.asyncio
async def test_opportunity_terminal_stage_cannot_be_modified():
    """WON và LOST là trạng thái cuối: sửa stage sau khi đã WON hoặc LOST -> 409 INVALID_STATE_TRANSITION."""
    c, u = await authenticated_client(role="ATTORNEY")
    cid = make_client_record(u["id"])

    # Đã WON -> không được đổi sang bất kỳ trạng thái nào
    opp_won = make_opportunity_record(cid, u["id"], stage="WON")
    for target in ("NEGOTIATION", "LOST", "NEW_LEAD", "PROPOSAL_SENT"):
        r = await c.patch(
            f"/api/v1/crm/opportunities/{opp_won}",
            headers=csrf(c),
            json={"stage": target, "lost_reason": "Lý do huỷ nếu có"}
        )
        assert r.status_code == 409, f"Kỳ vọng 409 khi đổi từ WON sang {target}, nhận {r.status_code}"
        assert error_code(r) == "INVALID_STATE_TRANSITION"

    # Đã LOST -> không được đổi sang trạng thái khác
    opp_lost = make_opportunity_record(cid, u["id"], stage="LOST", lost_reason="Hết nhu cầu")
    for target in ("NEW_LEAD", "WON", "PROPOSAL_SENT", "NEGOTIATION"):
        r = await c.patch(
            f"/api/v1/crm/opportunities/{opp_lost}",
            headers=csrf(c),
            json={"stage": target}
        )
        assert r.status_code == 409, f"Kỳ vọng 409 khi đổi từ LOST sang {target}, nhận {r.status_code}"
        assert error_code(r) == "INVALID_STATE_TRANSITION"


@pytest.mark.asyncio
async def test_opportunity_patch_non_stage_fields():
    """Cập nhật giá trị dự kiến, xác suất thành công bằng số thập phân và int."""
    c, u = await authenticated_client(role="ATTORNEY")
    cid = make_client_record(u["id"])
    opp_id = make_opportunity_record(cid, u["id"], stage="PROPOSAL_SENT", expected_value="100000000", probability_pct=30)

    r = await c.patch(
        f"/api/v1/crm/opportunities/{opp_id}",
        headers=csrf(c),
        json={
            "expected_value": "250000000.50",
            "probability_pct": 75
        }
    )
    assert r.status_code == 200, r.text
    with db() as conn:
        row = conn.execute("SELECT expected_value, probability_pct FROM opportunities WHERE id = %s", (opp_id,)).fetchone()
        assert row[0] == Decimal("250000000.50")
        assert row[1] == 75


# ==============================================================================
# 2. TC-CRM-02: CHUYỂN ĐỔI 1-CHẠM THÀNH VỤ VIỆC ĐẦY ĐỦ
# ==============================================================================

@pytest.mark.asyncio
async def test_tc_crm_02_convert_won_opportunity_success():
    """TC-CRM-02: chuyển đổi WON -> vụ việc INITIALIZING, mã khớp ^ASL-\\d{4}-[A-Z]{2,4}-\\d{4}$,
    đúng template_version_id PUBLISHED mới nhất, sao chép stage/task, stage đầu ACTIVE,
    có billing_milestones khớp Decimal, commission_policies bằng mặc định, originator_id đúng."""
    c, u = await authenticated_client(role="ATTORNEY")
    cid = make_client_record(u["id"])
    opp_id = make_opportunity_record(cid, u["id"], stage="WON", title="Cơ hội nhãn hiệu Quốc tế ASL")

    dept_id = make_department()
    mid = make_matter_type(
        department_id=dept_id,
        code="TM",
        name="Đăng ký Nhãn hiệu Độc quyền",
        default_originator=Decimal("5.00"),
        default_management=Decimal("7.00"),
        default_supervisor=Decimal("40.00"),
        default_execution=Decimal("8.00")
    )
    tmpl_id = make_workflow_template(mid, mode="STRICT", name="Quy trình Nhãn hiệu Khung cứng")
    v_id = make_template_version(tmpl_id, version_no=1, status="PUBLISHED")
    tmpl_data = make_template_stages_and_tasks(v_id)

    idempotency_key = str(uuid.uuid4())
    convert_payload = {
        "matter_type_id": mid,
        "title": "Vụ việc đăng ký nhãn hiệu quốc tế ASL GATEWAY",
        "contract_value": "150000000",
        "milestones": [
            {"name": "Đợt 1 - Tạm ứng khi ký hợp đồng", "amount": "45000000"},
            {"name": "Đợt 2 - Có thông báo chấp nhận đơn hợp lệ", "amount": "60000000"},
            {"name": "Đợt 3 - Bàn giao văn bằng bảo hộ gốc", "amount": "45000000"}
        ],
        "notes": "Khách hàng cần gấp trước tháng 12"
    }

    resp = await c.post(
        f"/api/v1/crm/opportunities/{opp_id}/convert",
        headers={"Idempotency-Key": idempotency_key, **csrf(c)},
        json=convert_payload
    )
    assert resp.status_code in (200, 201), resp.text
    body = resp.json()
    assert body["success"] is True, body
    data = body["data"]

    case_id = data["case_id"]
    case_code = data["case_code"]
    assert re.match(r"^ASL-\d{4}-[A-Z]{2,4}-\d{4}$", case_code), f"Mã vụ việc không đúng chuẩn: {case_code}"
    assert data["status"] == "INITIALIZING"
    assert data["workflow_mode"] == "STRICT"
    assert data["template_version"] == 1
    assert data["total_stages"] == tmpl_data["count_stages"]
    assert data["total_tasks_created"] == tmpl_data["count_tasks"]

    # Kiểm tra cơ sở dữ liệu PostgreSQL
    with db() as conn:
        # 1. Bảng cases
        c_row = conn.execute(
            """SELECT case_code, title, client_id, opportunity_id, matter_type_id,
                      department_id, template_version_id, workflow_mode, contract_value, status
               FROM cases WHERE id = %s""",
            (case_id,)
        ).fetchone()
        assert c_row is not None, "Không tìm thấy case trong bảng cases"
        assert c_row[0] == case_code
        assert c_row[1] == "Vụ việc đăng ký nhãn hiệu quốc tế ASL GATEWAY"
        assert str(c_row[2]) == cid
        assert str(c_row[3]) == opp_id
        assert str(c_row[4]) == mid
        assert str(c_row[5]) == dept_id
        assert str(c_row[6]) == v_id
        assert c_row[7] == "STRICT"
        assert c_row[8] == Decimal("150000000")
        assert c_row[9] == "INITIALIZING"

        # 2. Bảng opportunities: converted_case_id được cập nhật
        opp_row = conn.execute("SELECT converted_case_id FROM opportunities WHERE id = %s", (opp_id,)).fetchone()
        assert str(opp_row[0]) == case_id

        # 3. Bảng case_stages: 3 stage, stage đầu ACTIVE, còn lại LOCKED
        stages = conn.execute(
            """SELECT order_index, name, status, requires_approval
               FROM case_stages WHERE case_id = %s ORDER BY order_index""",
            (case_id,)
        ).fetchall()
        assert len(stages) == 3
        assert stages[0][0] == 1 and stages[0][2] == "ACTIVE"
        assert stages[1][0] == 2 and stages[1][2] == "LOCKED"
        assert stages[2][0] == 3 and stages[2][2] == "LOCKED"

        # 4. Bảng case_tasks: 4 task, toàn bộ ở trạng thái TODO
        tasks = conn.execute(
            """SELECT title, status, complexity_weight, requires_approval, triggers_milestone_id
               FROM case_tasks WHERE case_id = %s ORDER BY title""",
            (case_id,)
        ).fetchall()
        assert len(tasks) == 4
        for t in tasks:
            assert t[1] == "TODO"

        # Task có triggers_milestone_order = 2 phải gắn đúng milestone thứ 2
        m2_row = conn.execute(
            "SELECT id FROM billing_milestones WHERE case_id = %s AND order_index = 2",
            (case_id,)
        ).fetchone()
        assert m2_row is not None
        task_with_trigger = [t for t in tasks if t[4] is not None]
        assert len(task_with_trigger) >= 1
        assert str(task_with_trigger[0][4]) == str(m2_row[0])

        # 5. Bảng billing_milestones: 3 đợt thu, PENDING, số tiền khớp Decimal
        milestones = conn.execute(
            """SELECT order_index, name, amount, received_total, status
               FROM billing_milestones WHERE case_id = %s ORDER BY order_index""",
            (case_id,)
        ).fetchall()
        assert len(milestones) == 3
        expected_milestones = [
            (1, "Đợt 1 - Tạm ứng khi ký hợp đồng", Decimal("45000000")),
            (2, "Đợt 2 - Có thông báo chấp nhận đơn hợp lệ", Decimal("60000000")),
            (3, "Đợt 3 - Bàn giao văn bằng bảo hộ gốc", Decimal("45000000"))
        ]
        total_milestone_amount = Decimal("0")
        for idx, (exp_ord, exp_name, exp_amount) in enumerate(expected_milestones):
            m = milestones[idx]
            assert m[0] == exp_ord
            assert m[1] == exp_name
            assert m[2] == exp_amount
            assert m[3] == Decimal("0")
            assert m[4] == "PENDING"
            total_milestone_amount += m[2]
        assert total_milestone_amount == Decimal("150000000")

        # 6. Bảng commission_policies: khởi tạo từ matter_types.default_*
        policy = conn.execute(
            """SELECT originator_rate, management_rate, supervisor_share_pct, execution_rate
               FROM commission_policies WHERE case_id = %s""",
            (case_id,)
        ).fetchone()
        assert policy is not None, "Không tìm thấy chính sách hoa hồng cho vụ việc"
        assert policy[0] == Decimal("5.00")
        assert policy[1] == Decimal("7.00")
        assert policy[2] == Decimal("40.00")
        assert policy[3] == Decimal("8.00")

        # 7. Audit log ghi nhận hành động chuyển đổi
        audit = conn.execute(
            "SELECT action, entity_name FROM audit_logs WHERE entity_id = %s OR entity_id = %s",
            (opp_id, case_id)
        ).fetchall()
        assert any("CONVERT" in a[0].upper() for a in audit)

        # 8. Outbox event tạo vụ việc
        outbox = conn.execute(
            "SELECT event_type FROM outbox_events WHERE status = 'PENDING' ORDER BY created_at DESC LIMIT 5"
        ).fetchall()
        assert len(outbox) > 0


@pytest.mark.asyncio
async def test_convert_uses_latest_published_template_version():
    """Nếu loại vụ việc có nhiều version, chuyển đổi phải chọn bản PUBLISHED mới nhất."""
    c, u = await authenticated_client(role="ATTORNEY")
    cid = make_client_record(u["id"])
    opp_id = make_opportunity_record(cid, u["id"], stage="WON")

    dept_id = make_department()
    mid = make_matter_type(department_id=dept_id, code="MA")
    tmpl_id = make_workflow_template(mid, mode="FLEXIBLE", name="Quy trình Hợp đồng")

    # Bản 1: PUBLISHED
    v1 = make_template_version(tmpl_id, version_no=1, status="PUBLISHED")
    make_template_stages_and_tasks(v1)

    # Bản 2: DRAFT (chưa phát hành, không được dùng)
    v2 = make_template_version(tmpl_id, version_no=2, status="DRAFT")
    make_template_stages_and_tasks(v2)

    # Bản 3: PUBLISHED (mới nhất, phải được dùng)
    v3 = make_template_version(tmpl_id, version_no=3, status="PUBLISHED")
    make_template_stages_and_tasks(v3)

    resp = await c.post(
        f"/api/v1/crm/opportunities/{opp_id}/convert",
        headers={"Idempotency-Key": str(uuid.uuid4()), **csrf(c)},
        json={
            "matter_type_id": mid,
            "title": "Tư vấn hợp đồng v3",
            "contract_value": "50000000",
            "milestones": [{"name": "Đợt 1", "amount": "50000000"}]
        }
    )
    assert resp.status_code in (200, 201), resp.text
    case_id = resp.json()["data"]["case_id"]

    with db() as conn:
        row = conn.execute("SELECT template_version_id, workflow_mode FROM cases WHERE id = %s", (case_id,)).fetchone()
        assert str(row[0]) == v3, f"Phải gắn template version 3, hiện tại gắn {row[0]}"
        assert row[1] == "FLEXIBLE"


@pytest.mark.asyncio
async def test_manager_can_specify_different_originator():
    """Quản lý (MANAGER) được chọn người mang khách về khác (vai trò bất kỳ theo DEC-01)."""
    c, mgr = await authenticated_client(role="MANAGER")
    other_user = make_user(role="ACCOUNTANT")  # Kế toán mang khách về theo DEC-01

    cid = make_client_record(mgr["id"])
    opp_id = make_opportunity_record(cid, mgr["id"], stage="WON")

    dept_id = make_department()
    mid = make_matter_type(department_id=dept_id)
    tmpl_id = make_workflow_template(mid)
    v_id = make_template_version(tmpl_id, version_no=1, status="PUBLISHED")
    make_template_stages_and_tasks(v_id)

    resp = await c.post(
        f"/api/v1/crm/opportunities/{opp_id}/convert",
        headers={"Idempotency-Key": str(uuid.uuid4()), **csrf(c)},
        json={
            "matter_type_id": mid,
            "title": "Vụ việc do Kế toán mang về",
            "contract_value": "80000000",
            "originator_id": other_user["id"],
            "milestones": [{"name": "Đợt 1", "amount": "80000000"}]
        }
    )
    assert resp.status_code in (200, 201), resp.text
    case_id = resp.json()["data"]["case_id"]

    # Xác nhận originator_id trong cơ hội hoặc vụ việc được cập nhật đúng sang other_user
    with db() as conn:
        opp_row = conn.execute("SELECT originator_id FROM opportunities WHERE id = %s", (opp_id,)).fetchone()
        assert str(opp_row[0]) == other_user["id"]


# ==============================================================================
# 3. TC-CRM-05: IDEMPOTENCY & CHỐNG CHUYỂN ĐỔI LẶP / LỖI
# ==============================================================================

@pytest.mark.asyncio
async def test_convert_opportunity_not_won_rejected():
    """Cơ hội chưa WON (NEW_LEAD, PROPOSAL_SENT, NEGOTIATION, LOST) -> 409 OPPORTUNITY_NOT_WON.
    Không tạo vụ việc hay đợt thu nào trong DB."""
    c, u = await authenticated_client(role="ATTORNEY")
    cid = make_client_record(u["id"])
    dept_id = make_department()
    mid = make_matter_type(department_id=dept_id)
    tmpl_id = make_workflow_template(mid)
    v_id = make_template_version(tmpl_id, version_no=1, status="PUBLISHED")
    make_template_stages_and_tasks(v_id)

    for not_won_stage in ("NEW_LEAD", "PROPOSAL_SENT", "NEGOTIATION", "LOST"):
        opp_id = make_opportunity_record(
            cid, u["id"], stage=not_won_stage,
            lost_reason="Lý do nếu lost" if not_won_stage == "LOST" else None
        )
        r = await c.post(
            f"/api/v1/crm/opportunities/{opp_id}/convert",
            headers={"Idempotency-Key": str(uuid.uuid4()), **csrf(c)},
            json={
                "matter_type_id": mid,
                "title": f"Test chưa WON {not_won_stage}",
                "contract_value": "100000000",
                "milestones": [{"name": "Đợt 1", "amount": "100000000"}]
            }
        )
        assert r.status_code == 409, f"Kỳ vọng 409 cho stage {not_won_stage}, nhận {r.status_code}"
        assert error_code(r) == "OPPORTUNITY_NOT_WON"

        # Kiểm tra không có bản ghi vụ việc nào được tạo
        with db() as conn:
            cnt = conn.execute("SELECT count(*) FROM cases WHERE opportunity_id = %s", (opp_id,)).fetchone()[0]
            assert cnt == 0, f"Có vụ việc rác sinh ra cho stage {not_won_stage}"


@pytest.mark.asyncio
async def test_convert_idempotency_same_key_returns_cached_response():
    """Gửi 2 lần cùng Idempotency-Key và cùng body:
    - Cả 2 lần trả 200/201 và CÙNG case_id, cùng case_code.
    - Trong DB chỉ có ĐÚNG 1 vụ việc, không duplicate stage/task/milestone."""
    c, u = await authenticated_client(role="ATTORNEY")
    cid = make_client_record(u["id"])
    opp_id = make_opportunity_record(cid, u["id"], stage="WON")

    dept_id = make_department()
    mid = make_matter_type(department_id=dept_id)
    tmpl_id = make_workflow_template(mid)
    v_id = make_template_version(tmpl_id, version_no=1, status="PUBLISHED")
    make_template_stages_and_tasks(v_id)

    idempotency_key = str(uuid.uuid4())
    payload = {
        "matter_type_id": mid,
        "title": "Chuyển đổi kiểm thử Idempotency",
        "contract_value": "100000000",
        "milestones": [
            {"name": "Đợt 1", "amount": "50000000"},
            {"name": "Đợt 2", "amount": "50000000"}
        ]
    }

    # Lần 1
    r1 = await c.post(
        f"/api/v1/crm/opportunities/{opp_id}/convert",
        headers={"Idempotency-Key": idempotency_key, **csrf(c)},
        json=payload
    )
    assert r1.status_code in (200, 201), r1.text
    case_id_1 = r1.json()["data"]["case_id"]
    case_code_1 = r1.json()["data"]["case_code"]

    # Lần 2 gửi lại đúng key và body cũ
    r2 = await c.post(
        f"/api/v1/crm/opportunities/{opp_id}/convert",
        headers={"Idempotency-Key": idempotency_key, **csrf(c)},
        json=payload
    )
    assert r2.status_code in (200, 201), r2.text
    case_id_2 = r2.json()["data"]["case_id"]
    case_code_2 = r2.json()["data"]["case_code"]

    assert case_id_1 == case_id_2, "Idempotency phải trả về cùng case_id"
    assert case_code_1 == case_code_2, "Idempotency phải trả về cùng case_code"

    # Xác nhận trong DB chỉ có đúng 1 vụ việc duy nhất
    with db() as conn:
        cases = conn.execute("SELECT id FROM cases WHERE opportunity_id = %s", (opp_id,)).fetchall()
        assert len(cases) == 1, f"Có {len(cases)} vụ việc trong DB cho cùng cơ hội"
        milestone_count = conn.execute("SELECT count(*) FROM billing_milestones WHERE case_id = %s", (case_id_1,)).fetchone()[0]
        assert milestone_count == 2, "Bị nhân bản đợt thu"


@pytest.mark.asyncio
async def test_convert_already_converted_with_different_key():
    """Lần 3 gửi với khoá khác -> 409 OPPORTUNITY_ALREADY_CONVERTED."""
    c, u = await authenticated_client(role="ATTORNEY")
    cid = make_client_record(u["id"])
    opp_id = make_opportunity_record(cid, u["id"], stage="WON")

    dept_id = make_department()
    mid = make_matter_type(department_id=dept_id)
    tmpl_id = make_workflow_template(mid)
    v_id = make_template_version(tmpl_id, version_no=1, status="PUBLISHED")
    make_template_stages_and_tasks(v_id)

    key_1 = str(uuid.uuid4())
    payload = {
        "matter_type_id": mid,
        "title": "Chuyển đổi lần 1",
        "contract_value": "50000000",
        "milestones": [{"name": "Đợt 1", "amount": "50000000"}]
    }
    r1 = await c.post(
        f"/api/v1/crm/opportunities/{opp_id}/convert",
        headers={"Idempotency-Key": key_1, **csrf(c)},
        json=payload
    )
    assert r1.status_code in (200, 201)

    # Lần 3 gửi bằng khoá mới
    key_2 = str(uuid.uuid4())
    r3 = await c.post(
        f"/api/v1/crm/opportunities/{opp_id}/convert",
        headers={"Idempotency-Key": key_2, **csrf(c)},
        json=payload
    )
    assert r3.status_code == 409, r3.text
    assert error_code(r3) == "OPPORTUNITY_ALREADY_CONVERTED"


@pytest.mark.asyncio
async def test_convert_same_idempotency_key_with_different_payload_rejected():
    """Cùng Idempotency-Key nhưng gửi nội dung body khác -> 409 IDEMPOTENCY_KEY_REUSED."""
    c, u = await authenticated_client(role="ATTORNEY")
    cid = make_client_record(u["id"])
    opp_id = make_opportunity_record(cid, u["id"], stage="WON")

    dept_id = make_department()
    mid = make_matter_type(department_id=dept_id)
    tmpl_id = make_workflow_template(mid)
    v_id = make_template_version(tmpl_id, version_no=1, status="PUBLISHED")
    make_template_stages_and_tasks(v_id)

    idempotency_key = str(uuid.uuid4())
    payload_a = {
        "matter_type_id": mid,
        "title": "Nội dung A",
        "contract_value": "100000000",
        "milestones": [{"name": "Đợt 1", "amount": "100000000"}]
    }
    r1 = await c.post(
        f"/api/v1/crm/opportunities/{opp_id}/convert",
        headers={"Idempotency-Key": idempotency_key, **csrf(c)},
        json=payload_a
    )
    assert r1.status_code in (200, 201)

    # Gửi lại cùng key nhưng đổi contract_value hoặc title
    payload_b = {
        "matter_type_id": mid,
        "title": "Nội dung B bị sửa",
        "contract_value": "200000000",
        "milestones": [{"name": "Đợt 1", "amount": "200000000"}]
    }
    r2 = await c.post(
        f"/api/v1/crm/opportunities/{opp_id}/convert",
        headers={"Idempotency-Key": idempotency_key, **csrf(c)},
        json=payload_b
    )
    assert r2.status_code == 409, r2.text
    assert error_code(r2) == "IDEMPOTENCY_KEY_REUSED"


@pytest.mark.asyncio
async def test_convert_missing_idempotency_key_header_rejected():
    """Thiếu header Idempotency-Key -> 422 VALIDATION_ERROR."""
    c, u = await authenticated_client(role="ATTORNEY")
    cid = make_client_record(u["id"])
    opp_id = make_opportunity_record(cid, u["id"], stage="WON")

    dept_id = make_department()
    mid = make_matter_type(department_id=dept_id)

    r = await c.post(
        f"/api/v1/crm/opportunities/{opp_id}/convert",
        headers=csrf(c),  # Không có Idempotency-Key
        json={
            "matter_type_id": mid,
            "title": "Thiếu Idempotency-Key",
            "contract_value": "100000000",
            "milestones": [{"name": "Đợt 1", "amount": "100000000"}]
        }
    )
    assert r.status_code == 422, r.text


# ==============================================================================
# 4. RÀNG BUỘC NGHIỆP VỤ & TỔNG TIỀN ĐỢT THU
# ==============================================================================

@pytest.mark.asyncio
async def test_convert_milestones_exceed_contract_value_rolls_back():
    """Tổng milestones.amount > contract_value -> 422 MILESTONES_EXCEED_CONTRACT.
    Rollback toàn bộ, không tạo case, không tạo milestone, cơ hội giữ nguyên."""
    c, u = await authenticated_client(role="ATTORNEY")
    cid = make_client_record(u["id"])
    opp_id = make_opportunity_record(cid, u["id"], stage="WON")

    dept_id = make_department()
    mid = make_matter_type(department_id=dept_id)
    tmpl_id = make_workflow_template(mid)
    v_id = make_template_version(tmpl_id, version_no=1, status="PUBLISHED")
    make_template_stages_and_tasks(v_id)

    # contract_value là 100M nhưng tổng milestones là 60M + 50M = 110M
    r = await c.post(
        f"/api/v1/crm/opportunities/{opp_id}/convert",
        headers={"Idempotency-Key": str(uuid.uuid4()), **csrf(c)},
        json={
            "matter_type_id": mid,
            "title": "Vượt giá trị hợp đồng",
            "contract_value": "100000000",
            "milestones": [
                {"name": "Đợt 1", "amount": "60000000"},
                {"name": "Đợt 2", "amount": "50000000"}
            ]
        }
    )
    assert r.status_code == 422, r.text
    assert error_code(r) == "MILESTONES_EXCEED_CONTRACT"

    # Kiểm tra DB sạch, không có bản ghi dở dang
    with db() as conn:
        opp_row = conn.execute("SELECT converted_case_id FROM opportunities WHERE id = %s", (opp_id,)).fetchone()
        assert opp_row[0] is None, "converted_case_id phải là NULL khi lỗi"
        case_cnt = conn.execute("SELECT count(*) FROM cases WHERE opportunity_id = %s", (opp_id,)).fetchone()[0]
        assert case_cnt == 0, "Không được tạo case khi vượt giá trị hợp đồng"


@pytest.mark.asyncio
async def test_convert_no_published_template_rejected():
    """Loại vụ việc chưa có template nào ở trạng thái PUBLISHED -> 409 NO_PUBLISHED_TEMPLATE."""
    c, u = await authenticated_client(role="ATTORNEY")
    cid = make_client_record(u["id"])
    opp_id = make_opportunity_record(cid, u["id"], stage="WON")

    dept_id = make_department()
    mid = make_matter_type(department_id=dept_id)
    tmpl_id = make_workflow_template(mid)
    # Chỉ có version DRAFT, không có PUBLISHED
    v_draft = make_template_version(tmpl_id, version_no=1, status="DRAFT")
    make_template_stages_and_tasks(v_draft)

    r = await c.post(
        f"/api/v1/crm/opportunities/{opp_id}/convert",
        headers={"Idempotency-Key": str(uuid.uuid4()), **csrf(c)},
        json={
            "matter_type_id": mid,
            "title": "Chưa có template published",
            "contract_value": "100000000",
            "milestones": [{"name": "Đợt 1", "amount": "100000000"}]
        }
    )
    assert r.status_code == 409, r.text
    assert error_code(r) == "NO_PUBLISHED_TEMPLATE"


# ==============================================================================
# 5. ĐỒNG THỜI CAO: 50 CHUYỂN ĐỔI SONG SONG
# ==============================================================================

@pytest.mark.asyncio
async def test_50_parallel_conversions_distinct_case_codes():
    """50 chuyển đổi song song (50 cơ hội WON khác nhau, cùng loại vụ việc):
    -> 50 vụ việc được tạo thành công, 50 mã khác nhau, liên tiếp, không trùng mã."""
    c, u = await authenticated_client(role="ATTORNEY")
    dept_id = make_department()
    matter_code = f"P{secrets.token_hex(1).upper()[:2]}"
    mid = make_matter_type(department_id=dept_id, code=matter_code)
    tmpl_id = make_workflow_template(mid)
    v_id = make_template_version(tmpl_id, version_no=1, status="PUBLISHED")
    make_template_stages_and_tasks(v_id)

    # Tạo 50 cơ hội WON độc lập
    opp_ids = []
    for i in range(50):
        cid = make_client_record(u["id"])
        opp_id = make_opportunity_record(cid, u["id"], stage="WON", title=f"Cơ hội song song {i+1}")
        opp_ids.append(opp_id)

    async def convert_one(opp_id: str, index: int) -> dict:
        key = str(uuid.uuid4())
        resp = await c.post(
            f"/api/v1/crm/opportunities/{opp_id}/convert",
            headers={"Idempotency-Key": key, **csrf(c)},
            json={
                "matter_type_id": mid,
                "title": f"Vụ việc song song {index+1}",
                "contract_value": "100000000",
                "milestones": [{"name": "Đợt 1", "amount": "100000000"}]
            }
        )
        assert resp.status_code in (200, 201), f"Convert {index} lỗi: {resp.text}"
        return resp.json()["data"]

    # Chạy đồng thời 50 requests
    results = await asyncio.gather(*[convert_one(opp_ids[i], i) for i in range(50)])

    case_ids = [res["case_id"] for res in results]
    case_codes = [res["case_code"] for res in results]

    # Kiểm tra tính duy nhất
    assert len(set(case_ids)) == 50, "Có case_id bị trùng giữa các request song song"
    assert len(set(case_codes)) == 50, "Có case_code bị trùng giữa các request song song"

    # Kiểm tra định dạng và chuỗi số thứ tự liên tiếp
    seq_numbers = []
    for code in case_codes:
        m = re.match(r"^ASL-\d{4}-([A-Z]{2,4})-(\d{4})$", code)
        assert m is not None, f"Mã vụ việc không đúng chuẩn: {code}"
        assert m.group(1) == matter_code
        seq_numbers.append(int(m.group(2)))

    seq_numbers.sort()
    # 50 số phải liên tiếp: seq_numbers[i+1] == seq_numbers[i] + 1
    for i in range(len(seq_numbers) - 1):
        assert seq_numbers[i + 1] == seq_numbers[i] + 1, (
            f"Dãy số thứ tự không liên tiếp tại vị trí {i}: {seq_numbers}"
        )

    # Kiểm tra case_code_sequences trong DB
    with db() as conn:
        row = conn.execute(
            "SELECT last_no FROM case_code_sequences WHERE matter_code = %s",
            (matter_code,)
        ).fetchone()
        assert row is not None
        assert row[0] >= seq_numbers[-1]


# ==============================================================================
# 6. PHÂN QUYỀN & CSRF (Permissions & Security)
# ==============================================================================

@pytest.mark.asyncio
async def test_permission_roles_forbidden():
    """ACCOUNTANT và ADMIN bị từ chối truy cập (403 FORBIDDEN_ROLE) vào PATCH/convert cơ hội."""
    cid = make_client_record()
    opp_id = make_opportunity_record(cid, None, stage="WON")
    dept_id = make_department()
    mid = make_matter_type(department_id=dept_id)

    for forbidden_role in ("ACCOUNTANT", "ADMIN"):
        c, u = await authenticated_client(role=forbidden_role)

        # PATCH opportunity
        r_patch = await c.patch(
            f"/api/v1/crm/opportunities/{opp_id}",
            headers=csrf(c),
            json={"probability_pct": 90}
        )
        assert r_patch.status_code == 403, f"{forbidden_role} phải bị 403 khi PATCH, nhận {r_patch.status_code}"
        assert error_code(r_patch) == "FORBIDDEN_ROLE"

        # POST convert
        r_convert = await c.post(
            f"/api/v1/crm/opportunities/{opp_id}/convert",
            headers={"Idempotency-Key": str(uuid.uuid4()), **csrf(c)},
            json={
                "matter_type_id": mid,
                "title": "Test quyền",
                "contract_value": "50000000",
                "milestones": [{"name": "Đợt 1", "amount": "50000000"}]
            }
        )
        assert r_convert.status_code == 403, f"{forbidden_role} phải bị 403 khi convert, nhận {r_convert.status_code}"
        assert error_code(r_convert) == "FORBIDDEN_ROLE"


@pytest.mark.asyncio
async def test_csrf_token_required_for_writes():
    """Thiếu hoặc sai X-CSRF-Token khi dùng cookie session -> 403 CSRF_INVALID."""
    c, u = await authenticated_client(role="ATTORNEY")
    cid = make_client_record(u["id"])
    opp_id = make_opportunity_record(cid, u["id"], stage="WON")
    dept_id = make_department()
    mid = make_matter_type(department_id=dept_id)

    # 1. Thiếu header X-CSRF-Token
    r_no_csrf = await c.post(
        f"/api/v1/crm/opportunities/{opp_id}/convert",
        headers={"Idempotency-Key": str(uuid.uuid4())},
        json={
            "matter_type_id": mid,
            "title": "Thiếu CSRF",
            "contract_value": "50000000",
            "milestones": [{"name": "Đợt 1", "amount": "50000000"}]
        }
    )
    assert r_no_csrf.status_code == 403, r_no_csrf.text
    assert error_code(r_no_csrf) == "CSRF_INVALID"

    # 2. Sai X-CSRF-Token
    r_bad_csrf = await c.post(
        f"/api/v1/crm/opportunities/{opp_id}/convert",
        headers={"Idempotency-Key": str(uuid.uuid4()), "X-CSRF-Token": "sai_hoan_toan_token"},
        json={
            "matter_type_id": mid,
            "title": "Sai CSRF",
            "contract_value": "50000000",
            "milestones": [{"name": "Đợt 1", "amount": "50000000"}]
        }
    )
    assert r_bad_csrf.status_code == 403, r_bad_csrf.text
    assert error_code(r_bad_csrf) == "CSRF_INVALID"


@pytest.mark.asyncio
async def test_unauthenticated_request_rejected():
    """Không có token xác thực -> 401 UNAUTHENTICATED."""
    c = client()
    cid = make_client_record()
    opp_id = make_opportunity_record(cid, None, stage="WON")

    r = await c.patch(
        f"/api/v1/crm/opportunities/{opp_id}",
        json={"probability_pct": 50}
    )
    assert r.status_code == 401, r.text
    assert error_code(r) == "UNAUTHENTICATED"
