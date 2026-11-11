"""Nghiệm thu TASK-021 — Backend trình thiết kế quy trình, phiên bản & ngày nghỉ (TSK-06).

Hợp đồng:
- docs/07-api-contracts.md §3.3a (Trình thiết kế quy trình), §1.2, §1.3.
- docs/06-database-schema.md: matter_types, workflow_templates, workflow_template_versions,
  template_stages, template_tasks, template_task_dependencies, holidays, cases, audit_logs.
- docs/13-test-cases-and-qa.md: TC-WF-04 (Phiên bản template & tính bất biến).
- docs/14-decisions.md: DEC-07 (Khung cứng STRICT / Linh hoạt FLEXIBLE).
"""
import os
import time
import uuid
import json
import pytest
import psycopg
import httpx
from contextlib import asynccontextmanager
from argon2 import PasswordHasher
from argon2.low_level import Type

from backend.app.core.config import settings
from backend.app.main import app

PASSWORD = "Asl@Secure2026"
TEST_HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4, type=Type.ID)


# ---------- Fixtures & Hạ tầng test ----------

@pytest.fixture(autouse=True)
def clean_redis():
    import redis as redis_sync
    redis_url = os.environ.get("REDIS_URL", "redis://127.0.0.1:6379/10")
    try:
        r = redis_sync.Redis.from_url(redis_url)
        r.flushdb()
        yield
        r.flushdb()
    except Exception:
        yield


def db():
    return psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True)


