"""Nghiệm thu: danh sách & tạo cơ hội (GET/POST /crm/opportunities) và đồng bộ nút Case sang Neo4j khi chuyển đổi.

Hợp đồng: docs/07-api-contracts.md §1.2, §3.3 (GET/POST /crm/opportunities, convert — đoạn Neo4j);
máy trạng thái docs/12-business-rules.md §1.1.
"""
import os
import uuid

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/12")
os.environ.setdefault("DATA_ENCRYPTION_MASTER_KEY", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")

import pytest
from neo4j import GraphDatabase

from backend.app.core.config import settings
from backend.tests.test_opportunity_conversion import (  # noqa: F401  (clean_redis là fixture autouse)
    clean_redis,
    db,
    authenticated_client,
    make_user,
    csrf,
    error_code,
    make_client_record,
    make_opportunity_record,
    make_department,
    make_matter_type,
    make_workflow_template,
    make_template_version,
    make_template_stages_and_tasks,
)

BASE = "/api/v1/crm/opportunities"


def neo4j_driver():
    return GraphDatabase.driver(settings.NEO4J_URI, auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD))


def neo4j_kwargs():
    name = settings.NEO4J_DATABASE
    return {"database": name} if name and name != "neo4j" else {}


def ok_list(resp):
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["success"] is True, body
    assert isinstance(body["data"], list), "data phải là mảng (docs/07 §1.2)"
    meta = body["meta"]
    for k in ("page", "limit", "total_records", "total_pages"):
        assert k in meta, f"meta thiếu {k}"
    return body["data"], meta


# ---------------------------------------------------------------- GET

@pytest.mark.asyncio
async def test_attorney_sees_only_own_opportunities():
    c, me = await authenticated_client("ATTORNEY")
    other = make_user("ATTORNEY")
    cid = make_client_record(me["id"])
    mine = {make_opportunity_record(cid, me["id"], title=f"Cơ hội của tôi {i}") for i in range(3)}
    theirs = make_opportunity_record(cid, other["id"], title="Cơ hội người khác")

    data, meta = ok_list(await c.get(BASE, params={"client_id": cid, "limit": 100}))
    ids = {o["id"] for o in data}
    assert ids == mine, "Luật sư chỉ thấy cơ hội do mình mang về"
    assert theirs not in ids
    assert meta["total_records"] == 3
    row = data[0]
    for k in ("client_id", "client_name", "title", "lead_source", "expected_value", "probability_pct", "stage",
              "lost_reason", "originator_id", "originator_name", "converted_case_id", "created_at", "updated_at"):
        assert k in row, f"thiếu trường {k}"
    assert isinstance(row["expected_value"], str)
    assert row["client_name"].startswith("Công ty Cổ phần Test")


@pytest.mark.asyncio
async def test_manager_sees_all_and_filters_by_stage():
    c, _ = await authenticated_client("MANAGER")
    a1, a2 = make_user("ATTORNEY"), make_user("ATTORNEY")
    cid = make_client_record(a1["id"])
    o_new = make_opportunity_record(cid, a1["id"], stage="NEW_LEAD")
    o_neg = make_opportunity_record(cid, a2["id"], stage="NEGOTIATION")

    data, meta = ok_list(await c.get(BASE, params={"client_id": cid}))
    assert {o["id"] for o in data} == {o_new, o_neg}

    data, _ = ok_list(await c.get(BASE, params={"client_id": cid, "stage": "NEGOTIATION"}))
    assert [o["id"] for o in data] == [o_neg]


@pytest.mark.asyncio
async def test_pagination_and_order():
    c, me = await authenticated_client("ATTORNEY")
    cid = make_client_record(me["id"])
    ids = [make_opportunity_record(cid, me["id"], title=f"Trang {i}") for i in range(5)]
    with db() as conn:  # thứ tự cập nhật xác định: ids[4] mới nhất
        for i, oid in enumerate(ids):
            conn.execute("UPDATE opportunities SET updated_at = NOW() - make_interval(mins => %s) WHERE id = %s",
                         (10 - i, oid))

    p1, meta = ok_list(await c.get(BASE, params={"client_id": cid, "limit": 2, "page": 1}))
    p3, _ = ok_list(await c.get(BASE, params={"client_id": cid, "limit": 2, "page": 3}))
    assert [o["id"] for o in p1] == [ids[4], ids[3]]
    assert [o["id"] for o in p3] == [ids[0]]
    assert meta == {**meta, "page": 1, "limit": 2, "total_records": 5, "total_pages": 3}


