"""Nghiệm thu TSK-09 (+ phần tích hợp TSK-10) — xác nhận thu tiền MISA, hòm thư Kế toán, đợt thu,
chính sách hoa hồng.

Hợp đồng: docs/07-api-contracts.md §3.5 · Quy tắc: docs/12 §1.5, §2.3, §3 · DEC-06
Test cases: TC-MISA-02 → TC-MISA-05, TC-FIN-01/04/05/08 (mức API)

Lưu ý: misa_transactions / commission_transactions có trigger chặn DELETE → dữ liệu tài chính do test tạo
được giữ lại trên DB dùng chung; mọi khẳng định lọc theo id do test tạo.
"""
import asyncio
import datetime as dt
import uuid
from decimal import Decimal

import pytest

from backend.tests.test_task_flow import (
    create_test_case,
    create_test_client,
    create_test_department,
    create_test_matter_type,
    create_test_user,
    db_conn,
    make_auth_client,
    sync_neo4j_graph,
)

D = Decimal
URL = "/api/v1/accounting/confirm-payment"


# ------------------------------------------------------------------ dựng dữ liệu
def _insert_stage(conn, case_id, order_index, status, blocking_milestone_id=None, name=None):
    sid = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO case_stages (id, case_id, name, order_index, status, blocking_milestone_id)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (sid, case_id, name or f"Giai đoạn {order_index}", order_index, status, blocking_milestone_id),
    )
    return sid


def _insert_milestone(conn, case_id, order_index, amount, status, name=None):
    mid = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO billing_milestones (id, case_id, order_index, name, amount, status, requested_at)
           VALUES (%s, %s, %s, %s, %s, %s, CASE WHEN %s = 'AWAITING_PAYMENT' THEN now() END)""",
        (mid, case_id, order_index, name or f"Đợt {order_index}", amount, status, status),
    )
    return mid


def _insert_task(conn, case_id, stage_id, assignee, *, status="COMPLETED", weight=1, minutes_ago=60,
                 title=None, triggers=None):
    tid = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO case_tasks (id, case_id, stage_id, title, assigned_to, status, complexity_weight,
                                   requires_approval, triggers_milestone_id, completed_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, false, %s,
                   CASE WHEN %s = 'COMPLETED' THEN now() - make_interval(mins => %s) END)""",
        (tid, case_id, stage_id, title or f"Task {tid[:4]}", assignee, status, weight, triggers,
         status, minutes_ago),
    )
    return tid