def make_user(role="ADMIN", *, totp_enabled=False, must_reset=False, is_active=True) -> dict:
    email = f"wf-{uuid.uuid4().hex[:12]}@asllaw.vn"
    with db() as conn:
        row = conn.execute(
            """INSERT INTO users (email, password_hash, full_name, title, system_role,
                                  totp_enabled, must_reset_password, is_active)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (email, TEST_HASHER.hash(PASSWORD), f"User {role}", "Kiểm thử quy trình", role,
             totp_enabled, must_reset, is_active),
        ).fetchone()
    return {"id": str(row[0]), "email": email}


def client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://testserver")


async def login(c: httpx.AsyncClient, email: str, password: str = PASSWORD) -> httpx.Response:
    return await c.post("/api/v1/auth/login", json={"email": email, "password": password})


def csrf_headers(c: httpx.AsyncClient) -> dict:
    return {"X-CSRF-Token": c.cookies.get("csrf_token") or ""}


@asynccontextmanager
async def client_for_role(role="ADMIN"):
    # Cấp phiên trực tiếp bằng access token hợp lệ: ADMIN/MANAGER bắt buộc 2FA (DEC-02) nên không đăng nhập
    # bằng mật khẩu được trong test này; luồng đăng nhập đã có test riêng (test_auth, test_two_factor).
    import jwt as _jwt
    u = make_user(role=role)
    now = int(time.time())
    # tokens_valid_after của user test lùi 10 phút: đồng hồ DB có thể nhanh hơn máy chạy test, token iat=now sẽ bị coi là bị thu hồi
    with db() as _c:
        _c.execute("UPDATE users SET tokens_valid_after = now() - interval '10 minutes' WHERE id = %s", (str(u["id"]),))
    token = _jwt.encode({"sub": u["id"], "jti": str(uuid.uuid4()), "iat": now, "exp": now + 1800, "typ": "access"},
                        settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    async with client() as c:
        c.cookies.set("access_token", token)
        c.cookies.set("csrf_token", "csrf-test-fixed")
        yield c, u


def error_code(resp: httpx.Response) -> str:
    body = resp.json()
    assert body.get("success") is False, body
    return body["error"]["code"]


def create_test_matter_type(conn, custom_fields=None) -> tuple[str, str, str]:
    """Tạo department và matter_type ngẫu nhiên (mã 3-4 chữ in hoa) không đụng dữ liệu seed."""
    dept_code = f"DP_{uuid.uuid4().hex[:6].upper()}"
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO departments (name, code) VALUES (%s, %s) RETURNING id",
            (f"Ban {dept_code}", dept_code)
        )
        dept_id = str(cur.fetchone()[0])

        mt_code = "T" + "".join(__import__("random").choice("ABCDEFGHJKLMNPQRSTUVWXYZ") for _ in range(3))
        cur.execute(
            """INSERT INTO matter_types (department_id, name, code, custom_fields_schema)
               VALUES (%s, %s, %s, %s) RETURNING id""",
            (dept_id, f"Loại việc {mt_code}", mt_code, json.dumps(custom_fields or []))
        )
        mt_id = str(cur.fetchone()[0])
    return mt_id, mt_code, dept_id


def create_test_client(conn) -> str:
    with conn.cursor() as cur:
        tax_code = f"01{uuid.uuid4().int % 100000000:08d}"
        cur.execute(
            """INSERT INTO clients (client_type, name, normalized_name, tax_code, phone, address)
               VALUES ('ENTERPRISE', 'Công ty Kiểm Thử Quy Trình', 'cong ty kiem thu quy trinh',
                       %s, '0901234567', 'Hà Nội')
               RETURNING id""",
            (tax_code,)
        )
        return str(cur.fetchone()[0])


def build_3_stage_6_task_tree():
    """Tạo cây mẫu 3 stage, 6 task, có phụ thuộc tuần tự giữa các task."""
    return {
        "stages": [
            {
                "key": "s1",
                "name": "Tiếp nhận & thẩm định",
                "order_index": 1,
                "requires_approval": True,
                "tasks": [
                    {
                        "key": "t1",
                        "title": "Tra cứu nhãn hiệu",
                        "description": "Tra cứu cơ sở dữ liệu Cục SHTT",
                        "default_case_role": "EXECUTOR",
                        "sla_business_days": 3,
                        "complexity_weight": 2,
                        "requires_approval": True,
                        "triggers_milestone_order": None,
                        "depends_on": []
                    },
                    {
                        "key": "t2",
                        "title": "Gửi báo cáo tra cứu",
                        "description": None,
                        "default_case_role": "CASE_MANAGER",
                        "sla_business_days": 1,
                        "complexity_weight": 1,
                        "requires_approval": False,
                        "triggers_milestone_order": 1,
                        "depends_on": ["t1"]
                    }
                ]
            },
            {
                "key": "s2",
                "name": "Nộp đơn & theo dõi",
                "order_index": 2,
                "requires_approval": False,
                "tasks": [
                    {
                        "key": "t3",
                        "title": "Nộp đơn hợp lệ",
                        "description": None,
                        "default_case_role": "EXECUTOR",
                        "sla_business_days": 2,
                        "complexity_weight": 2,
                        "requires_approval": True,
                        "triggers_milestone_order": None,
                        "depends_on": ["t2"]
                    },
                    {
                        "key": "t4",
                        "title": "Theo dõi thẩm định hình thức",
                        "description": None,
                        "default_case_role": "ASSISTANT",
                        "sla_business_days": 30,
                        "complexity_weight": 1,
                        "requires_approval": False,
                        "triggers_milestone_order": 2,
                        "depends_on": ["t3"]
                    }
                ]
            },
            {
                "key": "s3",
                "name": "Bàn giao & kết thúc",
                "order_index": 3,
                "requires_approval": True,
                "tasks": [
                    {
                        "key": "t5",
                        "title": "Nhận văn bằng bảo hộ",
                        "description": None,
                        "default_case_role": "EXECUTOR",
                        "sla_business_days": 5,
                        "complexity_weight": 2,
                        "requires_approval": True,
                        "triggers_milestone_order": None,
                        "depends_on": ["t4"]
                    },
                    {
                        "key": "t6",
                        "title": "Bàn giao văn bằng cho khách",
                        "description": None,
                        "default_case_role": "CASE_MANAGER",
                        "sla_business_days": 3,
                        "complexity_weight": 1,
                        "requires_approval": False,
                        "triggers_milestone_order": 3,
                        "depends_on": ["t5"]
                    }
                ]
            }
        ]
    }


async def create_template_and_get_draft(c: httpx.AsyncClient, matter_type_id: str, name: str, mode: str) -> tuple[str, str]:
    """Tạo template và trả về (template_id, draft_version_id)."""
    r = await c.post(
        "/api/v1/workflows/templates",
        json={"matter_type_id": matter_type_id, "name": name, "mode": mode},
        headers=csrf_headers(c)
    )
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert body["success"] is True
    data = body["data"]
    template_id = data["id"]
    draft_id = data.get("draft_version_id")
    if not draft_id:
        r_ver = await c.get(f"/api/v1/workflows/templates/{template_id}/versions")
        assert r_ver.status_code == 200, r_ver.text
        versions = r_ver.json()["data"]
        for v in versions:
            if v["status"] == "DRAFT":
                draft_id = v["id"]
                break
    assert draft_id is not None, f"Không tìm thấy draft_version_id cho template {template_id}"
    return template_id, draft_id


# ==============================================================================
# 1. DoD TSK-06: Tạo template 3 stage, 6 task, 2 trường động ở mỗi chế độ
# ==============================================================================

@pytest.mark.asyncio
async def test_dod_tsk06_strict_mode_create_tree_and_get():
    """DoD TSK-06: Tạo template STRICT, 2 trường động, 3 stage, 6 task; lưu và GET đúng cây."""
    with db() as conn:
        mt_id, mt_code, _ = create_test_matter_type(conn)

    async with client_for_role("ADMIN") as (c, admin):
        # 1. Cập nhật 2 trường động cho loại vụ việc
        custom_fields = [
            {"key": "application_no", "label": "Số đơn nhãn hiệu", "type": "text", "required": True},
            {"key": "trademark_type", "label": "Loại nhãn hiệu", "type": "select", "required": False, "options": ["Chữ", "Hình", "Kết hợp"]}
        ]
        r_cf = await c.put(
            f"/api/v1/workflows/matter-types/{mt_id}/custom-fields",
            json={"fields": custom_fields},
            headers=csrf_headers(c)
        )
        assert r_cf.status_code == 200, r_cf.text

        # 2. Tạo template STRICT
        template_id, draft_id = await create_template_and_get_draft(
            c, mt_id, name="Quy trình Nhãn hiệu Khung cứng", mode="STRICT"
        )

        # 3. PUT cây 3 stage, 6 task
        tree_payload = build_3_stage_6_task_tree()
        r_put = await c.put(
            f"/api/v1/workflows/versions/{draft_id}",
            json=tree_payload,
            headers=csrf_headers(c)
        )
        assert r_put.status_code == 200, r_put.text
        put_data = r_put.json()["data"]
        assert put_data["status"] == "DRAFT"
        assert len(put_data["stages"]) == 3

        # 4. GET /workflows/versions/{id} trả đúng cây
        r_get = await c.get(f"/api/v1/workflows/versions/{draft_id}")
        assert r_get.status_code == 200, r_get.text
        get_data = r_get.json()["data"]

        assert get_data["id"] == draft_id
        assert get_data["template_id"] == template_id
        assert get_data["version_no"] == 1
        assert get_data["status"] == "DRAFT"
        assert get_data["mode"] == "STRICT"

        stages = get_data["stages"]
        assert len(stages) == 3

        # Kiểm tra thứ tự và cấu trúc từng stage
        for idx, expected_stg in enumerate(tree_payload["stages"], start=1):
            stg = stages[idx - 1]
            assert stg["order_index"] == idx
            assert stg["name"] == expected_stg["name"]
            assert stg["requires_approval"] == expected_stg["requires_approval"]
            assert "key" in stg and len(stg["key"]) > 0

            tasks = stg["tasks"]
            assert len(tasks) == len(expected_stg["tasks"])
            for t_idx, expected_t in enumerate(expected_stg["tasks"]):
                t = tasks[t_idx]
                assert "key" in t and len(t["key"]) > 0
                assert t["title"] == expected_t["title"]
                assert t["default_case_role"] == expected_t["default_case_role"]
                assert t["sla_business_days"] == expected_t["sla_business_days"]
                assert t["complexity_weight"] == expected_t["complexity_weight"]
                assert t["requires_approval"] == expected_t["requires_approval"]
                assert t["triggers_milestone_order"] == expected_t["triggers_milestone_order"]
                # Phụ thuộc đã được ánh xạ đúng
                if expected_t["depends_on"]:
                    assert len(t["depends_on"]) == len(expected_t["depends_on"])


@pytest.mark.asyncio
async def test_dod_tsk06_flexible_mode_create_tree_and_get():
    """DoD TSK-06: Tạo template FLEXIBLE, 2 trường động, 3 stage, 6 task; lưu và GET đúng cây."""
    with db() as conn:
        mt_id, mt_code, _ = create_test_matter_type(conn)

    async with client_for_role("ADMIN") as (c, admin):
        custom_fields = [
            {"key": "filing_date", "label": "Ngày nộp đơn", "type": "date", "required": False},
            {"key": "is_accelerated", "label": "Thẩm định nhanh", "type": "boolean", "required": True}
        ]
        r_cf = await c.put(
            f"/api/v1/workflows/matter-types/{mt_id}/custom-fields",
            json={"fields": custom_fields},
            headers=csrf_headers(c)
        )
        assert r_cf.status_code == 200, r_cf.text

        template_id, draft_id = await create_template_and_get_draft(
            c, mt_id, name="Quy trình Nhãn hiệu Linh hoạt", mode="FLEXIBLE"
        )

        tree_payload = build_3_stage_6_task_tree()
        r_put = await c.put(
            f"/api/v1/workflows/versions/{draft_id}",
            json=tree_payload,
            headers=csrf_headers(c)
        )
        assert r_put.status_code == 200, r_put.text

        r_get = await c.get(f"/api/v1/workflows/versions/{draft_id}")
        assert r_get.status_code == 200, r_get.text
        get_data = r_get.json()["data"]
        assert get_data["mode"] == "FLEXIBLE"
        assert len(get_data["stages"]) == 3
        total_tasks = sum(len(stg["tasks"]) for stg in get_data["stages"])
        assert total_tasks == 6


# ==============================================================================
# 2. TC-WF-04: Bất biến phiên bản & vụ việc đang chạy giữ phiên bản cũ
# ==============================================================================

@pytest.mark.asyncio
async def test_tc_wf_04_template_versioning_and_case_immutability():
    """TC-WF-04: Phát hành bản 1; tạo vụ việc trỏ bản 1; tạo bản 2, sửa, phát hành.

    Kỳ vọng:
    - Bản 1 chuyển RETIRED.
    - Vụ việc vẫn trỏ bản 1.
    - Stage/task của bản 1 trong DB không đổi.
    - GET bản 1 trả đúng cây cũ (RETIRED); GET bản 2 trả cây mới (PUBLISHED).
    """
    with db() as conn:
        mt_id, mt_code, dept_id = create_test_matter_type(conn)
        client_id = create_test_client(conn)

    async with client_for_role("ADMIN") as (c, admin):
        # 1. Tạo template và nạp cây bản 1
        template_id, v1_id = await create_template_and_get_draft(
            c, mt_id, name="Quy trình Bất Biến TC-WF-04", mode="STRICT"
        )
        tree_v1 = build_3_stage_6_task_tree()
        r_put_v1 = await c.put(
            f"/api/v1/workflows/versions/{v1_id}",
            json=tree_v1,
            headers=csrf_headers(c)
        )
        assert r_put_v1.status_code == 200, r_put_v1.text

        # 2. Phát hành bản 1
        r_pub_v1 = await c.post(
            f"/api/v1/workflows/versions/{v1_id}/publish",
            headers=csrf_headers(c)
        )
        assert r_pub_v1.status_code == 200, r_pub_v1.text
        v1_published_data = r_pub_v1.json()["data"]
        assert v1_published_data["status"] == "PUBLISHED"

        # 3. Tạo vụ việc tham chiếu trực tiếp template_version_id = v1_id
        case_code = f"ASL-2099-{mt_code}-0001"
        with db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO cases (case_code, title, client_id, matter_type_id, department_id,
                                          template_version_id, workflow_mode, contract_value, status, created_by)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                    (case_code, "Vụ việc đang chạy bản v1", client_id, mt_id, dept_id,
                     v1_id, "STRICT", 50000000, "INITIALIZING", admin["id"])
                )
                case_id = str(cur.fetchone()[0])

        # Đếm số stage, task của bản 1 trong DB trước khi sửa v2
        with db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM template_stages WHERE template_version_id = %s", (v1_id,))
                v1_stages_count_before = cur.fetchone()[0]
                cur.execute(
                    """SELECT count(*) FROM template_tasks t
                       JOIN template_stages s ON t.template_stage_id = s.id
                       WHERE s.template_version_id = %s""", (v1_id,)
                )
                v1_tasks_count_before = cur.fetchone()[0]
        assert v1_stages_count_before == 3
        assert v1_tasks_count_before == 6

        # 4. Tạo bản 2 (sao chép từ bản 1 đã phát hành)
        r_new_ver = await c.post(
            f"/api/v1/workflows/templates/{template_id}/versions",
            headers=csrf_headers(c)
        )
        assert r_new_ver.status_code in (200, 201), r_new_ver.text
        v2_id = r_new_ver.json()["data"]["id"]
        assert r_new_ver.json()["data"]["version_no"] == 2
        assert r_new_ver.json()["data"]["status"] == "DRAFT"

        # 5. Sửa bản 2: thêm task thứ 7 vào stage 3
        tree_v2 = build_3_stage_6_task_tree()
        tree_v2["stages"][2]["tasks"].append({
            "key": "t7",
            "title": "Khảo sát mức độ hài lòng khách hàng",
            "description": "Nhiệm vụ mới bổ sung ở v2",
            "default_case_role": "CASE_MANAGER",
            "sla_business_days": 2,
            "complexity_weight": 1,
            "requires_approval": False,
            "triggers_milestone_order": None,
            "depends_on": ["t6"]
        })
        r_put_v2 = await c.put(
            f"/api/v1/workflows/versions/{v2_id}",
            json=tree_v2,
            headers=csrf_headers(c)
        )
        assert r_put_v2.status_code == 200, r_put_v2.text

        # 6. Phát hành bản 2
        r_pub_v2 = await c.post(
            f"/api/v1/workflows/versions/{v2_id}/publish",
            headers=csrf_headers(c)
        )
        assert r_pub_v2.status_code == 200, r_pub_v2.text

        # 7. Kiểm tra trạng thái và tính bất biến
        with db() as conn:
            with conn.cursor() as cur:
                # Bản 1 chuyển RETIRED
                cur.execute("SELECT status FROM workflow_template_versions WHERE id = %s", (v1_id,))
                assert cur.fetchone()[0] == "RETIRED"

                # Bản 2 là PUBLISHED
                cur.execute("SELECT status FROM workflow_template_versions WHERE id = %s", (v2_id,))
                assert cur.fetchone()[0] == "PUBLISHED"

                # Vụ việc vẫn trỏ bản 1
                cur.execute("SELECT template_version_id FROM cases WHERE id = %s", (case_id,))
                assert str(cur.fetchone()[0]) == v1_id

                # Số lượng stage/task của bản 1 hoàn toàn không đổi
                cur.execute("SELECT count(*) FROM template_stages WHERE template_version_id = %s", (v1_id,))
                assert cur.fetchone()[0] == v1_stages_count_before
                cur.execute(
                    """SELECT count(*) FROM template_tasks t
                       JOIN template_stages s ON t.template_stage_id = s.id
                       WHERE s.template_version_id = %s""", (v1_id,)
                )
                assert cur.fetchone()[0] == v1_tasks_count_before

        # GET bản 1 trả về RETIRED và vẫn giữ đúng 6 task
        r_get_v1 = await c.get(f"/api/v1/workflows/versions/{v1_id}")
        assert r_get_v1.status_code == 200
        data_v1 = r_get_v1.json()["data"]
        assert data_v1["status"] == "RETIRED"
        assert sum(len(s["tasks"]) for s in data_v1["stages"]) == 6

        # GET bản 2 trả về PUBLISHED và có 7 task
        r_get_v2 = await c.get(f"/api/v1/workflows/versions/{v2_id}")
        assert r_get_v2.status_code == 200
        data_v2 = r_get_v2.json()["data"]
        assert data_v2["status"] == "PUBLISHED"
        assert sum(len(s["tasks"]) for s in data_v2["stages"]) == 7


# ==============================================================================
# 3. Publish validations: Chu trình, phụ thuộc stage sau, stage rỗng, phát hành lại
# ==============================================================================

@pytest.mark.asyncio
async def test_publish_rejects_dependency_cycle():
    """Publish chặn: Chu trình phụ thuộc -> 422 DEPENDENCY_CYCLE kèm details.cycle."""
    with db() as conn:
        mt_id, _, _ = create_test_matter_type(conn)

    async with client_for_role("ADMIN") as (c, admin):
        _, draft_id = await create_template_and_get_draft(c, mt_id, "Quy trình Chu Trình", "STRICT")

        # Cây có chu trình 2 nút: t1 phụ thuộc t2, t2 phụ thuộc t1
        cycle_payload = {
            "stages": [
                {
                    "key": "s1",
                    "name": "Giai đoạn 1",
                    "order_index": 1,
                    "requires_approval": False,
                    "tasks": [
                        {"key": "t1", "title": "Nhiệm vụ 1", "default_case_role": "EXECUTOR", "sla_business_days": 1, "complexity_weight": 1, "requires_approval": False, "triggers_milestone_order": None, "depends_on": ["t2"]},
                        {"key": "t2", "title": "Nhiệm vụ 2", "default_case_role": "EXECUTOR", "sla_business_days": 1, "complexity_weight": 1, "requires_approval": False, "triggers_milestone_order": None, "depends_on": ["t1"]}
                    ]
                }
            ]
        }
        r_put = await c.put(f"/api/v1/workflows/versions/{draft_id}", json=cycle_payload, headers=csrf_headers(c))
        assert r_put.status_code == 200, r_put.text

        r_pub = await c.post(f"/api/v1/workflows/versions/{draft_id}/publish", headers=csrf_headers(c))
        assert r_pub.status_code == 422, r_pub.text
        assert error_code(r_pub) == "DEPENDENCY_CYCLE"
        cycle_details = r_pub.json()["error"]["details"].get("cycle")
        assert isinstance(cycle_details, list)
        assert "t1" in cycle_details and "t2" in cycle_details


@pytest.mark.asyncio
async def test_publish_rejects_forward_stage_dependency():
    """Publish chặn: Task ở stage trước phụ thuộc task ở stage sau -> 422 INVALID_DEPENDENCY."""
    with db() as conn:
        mt_id, _, _ = create_test_matter_type(conn)

    async with client_for_role("ADMIN") as (c, admin):
        _, draft_id = await create_template_and_get_draft(c, mt_id, "Quy trình Phụ Thuộc Stage Sau", "STRICT")

        # Stage 1 có t1 phụ thuộc t2 (t2 nằm ở Stage 2)
        invalid_dep_payload = {
            "stages": [
                {
                    "key": "s1",
                    "name": "Stage 1",
                    "order_index": 1,
                    "requires_approval": False,
                    "tasks": [
                        {"key": "t1", "title": "Nhiệm vụ Stage 1", "default_case_role": "EXECUTOR", "sla_business_days": 1, "complexity_weight": 1, "requires_approval": False, "triggers_milestone_order": None, "depends_on": ["t2"]}
                    ]
                },
                {
                    "key": "s2",
                    "name": "Stage 2",
                    "order_index": 2,
                    "requires_approval": False,
                    "tasks": [
                        {"key": "t2", "title": "Nhiệm vụ Stage 2", "default_case_role": "EXECUTOR", "sla_business_days": 1, "complexity_weight": 1, "requires_approval": False, "triggers_milestone_order": None, "depends_on": []}
                    ]
                }
            ]
        }
        r_put = await c.put(f"/api/v1/workflows/versions/{draft_id}", json=invalid_dep_payload, headers=csrf_headers(c))
        assert r_put.status_code == 200, r_put.text

        r_pub = await c.post(f"/api/v1/workflows/versions/{draft_id}/publish", headers=csrf_headers(c))
        assert r_pub.status_code == 422, r_pub.text
        assert error_code(r_pub) == "INVALID_DEPENDENCY"


@pytest.mark.asyncio
async def test_publish_rejects_empty_stage_or_no_stages():
    """Publish chặn: Stage không có task hoặc bản nháp không có stage nào."""
    with db() as conn:
        mt_id, _, _ = create_test_matter_type(conn)

    async with client_for_role("ADMIN") as (c, admin):
        # 1. Bản nháp không có stage nào
        _, draft_id1 = await create_template_and_get_draft(c, mt_id, "Quy trình Rỗng", "STRICT")
        r_pub1 = await c.post(f"/api/v1/workflows/versions/{draft_id1}/publish", headers=csrf_headers(c))
        assert r_pub1.status_code == 422, r_pub1.text

        # 2. Stage không có task nào
        with db() as conn:
            mt_id2, _, _ = create_test_matter_type(conn)
        _, draft_id2 = await create_template_and_get_draft(c, mt_id2, "Quy trình Stage Rỗng", "STRICT")
        empty_stage_payload = {
            "stages": [
                {
                    "key": "s1",
                    "name": "Stage Có Task",
                    "order_index": 1,
                    "requires_approval": False,
                    "tasks": [
                        {"key": "t1", "title": "T1", "default_case_role": "EXECUTOR", "sla_business_days": 1, "complexity_weight": 1, "requires_approval": False, "triggers_milestone_order": None, "depends_on": []}
                    ]
                },
                {
                    "key": "s2",
                    "name": "Stage Rỗng Task",
                    "order_index": 2,
                    "requires_approval": False,
                    "tasks": []
                }
            ]
        }
        r_put2 = await c.put(f"/api/v1/workflows/versions/{draft_id2}", json=empty_stage_payload, headers=csrf_headers(c))
        # Nếu PUT chặn stage rỗng thì 422 ngay lúc PUT, còn nếu PUT cho phép thì publish phải chặn 422
        if r_put2.status_code == 200:
            r_pub2 = await c.post(f"/api/v1/workflows/versions/{draft_id2}/publish", headers=csrf_headers(c))
            assert r_pub2.status_code == 422, r_pub2.text
        else:
            assert r_put2.status_code == 422


@pytest.mark.asyncio
async def test_publish_already_published_fails():
    """Phát hành lại bản đã phát hành -> 409 VERSION_NOT_DRAFT."""
    with db() as conn:
        mt_id, _, _ = create_test_matter_type(conn)

    async with client_for_role("ADMIN") as (c, admin):
        _, draft_id = await create_template_and_get_draft(c, mt_id, "Quy trình Đã Phát Hành", "STRICT")
        r_put = await c.put(
            f"/api/v1/workflows/versions/{draft_id}",
            json=build_3_stage_6_task_tree(),
            headers=csrf_headers(c)
        )
        assert r_put.status_code == 200

        # Lần 1: Thành công
        r_pub1 = await c.post(f"/api/v1/workflows/versions/{draft_id}/publish", headers=csrf_headers(c))
        assert r_pub1.status_code == 200

        # Lần 2: 409 VERSION_NOT_DRAFT
        r_pub2 = await c.post(f"/api/v1/workflows/versions/{draft_id}/publish", headers=csrf_headers(c))
        assert r_pub2.status_code == 409
        assert error_code(r_pub2) == "VERSION_NOT_DRAFT"


# ==============================================================================
# 4. PUT validations: Kiểm tra luật §3.3a, không sửa bản PUBLISHED, rollback
# ==============================================================================

@pytest.mark.asyncio
async def test_put_validations_section_3_3a():
    """PUT kiểm tra mọi luật §3.3a: 422 kèm details.fields."""
    with db() as conn:
        mt_id, _, _ = create_test_matter_type(conn)

    async with client_for_role("ADMIN") as (c, admin):
        _, draft_id = await create_template_and_get_draft(c, mt_id, "Kiểm Tra Validation", "STRICT")

        # 1. order_index không liên tục từ 1 (VD 1 và 3)
        bad_order = build_3_stage_6_task_tree()
        bad_order["stages"][1]["order_index"] = 3
        bad_order["stages"][2]["order_index"] = 4
        r = await c.put(f"/api/v1/workflows/versions/{draft_id}", json=bad_order, headers=csrf_headers(c))
        assert r.status_code == 422
        assert error_code(r) == "VALIDATION_ERROR"
        assert "fields" in r.json()["error"]["details"]

        # 2. Key stage trùng nhau
        dup_stage_key = build_3_stage_6_task_tree()
        dup_stage_key["stages"][1]["key"] = "s1"
        r = await c.put(f"/api/v1/workflows/versions/{draft_id}", json=dup_stage_key, headers=csrf_headers(c))
        assert r.status_code == 422
        assert error_code(r) == "VALIDATION_ERROR"

        # 3. Key task trùng nhau
        dup_task_key = build_3_stage_6_task_tree()
        dup_task_key["stages"][0]["tasks"][1]["key"] = "t1"
        r = await c.put(f"/api/v1/workflows/versions/{draft_id}", json=dup_task_key, headers=csrf_headers(c))
        assert r.status_code == 422
        assert error_code(r) == "VALIDATION_ERROR"

        # 4. sla_business_days <= 0
        bad_sla = build_3_stage_6_task_tree()
        bad_sla["stages"][0]["tasks"][0]["sla_business_days"] = 0
        r = await c.put(f"/api/v1/workflows/versions/{draft_id}", json=bad_sla, headers=csrf_headers(c))
        assert r.status_code == 422
        assert error_code(r) == "VALIDATION_ERROR"

        # 5. complexity_weight ngoài 1..4 (VD 5)
        bad_weight = build_3_stage_6_task_tree()
        bad_weight["stages"][0]["tasks"][0]["complexity_weight"] = 5
        r = await c.put(f"/api/v1/workflows/versions/{draft_id}", json=bad_weight, headers=csrf_headers(c))
        assert r.status_code == 422
        assert error_code(r) == "VALIDATION_ERROR"

        # 6. depends_on trỏ tới key không tồn tại
        bad_dep = build_3_stage_6_task_tree()
        bad_dep["stages"][0]["tasks"][0]["depends_on"] = ["t_non_existent"]
        r = await c.put(f"/api/v1/workflows/versions/{draft_id}", json=bad_dep, headers=csrf_headers(c))
        assert r.status_code == 422
        assert error_code(r) == "VALIDATION_ERROR"

        # 7. Tự phụ thuộc chính nó
        self_dep = build_3_stage_6_task_tree()
        self_dep["stages"][0]["tasks"][0]["depends_on"] = ["t1"]
        r = await c.put(f"/api/v1/workflows/versions/{draft_id}", json=self_dep, headers=csrf_headers(c))
        assert r.status_code == 422
        assert error_code(r) == "VALIDATION_ERROR"

        # 8. triggers_milestone_order trùng nhau hoặc < 1
        dup_milestone = build_3_stage_6_task_tree()
        dup_milestone["stages"][1]["tasks"][1]["triggers_milestone_order"] = 1  # Trùng với t2
        r = await c.put(f"/api/v1/workflows/versions/{draft_id}", json=dup_milestone, headers=csrf_headers(c))
        assert r.status_code == 422
        assert error_code(r) == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_put_on_published_version_fails():
    """PUT vào bản PUBLISHED -> 409 VERSION_NOT_DRAFT."""
    with db() as conn:
        mt_id, _, _ = create_test_matter_type(conn)

    async with client_for_role("ADMIN") as (c, admin):
        _, draft_id = await create_template_and_get_draft(c, mt_id, "Quy trình Khoá Sau Publish", "STRICT")
        r_put = await c.put(f"/api/v1/workflows/versions/{draft_id}", json=build_3_stage_6_task_tree(), headers=csrf_headers(c))
        assert r_put.status_code == 200

        r_pub = await c.post(f"/api/v1/workflows/versions/{draft_id}/publish", headers=csrf_headers(c))
        assert r_pub.status_code == 200

        # Thử PUT lại bản đã publish
        r_put_again = await c.put(f"/api/v1/workflows/versions/{draft_id}", json=build_3_stage_6_task_tree(), headers=csrf_headers(c))
        assert r_put_again.status_code == 409
        assert error_code(r_put_again) == "VERSION_NOT_DRAFT"


@pytest.mark.asyncio
async def test_put_transaction_rollback_on_failure():
    """Lỗi giữa chừng khi PUT không để lại dữ liệu nửa vời (Rollback toàn bộ)."""
    with db() as conn:
        mt_id, _, _ = create_test_matter_type(conn)

    async with client_for_role("ADMIN") as (c, admin):
        _, draft_id = await create_template_and_get_draft(c, mt_id, "Quy trình Rollback", "STRICT")

        # Lưu bản hợp lệ ban đầu
        initial_tree = build_3_stage_6_task_tree()
        r_init = await c.put(f"/api/v1/workflows/versions/{draft_id}", json=initial_tree, headers=csrf_headers(c))
        assert r_init.status_code == 200

        # Gửi bản cập nhật lỗi ở stage 2 (VD sla_business_days = -5)
        broken_tree = build_3_stage_6_task_tree()
        broken_tree["stages"][1]["tasks"][0]["sla_business_days"] = -5
        r_fail = await c.put(f"/api/v1/workflows/versions/{draft_id}", json=broken_tree, headers=csrf_headers(c))
        assert r_fail.status_code == 422

        # Kiểm tra GET lại vẫn nguyên vẹn 3 stage và 6 task ban đầu, không bị xoá mất
        r_get = await c.get(f"/api/v1/workflows/versions/{draft_id}")
        assert r_get.status_code == 200
        data = r_get.json()["data"]
        assert len(data["stages"]) == 3
        assert sum(len(s["tasks"]) for s in data["stages"]) == 6


# ==============================================================================
# 5. ACTIVE_TEMPLATE_EXISTS, DRAFT_VERSION_EXISTS & Sao chép sâu
# ==============================================================================

@pytest.mark.asyncio
async def test_active_template_exists_conflict():
    """Loại vụ việc đã có template active -> 409 ACTIVE_TEMPLATE_EXISTS."""
    with db() as conn:
        mt_id, _, _ = create_test_matter_type(conn)

    async with client_for_role("ADMIN") as (c, admin):
        # Template 1: Thành công
        r1 = await c.post(
            "/api/v1/workflows/templates",
            json={"matter_type_id": mt_id, "name": "Template Thứ Nhất", "mode": "STRICT"},
            headers=csrf_headers(c)
        )
        assert r1.status_code in (200, 201)

        # Template 2 cùng matter_type_id: 409 ACTIVE_TEMPLATE_EXISTS
        r2 = await c.post(
            "/api/v1/workflows/templates",
            json={"matter_type_id": mt_id, "name": "Template Thứ Hai", "mode": "STRICT"},
            headers=csrf_headers(c)
        )
        assert r2.status_code == 409
        assert error_code(r2) == "ACTIVE_TEMPLATE_EXISTS"


@pytest.mark.asyncio
async def test_draft_version_exists_conflict():
    """Template đã có một phiên bản DRAFT -> 409 DRAFT_VERSION_EXISTS."""
    with db() as conn:
        mt_id, _, _ = create_test_matter_type(conn)

    async with client_for_role("ADMIN") as (c, admin):
        template_id, _ = await create_template_and_get_draft(c, mt_id, "Template Trùng Draft", "STRICT")

        # Đã có draft version 1, tạo thêm draft version nữa -> 409
        r = await c.post(f"/api/v1/workflows/templates/{template_id}/versions", headers=csrf_headers(c))
        assert r.status_code == 409
        assert error_code(r) == "DRAFT_VERSION_EXISTS"


@pytest.mark.asyncio
async def test_new_version_deep_copies_published_tree():
    """Bản mới sao chép sâu toàn bộ cây của bản phát hành mới nhất."""
    with db() as conn:
        mt_id, _, _ = create_test_matter_type(conn)

    async with client_for_role("ADMIN") as (c, admin):
        template_id, v1_id = await create_template_and_get_draft(c, mt_id, "Template Sao Chép Sâu", "STRICT")
        r_put = await c.put(f"/api/v1/workflows/versions/{v1_id}", json=build_3_stage_6_task_tree(), headers=csrf_headers(c))
        assert r_put.status_code == 200

        r_pub = await c.post(f"/api/v1/workflows/versions/{v1_id}/publish", headers=csrf_headers(c))
        assert r_pub.status_code == 200

        # Tạo bản v2
        r_v2 = await c.post(f"/api/v1/workflows/templates/{template_id}/versions", headers=csrf_headers(c))
        assert r_v2.status_code in (200, 201)
        v2_id = r_v2.json()["data"]["id"]

        # Kiểm tra GET bản v2
        r_get_v2 = await c.get(f"/api/v1/workflows/versions/{v2_id}")
        assert r_get_v2.status_code == 200
        v2_data = r_get_v2.json()["data"]
        assert v2_data["version_no"] == 2
        assert v2_data["status"] == "DRAFT"
        assert len(v2_data["stages"]) == 3
        assert sum(len(s["tasks"]) for s in v2_data["stages"]) == 6

        # Kiểm tra trong DB: Các bản ghi v2 phải có UUID riêng, không trỏ ngược lại ID của v1
        with db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM template_stages WHERE template_version_id = %s", (v1_id,))
                v1_stage_ids = {str(r[0]) for r in cur.fetchall()}

                cur.execute("SELECT id FROM template_stages WHERE template_version_id = %s", (v2_id,))
                v2_stage_ids = {str(r[0]) for r in cur.fetchall()}

                assert v1_stage_ids.isdisjoint(v2_stage_ids), "Stage ID của v2 phải mới hoàn toàn"


# ==============================================================================
# 6. services/workflow_graph.py: Test thuần (không DB)
# ==============================================================================

def _get_workflow_graph_module():
    import backend.app.services.workflow_graph as wg
    return wg


def test_workflow_graph_no_cycle_pure():
    """Test thuần: Đồ thị hợp lệ không có chu trình."""
    wg = _get_workflow_graph_module()
    # Tuỳ theo hàm thuần mà coder hiện thực hoá (find_cycle, detect_cycle, validate_dependencies, ...)
    deps = {
        "t1": [],
        "t2": ["t1"],
        "t3": ["t2"],
        "t4": ["t3"]
    }
    if hasattr(wg, "find_cycle"):
        assert wg.find_cycle(deps) is None or wg.find_cycle(deps) == []
    elif hasattr(wg, "detect_cycle"):
        assert wg.detect_cycle(deps) is None or wg.detect_cycle(deps) == []
    elif hasattr(wg, "validate_graph"):
        is_valid, _ = wg.validate_graph(deps)
        assert is_valid is True


def test_workflow_graph_cycle_2_nodes_pure():
    """Test thuần: Chu trình 2 nút (t1 <-> t2)."""
    wg = _get_workflow_graph_module()
    deps = {
        "t1": ["t2"],
        "t2": ["t1"]
    }
    cycle = None
    if hasattr(wg, "find_cycle"):
        cycle = wg.find_cycle(deps)
    elif hasattr(wg, "detect_cycle"):
        cycle = wg.detect_cycle(deps)
    elif hasattr(wg, "validate_graph"):
        is_valid, cycle = wg.validate_graph(deps)
        assert is_valid is False

    assert cycle is not None
    assert "t1" in cycle and "t2" in cycle


def test_workflow_graph_cycle_3_nodes_pure():
    """Test thuần: Chu trình 3 nút (t1 -> t2 -> t3 -> t1)."""
    wg = _get_workflow_graph_module()
    deps = {
        "t1": ["t3"],
        "t2": ["t1"],
        "t3": ["t2"]
    }
    cycle = None
    if hasattr(wg, "find_cycle"):
        cycle = wg.find_cycle(deps)
    elif hasattr(wg, "detect_cycle"):
        cycle = wg.detect_cycle(deps)
    elif hasattr(wg, "validate_graph"):
        is_valid, cycle = wg.validate_graph(deps)
        assert is_valid is False

    assert cycle is not None
    assert len(cycle) >= 3


def test_workflow_graph_self_dependency_pure():
    """Test thuần: Tự phụ thuộc (t1 -> t1)."""
    wg = _get_workflow_graph_module()
    deps = {
        "t1": ["t1"]
    }
    cycle = None
    if hasattr(wg, "find_cycle"):
        cycle = wg.find_cycle(deps)
    elif hasattr(wg, "detect_cycle"):
        cycle = wg.detect_cycle(deps)
    elif hasattr(wg, "validate_graph"):
        is_valid, cycle = wg.validate_graph(deps)
        assert is_valid is False

    assert cycle is not None


def test_workflow_graph_forward_stage_dependency_pure():
    """Test thuần: Task ở stage trước phụ thuộc task ở stage sau."""
    wg = _get_workflow_graph_module()
    stages = [
        {"key": "s1", "order_index": 1, "tasks": [{"key": "t1", "depends_on": ["t2"]}]},
        {"key": "s2", "order_index": 2, "tasks": [{"key": "t2", "depends_on": []}]}
    ]
    # Kiểm tra hàm kiểm tra phụ thuộc stage
    for fn_name in ("validate_stage_order", "validate_stage_dependencies", "validate_workflow_graph", "check_invalid_dependencies"):
        if hasattr(wg, fn_name):
            fn = getattr(wg, fn_name)
            try:
                res = fn(stages)
                if isinstance(res, tuple):
                    assert res[0] is False or res[1] == "INVALID_DEPENDENCY"
                elif isinstance(res, bool):
                    assert res is False
            except Exception as e:
                # Nếu ném ngoại lệ AppException INVALID_DEPENDENCY
                assert "INVALID_DEPENDENCY" in str(e)
            break


# ==============================================================================
# 7. Trường động, Ngày nghỉ lễ & Nhật ký kiểm toán (Audit Logs)
# ==============================================================================

@pytest.mark.asyncio
async def test_custom_fields_schema_crud_and_audit():
    """Trường động: Kiểm tra theo §3.3a và ghi audit CUSTOM_FIELDS_UPDATED."""
    with db() as conn:
        mt_id, _, _ = create_test_matter_type(conn)

    async with client_for_role("ADMIN") as (c, admin):
        # 1. Hợp lệ
        valid_fields = [
            {"key": "client_ref_no", "label": "Mã hồ sơ khách hàng", "type": "text", "required": False},
            {"key": "filing_type", "label": "Hình thức nộp", "type": "select", "required": True, "options": ["Trực tiếp", "Trực tuyến"]}
        ]
        r = await c.put(
            f"/api/v1/workflows/matter-types/{mt_id}/custom-fields",
            json={"fields": valid_fields},
            headers=csrf_headers(c)
        )
        assert r.status_code == 200, r.text

        # Kiểm tra DB
        with db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT custom_fields_schema FROM matter_types WHERE id = %s", (mt_id,))
                saved = cur.fetchone()[0]
                assert len(saved) == 2

                # Kiểm tra audit log
                cur.execute(
                    """SELECT action, entity_name, entity_id FROM audit_logs
                       WHERE action = 'CUSTOM_FIELDS_UPDATED' AND entity_id = %s""",
                    (mt_id,)
                )
                audit_row = cur.fetchone()
                assert audit_row is not None, "Thiếu audit log CUSTOM_FIELDS_UPDATED"

        # 2. Key không phải snake_case -> 422
        r_bad_key = await c.put(
            f"/api/v1/workflows/matter-types/{mt_id}/custom-fields",
            json={"fields": [{"key": "Invalid-Key-Not-Snake", "label": "Lỗi", "type": "text", "required": False}]},
            headers=csrf_headers(c)
        )
        assert r_bad_key.status_code == 422

        # 3. Select nhưng không có options -> 422
        r_no_opts = await c.put(
            f"/api/v1/workflows/matter-types/{mt_id}/custom-fields",
            json={"fields": [{"key": "bad_select", "label": "Lỗi Select", "type": "select", "required": False, "options": []}]},
            headers=csrf_headers(c)
        )
        assert r_no_opts.status_code == 422

        # 4. Trùng key -> 422
        r_dup = await c.put(
            f"/api/v1/workflows/matter-types/{mt_id}/custom-fields",
            json={"fields": [
                {"key": "same_key", "label": "1", "type": "text", "required": False},
                {"key": "same_key", "label": "2", "type": "text", "required": False}
            ]},
            headers=csrf_headers(c)
        )
        assert r_dup.status_code == 422


@pytest.mark.asyncio
async def test_holidays_crud_and_validations():
    """Ngày nghỉ: PUT thay toàn bộ ngày của năm (xa 2099), GET theo năm, chặn ngoài năm & trùng."""
    test_year = 2099
    async with client_for_role("ADMIN") as (c, admin):
        # 1. Lưu 2 ngày nghỉ hợp lệ cho năm 2099
        days_payload = {
            "year": test_year,
            "days": [
                {"date": "2099-01-01", "name": "Tết Dương Lịch 2099"},
                {"date": "2099-05-01", "name": "Quốc Tế Lao Động 2099"}
            ]
        }
        r_put = await c.put("/api/v1/settings/holidays", json=days_payload, headers=csrf_headers(c))
        assert r_put.status_code == 200, r_put.text

        # 2. GET /settings/holidays?year=2099
        r_get = await c.get(f"/api/v1/settings/holidays?year={test_year}")
        assert r_get.status_code == 200, r_get.text
        get_data = r_get.json()["data"]
        assert get_data["year"] == test_year
        assert len(get_data["days"]) == 2

        # 3. Chặn ngày ngoài năm -> 422
        bad_year_payload = {
            "year": test_year,
            "days": [
                {"date": "2098-12-31", "name": "Ngày Năm Cũ"}
            ]
        }
        r_bad_year = await c.put("/api/v1/settings/holidays", json=bad_year_payload, headers=csrf_headers(c))
        assert r_bad_year.status_code == 422

        # 4. Chặn trùng ngày -> 422
        dup_date_payload = {
            "year": test_year,
            "days": [
                {"date": "2099-09-02", "name": "Quốc Khánh"},
                {"date": "2099-09-02", "name": "Quốc Khánh Trùng"}
            ]
        }
        r_dup = await c.put("/api/v1/settings/holidays", json=dup_date_payload, headers=csrf_headers(c))
        assert r_dup.status_code == 422

        # 5. Thay thế toàn bộ: Cập nhật lại chỉ 1 ngày duy nhất
        replace_payload = {
            "year": test_year,
            "days": [
                {"date": "2099-09-02", "name": "Quốc Khánh 2099"}
            ]
        }
        r_replace = await c.put("/api/v1/settings/holidays", json=replace_payload, headers=csrf_headers(c))
        assert r_replace.status_code == 200
        r_get2 = await c.get(f"/api/v1/settings/holidays?year={test_year}")
        assert len(r_get2.json()["data"]["days"]) == 1


@pytest.mark.asyncio
async def test_audit_log_workflow_published():
    """Publish ghi nhật ký kiểm toán WORKFLOW_PUBLISHED kèm version_no, số stage/task."""
    with db() as conn:
        mt_id, _, _ = create_test_matter_type(conn)

    async with client_for_role("ADMIN") as (c, admin):
        _, draft_id = await create_template_and_get_draft(c, mt_id, "Template Audit Log", "STRICT")
        r_put = await c.put(f"/api/v1/workflows/versions/{draft_id}", json=build_3_stage_6_task_tree(), headers=csrf_headers(c))
        assert r_put.status_code == 200

        r_pub = await c.post(f"/api/v1/workflows/versions/{draft_id}/publish", headers=csrf_headers(c))
        assert r_pub.status_code == 200

        with db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT action, entity_id, after_state FROM audit_logs
                       WHERE action = 'WORKFLOW_PUBLISHED' AND entity_id = %s""",
                    (draft_id,)
                )
                row = cur.fetchone()
                assert row is not None, "Không tìm thấy audit log WORKFLOW_PUBLISHED"
                after_state = row[2]
                assert after_state["version_no"] == 1
                # Có ghi nhận số lượng stage / task
                assert any(k in after_state for k in ("stages_count", "tasks_count", "total_stages", "total_tasks"))