@pytest.mark.asyncio
async def test_search_is_accent_insensitive():
    c, me = await authenticated_client("ATTORNEY")
    cid = make_client_record(me["id"])
    hit = make_opportunity_record(cid, me["id"], title="Đăng ký Nhãn hiệu Hoa Sen")
    make_opportunity_record(cid, me["id"], title="Tư vấn thành lập doanh nghiệp")
    data, _ = ok_list(await c.get(BASE, params={"client_id": cid, "q": "nhan hieu hoa sen"}))
    assert [o["id"] for o in data] == [hit]


@pytest.mark.asyncio
@pytest.mark.parametrize("params", [{"stage": "DONE"}, {"client_id": "abc"}, {"page": 0}, {"limit": 101}])
async def test_list_invalid_params(params):
    c, _ = await authenticated_client("MANAGER")
    resp = await c.get(BASE, params=params)
    assert resp.status_code == 422, resp.text
    assert error_code(resp) == "VALIDATION_ERROR"


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["ACCOUNTANT", "ADMIN"])
async def test_list_forbidden_roles(role):
    c, _ = await authenticated_client(role)
    resp = await c.get(BASE)
    assert resp.status_code == 403
    assert error_code(resp) == "FORBIDDEN_ROLE"


# ---------------------------------------------------------------- POST

def payload(cid, **kw):
    return {"client_id": cid, "title": "Đăng ký nhãn hiệu ASL GATE", "lead_source": "REFERRAL",
            "expected_value": "150000000", "probability_pct": 40, **kw}


@pytest.mark.asyncio
async def test_attorney_creates_opportunity_new_lead_with_audit():
    c, me = await authenticated_client("ATTORNEY")
    cid = make_client_record(me["id"])
    resp = await c.post(BASE, json=payload(cid, stage="WON"), headers=csrf(c))
    assert resp.status_code == 201, resp.text
    d = resp.json()["data"]
    assert d["stage"] == "NEW_LEAD", "cơ hội mới luôn ở NEW_LEAD"
    assert d["originator_id"] == me["id"]
    assert d["expected_value"] in ("150000000", "150000000.00")
    assert d["client_name"].startswith("Công ty Cổ phần Test")
    with db() as conn:
        row = conn.execute("SELECT stage, originator_id, expected_value FROM opportunities WHERE id = %s",
                           (d["id"],)).fetchone()
        assert row is not None and row[0] == "NEW_LEAD" and str(row[1]) == me["id"]
        n = conn.execute("SELECT count(*) FROM audit_logs WHERE action = 'OPPORTUNITY_CREATED' AND entity_id = %s",
                         (d["id"],)).fetchone()[0]
        assert n == 1
    data, _ = ok_list(await c.get(BASE, params={"client_id": cid}))
    assert [o["id"] for o in data] == [d["id"]], "cơ hội vừa tạo hiện trong danh sách"


@pytest.mark.asyncio
async def test_originator_rules():
    att, me = await authenticated_client("ATTORNEY")
    other = make_user("ATTORNEY")
    cid = make_client_record(me["id"])
    resp = await att.post(BASE, json=payload(cid, originator_id=other["id"]), headers=csrf(att))
    assert resp.status_code == 403 and error_code(resp) == "FORBIDDEN_ROLE"

    mgr, _ = await authenticated_client("MANAGER")
    resp = await mgr.post(BASE, json=payload(cid, originator_id=other["id"]), headers=csrf(mgr))
    assert resp.status_code == 201, resp.text
    assert resp.json()["data"]["originator_id"] == other["id"]

    inactive = make_user("ATTORNEY", is_active=False)
    for bad in (inactive["id"], str(uuid.uuid4())):
        resp = await mgr.post(BASE, json=payload(cid, originator_id=bad), headers=csrf(mgr))
        assert resp.status_code == 422 and error_code(resp) == "VALIDATION_ERROR", resp.text


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", [{"title": "   "}, {"title": "x" * 256}, {"lead_source": "TIKTOK"},
                                 {"expected_value": "-1"}, {"probability_pct": 101}])
async def test_create_validation(bad):
    c, me = await authenticated_client("ATTORNEY")
    cid = make_client_record(me["id"])
    resp = await c.post(BASE, json=payload(cid, **bad), headers=csrf(c))
    assert resp.status_code == 422, resp.text
    assert error_code(resp) == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_create_unknown_client_csrf_and_role():
    c, _ = await authenticated_client("ATTORNEY")
    resp = await c.post(BASE, json=payload(str(uuid.uuid4())), headers=csrf(c))
    assert resp.status_code == 404 and error_code(resp) == "NOT_FOUND"

    cid = make_client_record(None)
    resp = await c.post(BASE, json=payload(cid))  # thiếu X-CSRF-Token
    assert resp.status_code == 403 and error_code(resp) == "CSRF_INVALID"

    acc, _ = await authenticated_client("ACCOUNTANT")
    resp = await acc.post(BASE, json=payload(cid), headers=csrf(acc))
    assert resp.status_code == 403 and error_code(resp) == "FORBIDDEN_ROLE"