def build_case(*, milestone_amount="60000000", milestone_status="AWAITING_PAYMENT", with_task=True,
               with_supervisor=True, with_originator=True, with_case_manager=True,
               rates=("5", "7", "40", "8")):
    """Vụ việc ACTIVE: stage 1 xong (1 task COMPLETED trọng số 1), đợt 1 chờ thu, stage 2 WAITING_PAYMENT."""
    with db_conn() as conn:
        dept = create_test_department(conn)
        mt = create_test_matter_type(conn, dept["id"])
        cl = create_test_client(conn)
        accountant = create_test_user(conn, "ACCOUNTANT", full_name="Kế toán MISA")
        manager = create_test_user(conn, "MANAGER", full_name="Trưởng phòng MISA")
        cm = create_test_user(conn, "MANAGER", full_name="Case Manager MISA")
        sup = create_test_user(conn, "MANAGER", full_name="Supervisor MISA")
        orig = create_test_user(conn, "ATTORNEY", full_name="Người mang khách MISA")
        execu = create_test_user(conn, "ATTORNEY", full_name="Luật sư thực hiện MISA")
        admin = create_test_user(conn, "ADMIN", full_name="Quản trị MISA")
        case = create_test_case(conn, cl["id"], mt["id"], dept["id"], created_by=manager["id"])
        if with_originator:
            opp_id = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO opportunities (id, client_id, title, lead_source, expected_value, stage, originator_id)
                   VALUES (%s, %s, 'Cơ hội MISA', 'REFERRAL', 60000000, 'WON', %s)""",
                (opp_id, cl["id"], orig["id"]),
            )
            conn.execute("UPDATE cases SET opportunity_id = %s WHERE id = %s", (opp_id, case["id"]))
        if with_case_manager:
            conn.execute("INSERT INTO case_assignments (case_id, user_id, role_in_case) VALUES (%s, %s, 'CASE_MANAGER')",
                         (case["id"], cm["id"]))
        if with_supervisor:
            conn.execute("INSERT INTO case_assignments (case_id, user_id, role_in_case) VALUES (%s, %s, 'SUPERVISOR')",
                         (case["id"], sup["id"]))
        conn.execute("INSERT INTO case_assignments (case_id, user_id, role_in_case) VALUES (%s, %s, 'EXECUTOR')",
                     (case["id"], execu["id"]))
        ro, rm, s, re_ = rates
        conn.execute(
            """INSERT INTO commission_policies (case_id, originator_rate, management_rate, supervisor_share_pct, execution_rate)
               VALUES (%s, %s, %s, %s, %s)""",
            (case["id"], ro, rm, s, re_),
        )
        st1 = _insert_stage(conn, case["id"], 1, "COMPLETED")
        m1 = _insert_milestone(conn, case["id"], 1, milestone_amount, milestone_status)
        st2 = _insert_stage(conn, case["id"], 2, "WAITING_PAYMENT", blocking_milestone_id=m1)
        t1 = _insert_task(conn, case["id"], st1, execu["id"], title="Nộp đơn đăng ký", triggers=m1) if with_task else None
    users = [accountant, manager, cm, sup, orig, execu, admin]
    return {"dept": dept, "case": case, "accountant": accountant, "manager": manager, "cm": cm, "sup": sup,
            "orig": orig, "exec": execu, "admin": admin, "users": users, "m1": m1, "st1": st1, "st2": st2, "t1": t1}


async def graph(ctx):
    await sync_neo4j_graph(users=ctx["users"], departments=[ctx["dept"]], cases=[ctx["case"]],
                           leads=[(ctx["manager"]["id"], ctx["dept"]["id"])],
                           assignments=[(ctx["cm"]["id"], ctx["case"]["id"], "CASE_MANAGER"),
                                        (ctx["exec"]["id"], ctx["case"]["id"], "EXECUTOR")])


def body(milestone_id, amount, *, ref=None, invoice=None, notes=None):
    return {"milestone_id": milestone_id, "misa_invoice_no": invoice or f"HD-{uuid.uuid4().hex[:8]}",
            "bank_ref_code": ref or f"FT{uuid.uuid4().hex[:12].upper()}", "received_amount": amount,
            "notes": notes}


def key():
    return {"Idempotency-Key": str(uuid.uuid4())}


def q1(sql, params):
    with db_conn() as conn:
        return conn.execute(sql, params).fetchone()


def qall(sql, params):
    with db_conn() as conn:
        return conn.execute(sql, params).fetchall()


def commissions_of(misa_id):
    return qall("""SELECT user_id::text, role_type, amount, task_id::text, base_amount, rate_pct, source, case_id::text, milestone_id::text
                   FROM commission_transactions WHERE misa_transaction_id = %s ORDER BY role_type, amount""", (misa_id,))


def by_role(items, role):
    return [c for c in items if c["role_type"] == role]


# ------------------------------------------------------------------ TC-MISA-03 + TC-FIN-05
async def test_tc_misa_03_thu_mot_phan_roi_thu_du_mo_khoa():
    ctx = build_case()
    await graph(ctx)
    async with make_auth_client(ctx["accountant"]["id"]) as c:
        r1 = await c.post(URL, json=body(ctx["m1"], "30000000", notes="Khách chuyển trước một phần"), headers=key())
        assert r1.status_code == 200, r1.text
        d1 = r1.json()["data"]
        assert d1["milestone_status"] == "PARTIALLY_PAID"
        assert D(d1["received_total"]) == D("30000000") and D(d1["remaining"]) == D("30000000")
        assert d1["stage_unblocked"] is False
        cm = d1["commissions"]
        assert [(x["user_id"], D(x["amount"])) for x in by_role(cm, "ORIGINATOR")] == [(ctx["orig"]["id"], D("1500000"))]
        assert [(x["user_id"], D(x["amount"])) for x in by_role(cm, "SUPERVISOR")] == [(ctx["sup"]["id"], D("840000"))]
        assert [(x["user_id"], D(x["amount"])) for x in by_role(cm, "CASE_MANAGER")] == [(ctx["cm"]["id"], D("1260000"))]
        ex = by_role(cm, "EXECUTOR")
        assert [(x["user_id"], x["task_id"], D(x["amount"])) for x in ex] == [(ctx["exec"]["id"], ctx["t1"], D("2400000"))]
        assert D(d1["execution_carried_forward"]) == 0
        assert r1.json()["warnings"] == []

        # DB: stage 2 vẫn khoá, chính sách đã khoá, 1 giao dịch MISA, 4 dòng hoa hồng SYSTEM
        assert q1("SELECT status FROM case_stages WHERE id = %s", (ctx["st2"],))[0] == "WAITING_PAYMENT"
        assert q1("SELECT locked_at FROM commission_policies WHERE case_id = %s", (ctx["case"]["id"],))[0] is not None
        misa = qall("SELECT id::text, received_amount, accountant_id::text FROM misa_transactions WHERE milestone_id = %s", (ctx["m1"],))
        assert len(misa) == 1 and misa[0][1] == D("30000000") and misa[0][2] == ctx["accountant"]["id"]
        rows = commissions_of(misa[0][0])
        assert len(rows) == 4
        assert all(r[6] == "SYSTEM" and r[7] == ctx["case"]["id"] and r[8] == ctx["m1"] for r in rows)
        assert sum(r[2] for r in rows) == D("6000000")

        # Lần 2: đủ tiền → PAID_CONFIRMED, mở khoá stage; task t1 đã nhận quỹ → quỹ thực hiện dồn (TC-FIN-05)
        r2 = await c.post(URL, json=body(ctx["m1"], "30000000"), headers=key())
        assert r2.status_code == 200, r2.text
        d2 = r2.json()["data"]
        assert d2["milestone_status"] == "PAID_CONFIRMED"
        assert D(d2["received_total"]) == D("60000000") and D(d2["remaining"]) == 0
        assert d2["stage_unblocked"] is True
        assert by_role(d2["commissions"], "EXECUTOR") == []
        assert D(d2["execution_carried_forward"]) == D("2400000")
    assert q1("SELECT status FROM case_stages WHERE id = %s", (ctx["st2"],))[0] == "ACTIVE"
    assert q1("SELECT status, received_total FROM billing_milestones WHERE id = %s", (ctx["m1"],)) == ("PAID_CONFIRMED", D("60000000"))
    carry = qall("SELECT amount, consumed_by_misa_transaction_id FROM commission_carry_forwards WHERE case_id = %s", (ctx["case"]["id"],))
    assert carry == [(D("2400000"), None)]
    audit = q1("""SELECT count(*) FROM audit_logs WHERE action = 'PAYMENT_CONFIRMED' AND entity_name = 'billing_milestones'
                  AND entity_id = %s""", (ctx["m1"],))
    assert audit[0] == 2


# ------------------------------------------------------------------ TC-MISA-02 + TC-FIN-01 + thu thừa
async def test_tc_misa_02_thu_du_mot_lan_va_thu_thua_canh_bao():
    ctx = build_case(milestone_amount="50000000")
    await graph(ctx)
    async with make_auth_client(ctx["accountant"]["id"]) as c:
        r = await c.post(URL, json=body(ctx["m1"], "55000000"), headers=key())
    assert r.status_code == 200, r.text
    j = r.json()
    d = j["data"]
    assert d["milestone_status"] == "PAID_CONFIRMED" and d["stage_unblocked"] is True
    assert D(d["remaining"]) == 0
    warns = j["warnings"]
    assert [w["code"] for w in warns] == ["OVERPAYMENT"]
    assert D(warns[0]["amount"]) == D("5000000")
    # hoa hồng tính trên số thực về 55tr (DEC-06)
    amounts = {x["role_type"]: D(x["amount"]) for x in d["commissions"]}
    assert amounts == {"ORIGINATOR": D("2750000"), "SUPERVISOR": D("1540000"),
                       "CASE_MANAGER": D("2310000"), "EXECUTOR": D("4400000")}
    assert q1("SELECT status FROM case_stages WHERE id = %s", (ctx["st2"],))[0] == "ACTIVE"


async def test_tc_fin_01_qua_api_dung_50tr():
    ctx = build_case(milestone_amount="50000000", with_supervisor=True)
    await graph(ctx)
    async with make_auth_client(ctx["accountant"]["id"]) as c:
        r = await c.post(URL, json=body(ctx["m1"], "50000000"), headers=key())
    assert r.status_code == 200, r.text
    amounts = {x["role_type"]: D(x["amount"]) for x in r.json()["data"]["commissions"]}
    assert amounts == {"ORIGINATOR": D("2500000"), "SUPERVISOR": D("1400000"),
                       "CASE_MANAGER": D("2100000"), "EXECUTOR": D("4000000")}


async def test_khong_supervisor_khong_nguoi_mang_khach():
    ctx = build_case(milestone_amount="50000000", with_supervisor=False, with_originator=False)
    await graph(ctx)
    async with make_auth_client(ctx["accountant"]["id"]) as c:
        r = await c.post(URL, json=body(ctx["m1"], "50000000"), headers=key())
    assert r.status_code == 200, r.text
    amounts = {x["role_type"]: D(x["amount"]) for x in r.json()["data"]["commissions"]}
    assert amounts == {"CASE_MANAGER": D("3500000"), "EXECUTOR": D("4000000")}


# ------------------------------------------------------------------ TC-FIN-04 dồn quỹ khi chưa có task
async def test_tc_fin_04_don_quy_dot_tam_ung_roi_dung_het():
    ctx = build_case(milestone_amount="20000000", with_task=False)
    await graph(ctx)
    async with make_auth_client(ctx["accountant"]["id"]) as c:
        r1 = await c.post(URL, json=body(ctx["m1"], "20000000"), headers=key())
        assert r1.status_code == 200, r1.text
        d1 = r1.json()["data"]
        assert by_role(d1["commissions"], "EXECUTOR") == []
        assert D(d1["execution_carried_forward"]) == D("1600000")
        misa1 = q1("SELECT id::text FROM misa_transactions WHERE milestone_id = %s", (ctx["m1"],))[0]
        assert qall("SELECT amount, from_misa_transaction_id::text FROM commission_carry_forwards WHERE case_id = %s",
                    (ctx["case"]["id"],)) == [(D("1600000"), misa1)]

        # 2 task hoàn thành ở stage 2, đợt 2 chờ thu 30tr
        with db_conn() as conn:
            ta = _insert_task(conn, ctx["case"]["id"], ctx["st2"], ctx["exec"]["id"], weight=1, minutes_ago=20)
            tb = _insert_task(conn, ctx["case"]["id"], ctx["st2"], ctx["cm"]["id"], weight=1, minutes_ago=10)
            m2 = _insert_milestone(conn, ctx["case"]["id"], 2, "30000000", "AWAITING_PAYMENT")
        r2 = await c.post(URL, json=body(m2, "30000000"), headers=key())
        assert r2.status_code == 200, r2.text
        d2 = r2.json()["data"]
        ex = {x["task_id"]: D(x["amount"]) for x in by_role(d2["commissions"], "EXECUTOR")}
        assert ex == {ta: D("2000000"), tb: D("2000000")}  # (2,4tr + 1,6tr dồn) / 2
        assert D(d2["execution_carried_forward"]) == 0
    misa2 = q1("SELECT id::text FROM misa_transactions WHERE milestone_id = %s", (m2,))[0]
    assert qall("SELECT consumed_by_misa_transaction_id::text FROM commission_carry_forwards WHERE case_id = %s",
                (ctx["case"]["id"],)) == [(misa2,)]


# ------------------------------------------------------------------ TC-MISA-04 trùng mã giao dịch
async def test_tc_misa_04_trung_bank_ref_bi_chan_khong_sinh_hoa_hong():
    ctx = build_case()
    await graph(ctx)
    ref = f"FT{uuid.uuid4().hex[:12].upper()}"
    async with make_auth_client(ctx["accountant"]["id"]) as c:
        r1 = await c.post(URL, json=body(ctx["m1"], "10000000", ref=ref), headers=key())
        assert r1.status_code == 200, r1.text
        before = q1("SELECT count(*) FROM commission_transactions WHERE case_id = %s", (ctx["case"]["id"],))[0]
        r2 = await c.post(URL, json=body(ctx["m1"], "10000000", ref=ref), headers=key())
    assert r2.status_code == 409, r2.text
    assert r2.json()["error"]["code"] == "DUPLICATE_BANK_REF"
    assert q1("SELECT count(*) FROM commission_transactions WHERE case_id = %s", (ctx["case"]["id"],))[0] == before
    assert q1("SELECT count(*) FROM misa_transactions WHERE milestone_id = %s", (ctx["m1"],))[0] == 1
    assert q1("SELECT received_total FROM billing_milestones WHERE id = %s", (ctx["m1"],))[0] == D("10000000")


# ------------------------------------------------------------------ TC-MISA-05 bấm đúp / Idempotency-Key
async def test_tc_misa_05_hai_request_dong_thoi_cung_key():
    ctx = build_case()
    await graph(ctx)
    payload = body(ctx["m1"], "30000000")
    hdr = key()
    async with make_auth_client(ctx["accountant"]["id"]) as c1, make_auth_client(ctx["accountant"]["id"]) as c2:
        ra, rb = await asyncio.gather(c1.post(URL, json=payload, headers=hdr), c2.post(URL, json=payload, headers=hdr))
        assert ra.status_code == 200, ra.text
        assert rb.status_code == 200, rb.text
        assert ra.json() == rb.json()
        # gửi lại tuần tự cùng key + nội dung → trả lại đúng kết quả cũ
        rc = await c1.post(URL, json=payload, headers=hdr)
        assert rc.status_code == 200 and rc.json() == ra.json()
        # cùng key, khác nội dung → 409
        other = dict(payload, received_amount="1000000")
        rd = await c1.post(URL, json=other, headers=hdr)
        assert rd.status_code == 409 and rd.json()["error"]["code"] == "IDEMPOTENCY_KEY_REUSED"
    misa = qall("SELECT id::text FROM misa_transactions WHERE milestone_id = %s", (ctx["m1"],))
    assert len(misa) == 1
    assert len(commissions_of(misa[0][0])) == 4
    assert q1("SELECT received_total FROM billing_milestones WHERE id = %s", (ctx["m1"],))[0] == D("30000000")


async def test_thieu_hoac_sai_idempotency_key_va_payload_sai():
    ctx = build_case()
    await graph(ctx)
    async with make_auth_client(ctx["accountant"]["id"]) as c:
        r = await c.post(URL, json=body(ctx["m1"], "1000000"))
        assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
        r = await c.post(URL, json=body(ctx["m1"], "1000000"), headers={"Idempotency-Key": "khong-phai-uuid"})
        assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
        for bad in ("0", "-5", "abc", "1.234"):
            r = await c.post(URL, json=body(ctx["m1"], bad), headers=key())
            assert r.status_code == 422, (bad, r.text)
        r = await c.post(URL, json=dict(body(ctx["m1"], "1000"), misa_invoice_no="  "), headers=key())
        assert r.status_code == 422
        r = await c.post(URL, json=dict(body(ctx["m1"], "1000"), bank_ref_code=""), headers=key())
        assert r.status_code == 422
        r = await c.post(URL, json=body(str(uuid.uuid4()), "1000"), headers=key())
        assert r.status_code == 404
    assert q1("SELECT count(*) FROM misa_transactions WHERE milestone_id = %s", (ctx["m1"],))[0] == 0


@pytest.mark.parametrize("status", ["PENDING", "PAID_CONFIRMED", "CANCELLED"])
async def test_dot_khong_o_trang_thai_cho_thu(status):
    ctx = build_case(milestone_status=status)
    await graph(ctx)
    async with make_auth_client(ctx["accountant"]["id"]) as c:
        r = await c.post(URL, json=body(ctx["m1"], "1000000"), headers=key())
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "MILESTONE_NOT_AWAITING_PAYMENT"


async def test_phan_quyen_confirm_payment():
    ctx = build_case()
    await graph(ctx)
    for who in ("manager", "cm", "exec", "admin"):
        async with make_auth_client(ctx[who]["id"]) as c:
            r = await c.post(URL, json=body(ctx["m1"], "1000000"), headers=key())
        assert r.status_code == 403, (who, r.text)
        assert r.json()["error"]["code"] == "FORBIDDEN_ROLE"
    import httpx
    from backend.app.main import app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://testserver") as anon:
        r = await anon.post(URL, json=body(ctx["m1"], "1000000"), headers=key())
        assert r.status_code in (401, 403)  # thiếu CSRF có thể bị chặn trước
        r = await anon.get("/api/v1/accounting/inbox")
        assert r.status_code == 401
    assert q1("SELECT count(*) FROM misa_transactions WHERE milestone_id = %s", (ctx["m1"],))[0] == 0


async def test_loi_giua_chung_rollback_toan_bo():
    """Không có Case Manager đang phân công → 409 CASE_MANAGER_REQUIRED, không ghi gì (một transaction)."""
    ctx = build_case(with_case_manager=False)
    await graph(ctx)
    async with make_auth_client(ctx["accountant"]["id"]) as c:
        r = await c.post(URL, json=body(ctx["m1"], "30000000"), headers=key())
    assert r.status_code == 409, r.text
    assert r.json()["error"]["code"] == "CASE_MANAGER_REQUIRED"
    assert q1("SELECT count(*) FROM misa_transactions WHERE milestone_id = %s", (ctx["m1"],))[0] == 0
    assert q1("SELECT status, received_total FROM billing_milestones WHERE id = %s", (ctx["m1"],)) == ("AWAITING_PAYMENT", D("0"))
    assert q1("SELECT locked_at FROM commission_policies WHERE case_id = %s", (ctx["case"]["id"],))[0] is None


# ------------------------------------------------------------------ TC-FIN-08 chính sách hoa hồng
async def test_tc_fin_08_chinh_sach_hoa_hong_get_put_khoa():
    ctx = build_case()
    await graph(ctx)
    purl = f"/api/v1/cases/{ctx['case']['id']}/commission-policy"
    async with make_auth_client(ctx["manager"]["id"]) as mgr:
        r = await mgr.get(purl)
        assert r.status_code == 200, r.text
        p = r.json()["data"]
        assert {k: D(p[k]) for k in ("originator_rate", "management_rate", "supervisor_share_pct", "execution_rate")} == {
            "originator_rate": D("5"), "management_rate": D("7"), "supervisor_share_pct": D("40"), "execution_rate": D("8")}
        assert p["locked_at"] is None

        new = {"originator_rate": "6", "management_rate": "7", "supervisor_share_pct": "50", "execution_rate": "9"}
        r = await mgr.put(purl, json=new)
        assert r.status_code == 200, r.text
        assert D(r.json()["data"]["execution_rate"]) == D("9")

        r = await mgr.put(purl, json=dict(new, execution_rate="88"))  # 6 + 7 + 88 = 101
        assert r.status_code == 422 and r.json()["error"]["code"] == "COMMISSION_RATES_EXCEED_100"
        r = await mgr.put(purl, json=dict(new, supervisor_share_pct="101"))
        assert r.status_code == 422

    async with make_auth_client(ctx["accountant"]["id"]) as acc:
        r = await acc.get(purl)
        assert r.status_code == 200  # Kế toán xem được (phạm vi finance)
        r = await acc.put(purl, json=new)
        assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN_ROLE"
        r = await acc.post(URL, json=body(ctx["m1"], "10000000"), headers=key())
        assert r.status_code == 200, r.text
        # tỷ lệ mới (6/7/50/9) được dùng
        amounts = {x["role_type"]: D(x["amount"]) for x in r.json()["data"]["commissions"]}
        assert amounts["ORIGINATOR"] == D("600000") and amounts["EXECUTOR"] == D("900000")

    async with make_auth_client(ctx["manager"]["id"]) as mgr:
        r = await mgr.get(purl)
        assert r.json()["data"]["locked_at"] is not None
        r = await mgr.put(purl, json=new)
        assert r.status_code == 409 and r.json()["error"]["code"] == "COMMISSION_POLICY_LOCKED"

    async with make_auth_client(ctx["exec"]["id"]) as att:  # luật sư được giao nhưng không có phạm vi finance
        r = await att.get(purl)
        assert r.status_code == 403


# ------------------------------------------------------------------ đợt thu của vụ việc
async def test_get_case_milestones():
    ctx = build_case()
    with db_conn() as conn:
        _insert_milestone(conn, ctx["case"]["id"], 2, "40000000", "PENDING", name="Đợt cuối")
    await graph(ctx)
    murl = f"/api/v1/cases/{ctx['case']['id']}/milestones"
    async with make_auth_client(ctx["accountant"]["id"]) as c:
        await c.post(URL, json=body(ctx["m1"], "15000000"), headers=key())
        r = await c.get(murl)
    assert r.status_code == 200, r.text
    items = r.json()["data"]
    assert [i["order_index"] for i in items] == [1, 2]
    first = items[0]
    assert first["id"] == ctx["m1"] and first["status"] == "PARTIALLY_PAID"
    assert D(first["amount"]) == D("60000000") and D(first["received_total"]) == D("15000000")
    assert first["triggered_by_task"] == {"title": "Nộp đơn đăng ký"}
    assert items[1]["name"] == "Đợt cuối" and items[1]["triggered_by_task"] is None
    async with make_auth_client(ctx["exec"]["id"]) as att:
        r = await att.get(murl)
    assert r.status_code == 403


# ------------------------------------------------------------------ hòm thư Kế toán
async def test_accounting_inbox():
    ctx = build_case()
    await graph(ctx)
    async with make_auth_client(ctx["accountant"]["id"]) as c:
        r = await c.get("/api/v1/accounting/inbox", params={"q": ctx["case"]["case_code"]})
        assert r.status_code == 200, r.text
        items = r.json()["data"]
        assert [i["milestone_id"] for i in items] == [ctx["m1"]]
        it = items[0]
        assert it["case"]["id"] == ctx["case"]["id"] and it["case"]["case_code"] == ctx["case"]["case_code"]
        assert it["case"]["title"] and it["case"]["client_name"]
        assert it["status"] == "AWAITING_PAYMENT" and D(it["remaining"]) == D("60000000")
        assert it["awaiting_since"] and it["payments"] == []
        meta = r.json()["meta"]
        assert meta["page"] == 1 and meta["total_records"] == 1

        await c.post(URL, json=body(ctx["m1"], "20000000", invoice="HD-INBOX-1"), headers=key())
        r = await c.get("/api/v1/accounting/inbox", params={"q": ctx["case"]["case_code"]})
        it = r.json()["data"][0]
        assert it["status"] == "PARTIALLY_PAID" and D(it["received_total"]) == D("20000000")
        assert D(it["remaining"]) == D("40000000")
        assert len(it["payments"]) == 1
        pay = it["payments"][0]
        assert pay["misa_invoice_no"] == "HD-INBOX-1" and D(pay["received_amount"]) == D("20000000")
        assert pay["confirmed_by"]["full_name"] == "Kế toán MISA" and pay["confirmed_at"]

        # thu đủ → rời hòm thư (mặc định chỉ AWAITING_PAYMENT, PARTIALLY_PAID)
        await c.post(URL, json=body(ctx["m1"], "40000000"), headers=key())
        r = await c.get("/api/v1/accounting/inbox", params={"q": ctx["case"]["case_code"]})
        assert r.json()["data"] == []
        r = await c.get("/api/v1/accounting/inbox", params={"q": ctx["case"]["case_code"], "status": "PAID_CONFIRMED"})
        assert [i["milestone_id"] for i in r.json()["data"]] == [ctx["m1"]]
        r = await c.get("/api/v1/accounting/inbox", params={"status": "KHONG_HOP_LE"})
        assert r.status_code == 422
    async with make_auth_client(ctx["manager"]["id"]) as m:
        r = await m.get("/api/v1/accounting/inbox")
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN_ROLE"