# ==============================================================================
# 8. Phân quyền: MANAGER đọc được / ghi 403; ATTORNEY 403; thiếu CSRF 403
# ==============================================================================

@pytest.mark.asyncio
async def test_permissions_manager_can_read_cannot_write():
    """Quyền: MANAGER đọc được (200), mọi thao tác ghi bị chặn (403 FORBIDDEN_ROLE)."""
    with db() as conn:
        mt_id, _, _ = create_test_matter_type(conn)

    # Dùng ADMIN để tạo sẵn dữ liệu
    async with client_for_role("ADMIN") as (c_admin, admin):
        t_id, draft_id = await create_template_and_get_draft(c_admin, mt_id, "Template Phân Quyền", "STRICT")
        await c_admin.put(f"/api/v1/workflows/versions/{draft_id}", json=build_3_stage_6_task_tree(), headers=csrf_headers(c_admin))

    # Đăng nhập bằng MANAGER
    async with client_for_role("MANAGER") as (c_mgr, mgr):
        # Đọc được: GET templates, GET versions, GET version detail, GET holidays
        r_t = await c_mgr.get(f"/api/v1/workflows/templates?matter_type_id={mt_id}")
        assert r_t.status_code == 200

        r_v = await c_mgr.get(f"/api/v1/workflows/templates/{t_id}/versions")
        assert r_v.status_code == 200

        r_detail = await c_mgr.get(f"/api/v1/workflows/versions/{draft_id}")
        assert r_detail.status_code == 200

        r_hol = await c_mgr.get("/api/v1/settings/holidays?year=2099")
        assert r_hol.status_code == 200

        # Ghi bị chặn 403 FORBIDDEN_ROLE
        r_post_t = await c_mgr.post(
            "/api/v1/workflows/templates",
            json={"matter_type_id": mt_id, "name": "Mgr Create", "mode": "STRICT"},
            headers=csrf_headers(c_mgr)
        )
        assert r_post_t.status_code == 403
        assert error_code(r_post_t) == "FORBIDDEN_ROLE"

        r_put_v = await c_mgr.put(
            f"/api/v1/workflows/versions/{draft_id}",
            json=build_3_stage_6_task_tree(),
            headers=csrf_headers(c_mgr)
        )
        assert r_put_v.status_code == 403
        assert error_code(r_put_v) == "FORBIDDEN_ROLE"

        r_pub = await c_mgr.post(
            f"/api/v1/workflows/versions/{draft_id}/publish",
            headers=csrf_headers(c_mgr)
        )
        assert r_pub.status_code == 403
        assert error_code(r_pub) == "FORBIDDEN_ROLE"

        r_cf = await c_mgr.put(
            f"/api/v1/workflows/matter-types/{mt_id}/custom-fields",
            json={"fields": []},
            headers=csrf_headers(c_mgr)
        )
        assert r_cf.status_code == 403
        assert error_code(r_cf) == "FORBIDDEN_ROLE"

        r_hol_put = await c_mgr.put(
            "/api/v1/settings/holidays",
            json={"year": 2099, "days": []},
            headers=csrf_headers(c_mgr)
        )
        assert r_hol_put.status_code == 403
        assert error_code(r_hol_put) == "FORBIDDEN_ROLE"