# ---------------------------------------------------------------- convert → Neo4j

@pytest.mark.asyncio
async def test_convert_creates_case_node_in_neo4j_immediately():
    c, me = await authenticated_client("ATTORNEY")
    cid = make_client_record(me["id"])
    opp = make_opportunity_record(cid, me["id"], stage="WON")
    mid = make_matter_type(department_id=make_department())
    v_id = make_template_version(make_workflow_template(mid), version_no=1, status="PUBLISHED")
    make_template_stages_and_tasks(v_id)

    resp = await c.post(f"{BASE}/{opp}/convert", headers={"Idempotency-Key": str(uuid.uuid4()), **csrf(c)},
                        json={"matter_type_id": mid, "title": "Vụ việc kiểm thử đồ thị", "contract_value": "1000000",
                              "milestones": [{"name": "Đợt 1", "amount": "1000000"}]})
    assert resp.status_code in (200, 201), resp.text
    case_id, case_code = resp.json()["data"]["case_id"], resp.json()["data"]["case_code"]
    with db() as conn:
        dept = str(conn.execute("SELECT department_id FROM cases WHERE id = %s", (case_id,)).fetchone()[0])

    driver = neo4j_driver()
    try:
        with driver.session(**neo4j_kwargs()) as s:
            rec = s.run("""MATCH (c:Case {id: $cid})
                           OPTIONAL MATCH (c)-[:IN_DEPARTMENT]->(d:Department)
                           RETURN c.case_code AS code, c.status AS status, collect(d.id) AS depts, count(c) AS n""",
                        cid=case_id).single()
            assert rec is not None and rec["n"] >= 1, "convert phải tạo nút Case trong Neo4j ngay sau commit"
            assert rec["code"] == case_code
            assert rec["status"] == "INITIALIZING"
            assert rec["depts"] == [dept], "Case phải có đúng một quan hệ IN_DEPARTMENT tới phòng của vụ việc"
            nodes = s.run("MATCH (c:Case {id: $cid}) RETURN count(c) AS n", cid=case_id).single()["n"]
            assert nodes == 1
    finally:
        s2 = driver.session(**neo4j_kwargs())
        s2.run("MATCH (c:Case {id: $cid}) DETACH DELETE c", cid=case_id)
        s2.close()
        driver.close()


@pytest.mark.asyncio
async def test_process_outbox_handles_case_created_idempotently():
    """Worker outbox xử lý CASE_CREATED bằng MERGE: chạy lại không nhân đôi nút/quan hệ."""
    from backend.app.services.graph_sync import process_outbox

    c, me = await authenticated_client("ATTORNEY")
    cid = make_client_record(me["id"])
    opp = make_opportunity_record(cid, me["id"], stage="WON")
    mid = make_matter_type(department_id=make_department())
    v_id = make_template_version(make_workflow_template(mid), version_no=1, status="PUBLISHED")
    make_template_stages_and_tasks(v_id)
    resp = await c.post(f"{BASE}/{opp}/convert", headers={"Idempotency-Key": str(uuid.uuid4()), **csrf(c)},
                        json={"matter_type_id": mid, "title": "Vụ việc kiểm thử outbox", "contract_value": "1000000",
                              "milestones": [{"name": "Đợt 1", "amount": "1000000"}]})
    assert resp.status_code in (200, 201), resp.text
    case_id = resp.json()["data"]["case_id"]
    with db() as conn:
        conn.execute("UPDATE outbox_events SET processed_at = NULL "
                     "WHERE event_type = 'CASE_CREATED' AND payload->>'case_id' = %s", (case_id,))
    await process_outbox(limit=1000)
    driver = neo4j_driver()
    try:
        with driver.session(**neo4j_kwargs()) as s:
            rec = s.run("""MATCH (c:Case {id: $cid}) OPTIONAL MATCH (c)-[r:IN_DEPARTMENT]->()
                           RETURN count(DISTINCT c) AS n, count(r) AS r""", cid=case_id).single()
            assert rec["n"] == 1 and rec["r"] == 1
        with db() as conn:
            left = conn.execute("SELECT count(*) FROM outbox_events WHERE event_type = 'CASE_CREATED' "
                                "AND payload->>'case_id' = %s AND processed_at IS NULL", (case_id,)).fetchone()[0]
            assert left == 0, "sự kiện CASE_CREATED phải được đánh dấu đã xử lý"
    finally:
        s2 = driver.session(**neo4j_kwargs())
        s2.run("MATCH (c:Case {id: $cid}) DETACH DELETE c", cid=case_id)
        s2.close()
        driver.close()