@pytest.mark.asyncio
async def test_permissions_attorney_denied_all():
    """Quyền: ATTORNEY bị chặn cả đọc lẫn ghi (403 FORBIDDEN_ROLE)."""
    with db() as conn:
        mt_id, _, _ = create_test_matter_type(conn)

    async with client_for_role("ATTORNEY") as (c_atty, atty):
        # Đọc bị chặn
        r_t = await c_atty.get(f"/api/v1/workflows/templates?matter_type_id={mt_id}")
        assert r_t.status_code == 403
        assert error_code(r_t) == "FORBIDDEN_ROLE"

        # Ghi bị chặn
        r_post = await c_atty.post(
            "/api/v1/workflows/templates",
            json={"matter_type_id": mt_id, "name": "Atty Create", "mode": "STRICT"},
            headers=csrf_headers(c_atty)
        )
        assert r_post.status_code == 403
        assert error_code(r_post) == "FORBIDDEN_ROLE"


@pytest.mark.asyncio
async def test_write_endpoints_require_csrf():
    """Bảo mật: Mọi thao tác ghi yêu cầu X-CSRF-Token khớp cookie csrf_token -> thiếu bị 403 CSRF_INVALID."""
    with db() as conn:
        mt_id, _, _ = create_test_matter_type(conn)

    # Đăng nhập ADMIN nhưng không gửi header X-CSRF-Token
    u = make_user(role="ADMIN")
    async with client() as c:
        await login(c, u["email"])

        # POST template thiếu header X-CSRF-Token
        r_post = await c.post(
            "/api/v1/workflows/templates",
            json={"matter_type_id": mt_id, "name": "Thiếu CSRF", "mode": "STRICT"}
            # Không gửi csrf_headers
        )
        assert r_post.status_code == 403
        assert error_code(r_post) == "CSRF_INVALID"

        # PUT holidays thiếu header X-CSRF-Token
        r_hol = await c.put(
            "/api/v1/settings/holidays",
            json={"year": 2099, "days": []}
            # Không gửi csrf_headers
        )
        assert r_hol.status_code == 403
        assert error_code(r_hol) == "CSRF_INVALID"
