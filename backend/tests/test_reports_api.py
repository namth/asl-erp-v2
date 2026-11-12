"""Nghiệm thu TSK-15 (backend) — Báo cáo & thống kê SCR-18: revenue, commissions, operations, export.

Hợp đồng: docs/07-api-contracts.md §3.9 · Phạm vi dữ liệu: DEC-04 · Tệp Excel: backend/app/services/report_export.py

Cô lập dữ liệu trên DB dùng chung (misa_transactions / commission_transactions không xoá được):
- dữ liệu theo kỳ nằm trong một quý ngẫu nhiên của một năm 1975–2015 (`W["from"]`…`W["to"]`);
- mọi khẳng định chính xác đều lọc theo phòng ban / nhân sự / vụ việc mới tạo trong lần chạy này.
Ranh giới ngày tính theo giờ Việt Nam (UTC+7).
"""
import datetime as dt
import io
import random
import uuid

import pytest
from openpyxl import load_workbook

from backend.app.services.report_export import content_disposition, export_filename
from backend.tests.test_task_flow import (
    create_test_case,
    create_test_client,
    create_test_department,
    create_test_matter_type,
    create_test_user,
    db_conn,
    make_auth_client,
)

VN = dt.timezone(dt.timedelta(hours=7))
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
ZERO_ROLES = {"ORIGINATOR": "0", "SUPERVISOR": "0", "CASE_MANAGER": "0", "EXECUTOR": "0", "ASSISTANT": "0"}


def at(y, m, d, hh=10, mm=0):
    return dt.datetime(y, m, d, hh, mm, tzinfo=VN)


def today_vn():
    return dt.datetime.now(VN).date()


# ------------------------------------------------------------------ dựng dữ liệu (một lần cho cả module)
_W = {}


def _user(conn, role, name, dept=None, *, is_executive=False):
    u = create_test_user(conn, role, full_name=name, is_executive=is_executive)
    u["full_name"] = name
    if dept:
        conn.execute("UPDATE users SET department_id = %s WHERE id = %s", (dept["id"], u["id"]))
    return u


def _milestone(conn, case_id, amount):
    mid = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO billing_milestones (id, case_id, order_index, name, amount, status, requested_at)
           VALUES (%s, %s, 1, 'Đợt 1', %s, 'PARTIALLY_PAID', now())""",
        (mid, case_id, amount),
    )
    return mid


def _pay(conn, milestone_id, accountant_id, amount, when):
    conn.execute(
        """INSERT INTO misa_transactions (milestone_id, accountant_id, misa_invoice_no, bank_ref_code,
                                          idempotency_key, received_amount, confirmed_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (milestone_id, accountant_id, f"HD-{uuid.uuid4().hex[:8]}", f"FT{uuid.uuid4().hex[:14].upper()}",
         str(uuid.uuid4()), amount, when),
    )


def _commission(conn, case_id, user_id, role, amount, status, when):
    conn.execute(
        """INSERT INTO commission_transactions (case_id, user_id, role_type, base_amount, rate_pct, amount,
                                                source, payout_status, created_at)
           VALUES (%s, %s, %s, %s, 5, %s, 'SYSTEM', %s, %s)""",
        (case_id, user_id, role, amount, amount, status, when),
    )


def _stage(conn, case_id, order_index, name, status, started=None, completed=None):
    sid = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO case_stages (id, case_id, name, order_index, status, started_at, completed_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (sid, case_id, name, order_index, status, started, completed),
    )
    return sid


def _task(conn, case_id, stage_id, title, status, due_at, assignee=None):
    tid = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO case_tasks (id, case_id, stage_id, title, assigned_to, status, requires_approval, due_at,
                                   completed_at)
           VALUES (%s, %s, %s, %s, %s, %s, false, %s, CASE WHEN %s = 'COMPLETED' THEN now() END)""",
        (tid, case_id, stage_id, title, assignee, status, due_at, status),
    )
    return tid


def _opp(conn, client_id, originator_id, stage, when, converted_case_id=None):
    conn.execute(
        """INSERT INTO opportunities (client_id, title, lead_source, expected_value, stage, originator_id,
                                      converted_case_id, created_at)
           VALUES (%s, 'Cơ hội báo cáo', 'REFERRAL', 10000000, %s, %s, %s, %s)""",
        (client_id, stage, originator_id, converted_case_id, when),
    )


def _assign(conn, case_id, user_id, role="EXECUTOR"):
    conn.execute("INSERT INTO case_assignments (case_id, user_id, role_in_case) VALUES (%s, %s, %s)",
                 (case_id, user_id, role))


def world():
    if _W:
        return _W
    Y = random.randint(1975, 2015)
    tag = uuid.uuid4().hex[:6]
    W = {"Y": Y, "from": f"{Y}-01-01", "to": f"{Y}-03-31", "tag": tag}
    with db_conn() as conn:
        dA = create_test_department(conn, name=f"Phòng A báo cáo {tag}")
        dB = create_test_department(conn, name=f"Phòng B báo cáo {tag}")
        dC = create_test_department(conn, name=f"Phòng C báo cáo {tag}")
        mtA = create_test_matter_type(conn, dA["id"], name=f"Nhãn hiệu {tag}")
        mtB = create_test_matter_type(conn, dB["id"], name=f"Sáng chế {tag}")
        mtC = create_test_matter_type(conn, dC["id"], name=f"Bản quyền {tag}")
        cl = create_test_client(conn)

        exe = _user(conn, "MANAGER", f"Giám đốc {tag}", is_executive=True)
        mgrA = _user(conn, "MANAGER", f"Trưởng phòng A {tag}", dA)
        mgrC = _user(conn, "MANAGER", f"Trưởng phòng C {tag}", dC)
        mgr_none = _user(conn, "MANAGER", f"Quản lý chưa phụ trách {tag}")
        acct = _user(conn, "ACCOUNTANT", f"Kế toán {tag}")
        admin = _user(conn, "ADMIN", f"Quản trị {tag}")
        law = _user(conn, "ATTORNEY", f"Luật sư doanh thu {tag}", dA)
        u1 = _user(conn, "ATTORNEY", f"An {tag}", dA)
        u2 = _user(conn, "MANAGER", f"Bình {tag}", dA)
        u3 = _user(conn, "ATTORNEY", f"Cường {tag}", dB)
        law2 = _user(conn, "ATTORNEY", f"Luật sư vận hành {tag}", dC)
        conn.execute("INSERT INTO department_leaders (user_id, department_id) VALUES (%s, %s), (%s, %s)",
                     (mgrA["id"], dA["id"], mgrC["id"], dC["id"]))

        # ---- doanh thu
        c1 = create_test_case(conn, cl["id"], mtA["id"], dA["id"], contract_value="100000000", created_by=exe["id"])
        c2 = create_test_case(conn, cl["id"], mtA["id"], dA["id"], contract_value="50000000", created_by=exe["id"])
        c3 = create_test_case(conn, cl["id"], mtB["id"], dB["id"], contract_value="200000000", created_by=exe["id"])
        c4 = create_test_case(conn, cl["id"], mtA["id"], dA["id"], contract_value="70000000", created_by=exe["id"])
        m1, m2, m3, m4 = (_milestone(conn, c["id"], c["contract_value"]) for c in (c1, c2, c3, c4))
        _pay(conn, m1, acct["id"], "30000000", at(Y, 1, 15))
        _pay(conn, m1, acct["id"], "20000000", at(Y, 2, 10))
        _pay(conn, m1, acct["id"], "7000000", at(Y - 1, 12, 31, 23, 50))   # ngoài kỳ (trước)
        _pay(conn, m2, acct["id"], "15000000", at(Y, 3, 31, 23, 30))      # 31/3 giờ VN = vẫn trong kỳ
        _pay(conn, m3, acct["id"], "40000000", at(Y, 2, 1, 8))
        _pay(conn, m3, acct["id"], "5000000", at(Y, 1, 1, 0, 15))          # 01/1 giờ VN (UTC còn năm trước) = trong kỳ
        _pay(conn, m4, acct["id"], "9000000", at(Y, 4, 1, 0, 30))          # 01/4 giờ VN (UTC còn 31/3) = ngoài kỳ
        _assign(conn, c1["id"], law["id"])
        _assign(conn, c3["id"], law["id"])

        # ---- hoa hồng (gắn vào c1; phòng ban lấy theo nhân sự)
        _commission(conn, c1["id"], u1["id"], "CASE_MANAGER", "3000000", "ACCUMULATED", at(Y, 1, 20))
        _commission(conn, c1["id"], u1["id"], "EXECUTOR", "1500000", "DISBURSED", at(Y, 2, 20))
        _commission(conn, c1["id"], u2["id"], "SUPERVISOR", "2000000", "ACCUMULATED", at(Y, 3, 31, 23, 0))
        _commission(conn, c1["id"], u2["id"], "ASSISTANT", "333333", "ACCUMULATED", at(Y, 1, 5))
        _commission(conn, c1["id"], u3["id"], "ORIGINATOR", "5000000", "ACCUMULATED", at(Y, 2, 2))
        _commission(conn, c1["id"], u1["id"], "CASE_MANAGER", "9999999", "ACCUMULATED", at(Y, 4, 1, 1, 0))  # ngoài kỳ
        _commission(conn, c1["id"], u2["id"], "EXECUTOR", "1000000", "ACCUMULATED", at(Y - 1, 12, 31, 23, 30))  # ngoài kỳ

        # ---- vận hành (phòng C)
        o1 = create_test_case(conn, cl["id"], mtC["id"], dC["id"], status="ACTIVE", created_by=exe["id"])
        o2 = create_test_case(conn, cl["id"], mtC["id"], dC["id"], status="ACTIVE", created_by=exe["id"])
        o3 = create_test_case(conn, cl["id"], mtC["id"], dC["id"], status="PAUSED", created_by=exe["id"])
        o4 = create_test_case(conn, cl["id"], mtC["id"], dC["id"], status="CLOSED", created_by=exe["id"])
        s_td, s_nd = f"Thẩm định {tag}", f"Nộp đơn {tag}"
        _stage(conn, o1["id"], 1, s_td, "COMPLETED", at(Y, 1, 1, 10), at(Y, 1, 11, 10))   # 10 ngày
        _stage(conn, o2["id"], 1, s_td, "COMPLETED", at(Y, 2, 1, 0), at(Y, 2, 1, 12))     # 0,5 ngày → TB 5,25 → "5.3"
        _stage(conn, o2["id"], 2, s_nd, "COMPLETED", at(Y, 3, 1, 9), at(Y, 3, 4, 9))      # 3 ngày
        _stage(conn, o3["id"], 1, s_nd, "COMPLETED", at(Y, 3, 30, 9), at(Y, 4, 2, 9))     # hoàn thành ngoài kỳ
        st_o1 = _stage(conn, o1["id"], 2, f"Theo dõi {tag}", "ACTIVE", at(Y, 1, 11, 10))
        st_o2 = _stage(conn, o2["id"], 3, f"Theo dõi {tag}", "ACTIVE", at(Y, 3, 4, 9))
        t = today_vn()
        noon = lambda d: dt.datetime.combine(d, dt.time(12, 0), tzinfo=VN)  # noqa: E731
        T1 = _task(conn, o1["id"], st_o1, f"Nộp tờ khai {tag}", "TODO", noon(t - dt.timedelta(days=6)), law2["id"])
        T2 = _task(conn, o1["id"], st_o1, f"Bổ sung hồ sơ {tag}", "IN_PROGRESS", noon(t - dt.timedelta(days=2)))
        _task(conn, o1["id"], st_o1, f"Đã xong {tag}", "COMPLETED", noon(t - dt.timedelta(days=10)), law2["id"])
        _task(conn, o1["id"], st_o1, f"Hạn mai {tag}", "TODO", noon(t + dt.timedelta(days=1)), law2["id"])
        _task(conn, o1["id"], st_o1, f"Hạn hôm nay {tag}",  "TODO",
              dt.datetime.combine(t, dt.time(0, 30), tzinfo=VN), law2["id"])             # hôm nay giờ VN → chưa quá hạn
        T6 = _task(conn, o2["id"], st_o2, f"Chờ duyệt {tag}", "WAITING_APPROVAL", noon(t - dt.timedelta(days=1)), mgrC["id"])
        _assign(conn, o1["id"], law2["id"])
        _opp(conn, cl["id"], mgrC["id"], "WON", at(Y, 1, 3), converted_case_id=o1["id"])
        _opp(conn, cl["id"], mgrC["id"], "WON", at(Y, 2, 3))
        _opp(conn, cl["id"], mgrC["id"], "NEW_LEAD", at(Y, 3, 3))
        _opp(conn, cl["id"], law2["id"], "NEW_LEAD", at(Y, 3, 5))
        _opp(conn, cl["id"], mgrC["id"], "NEGOTIATION", at(Y, 4, 1, 1))  # ngoài kỳ

    W.update(dict(dA=dA, dB=dB, dC=dC, mtA=mtA, mtB=mtB, exe=exe, mgrA=mgrA, mgrC=mgrC, mgr_none=mgr_none,
                  acct=acct, admin=admin, law=law, u1=u1, u2=u2, u3=u3, law2=law2, o1=o1, o2=o2,
                  T1=T1, T2=T2, T6=T6, s_td=s_td, s_nd=s_nd))
    _W.update(W)
    return _W


async def get(user, path, **params):
    async with make_auth_client(user["id"]) as c:
        return await c.get(path, params={k: v for k, v in params.items() if v is not None})


def period(W, **extra):
    return {"from": W["from"], "to": W["to"], **extra}


def dept_ref(d):
    return {"id": d["id"], "name": d["name"]}


def err(r):
    return r.json()["error"]["code"]


# ================================================================== DOANH THU
async def test_revenue_giam_doc_loc_phong_ban_dung_tung_dong():
    W = world()
    r = await get(W["exe"], "/api/v1/reports/revenue", **period(W, department_id=W["dA"]["id"]))
    assert r.status_code == 200, r.text
    body = r.json()
    d, meta = body["data"], body["meta"]
    assert body["success"] is True
    assert d["summary"] == {"received_total": "65000000", "contract_value_total": "150000000",
                            "collection_rate_pct": "43.33", "payment_count": 3}
    y = W["Y"]
    assert d["by_period"] == [{"period": f"{y}-01", "received_total": "30000000"},
                              {"period": f"{y}-02", "received_total": "20000000"},
                              {"period": f"{y}-03", "received_total": "15000000"}]
    assert d["by_department"] == [{"department": dept_ref(W["dA"]), "received_total": "65000000"}]
    assert d["by_matter_type"] == [{"matter_type": {"code": W["mtA"]["code"], "name": W["mtA"]["name"]},
                                    "received_total": "65000000", "contract_value_total": "150000000"}]
    assert meta["scope"] == "DEPARTMENT"
    assert meta["from"] == W["from"] and meta["to"] == W["to"]
    ids = [x["id"] for x in meta["departments"]]
    assert W["dA"]["id"] in ids and W["dB"]["id"] in ids and W["dC"]["id"] in ids  # Giám đốc lọc được mọi phòng


async def test_revenue_theo_quy_va_ky_khong_co_thu_van_co_dong_0():
    W = world()
    y = W["Y"]
    r = await get(W["exe"], "/api/v1/reports/revenue", **{"from": f"{y}-01-01", "to": f"{y}-08-15",
                                                          "department_id": W["dA"]["id"], "group_by": "quarter"})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["by_period"] == [{"period": f"{y}-Q1", "received_total": "65000000"},
                                             {"period": f"{y}-Q2", "received_total": "9000000"},  # khoản 01/4 của c4
                                             {"period": f"{y}-Q3", "received_total": "0"}]
    r = await get(W["exe"], "/api/v1/reports/revenue", **{"from": f"{y}-02-15", "to": f"{y}-05-02",
                                                          "department_id": W["dA"]["id"]})
    d = r.json()["data"]
    assert d["by_period"] == [{"period": f"{y}-02", "received_total": "0"},           # khoản 10/2 nằm trước 15/2
                              {"period": f"{y}-03", "received_total": "15000000"},
                              {"period": f"{y}-04", "received_total": "9000000"},
                              {"period": f"{y}-05", "received_total": "0"}]
    assert d["summary"]["payment_count"] == 2
    assert d["summary"]["contract_value_total"] == "120000000"  # c2 + c4 (c1 không có khoản thu trong kỳ)


async def test_revenue_toan_hang_ke_toan_va_thu_tu_giam_dan():
    W = world()
    r = await get(W["acct"], "/api/v1/reports/revenue", **period(W))
    assert r.status_code == 200, r.text
    d, meta = r.json()["data"], r.json()["meta"]
    assert meta["scope"] == "FIRM"
    by_dep = {x["department"]["id"]: x["received_total"] for x in d["by_department"]}
    assert by_dep[W["dA"]["id"]] == "65000000" and by_dep[W["dB"]["id"]] == "45000000"
    order = [x["department"]["id"] for x in d["by_department"]]
    assert order.index(W["dA"]["id"]) < order.index(W["dB"]["id"])
    totals = [int(x["received_total"]) for x in d["by_department"]]
    assert totals == sorted(totals, reverse=True)
    mts = {x["matter_type"]["code"]: x for x in d["by_matter_type"]}
    assert mts[W["mtB"]["code"]]["received_total"] == "45000000"
    assert mts[W["mtB"]["code"]]["contract_value_total"] == "200000000"
    assert int(d["summary"]["received_total"]) >= 110000000


async def test_revenue_truong_phong_chi_phong_minh():
    W = world()
    r = await get(W["mgrA"], "/api/v1/reports/revenue", **period(W))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["meta"]["scope"] == "DEPARTMENT"
    assert body["meta"]["departments"] == [dept_ref(W["dA"])]
    assert body["data"]["summary"]["received_total"] == "65000000"
    assert [x["department"]["id"] for x in body["data"]["by_department"]] == [W["dA"]["id"]]
    r = await get(W["mgrA"], "/api/v1/reports/revenue", **period(W, department_id=W["dA"]["id"]))
    assert r.status_code == 200 and r.json()["data"]["summary"]["received_total"] == "65000000"
    r = await get(W["mgrA"], "/api/v1/reports/revenue", **period(W, department_id=W["dB"]["id"]))
    assert r.status_code == 403 and err(r) == "NEED_TO_KNOW_DENIED"


async def test_revenue_luat_su_chi_vu_viec_duoc_phan_cong():
    W = world()
    for dep in (None, W["dB"]["id"]):  # department_id bị bỏ qua
        r = await get(W["law"], "/api/v1/reports/revenue", **period(W, department_id=dep))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["meta"]["scope"] == "SELF" and body["meta"]["departments"] == []
        assert body["data"]["summary"] == {"received_total": "95000000", "contract_value_total": "300000000",
                                           "collection_rate_pct": "31.67", "payment_count": 4}


async def test_revenue_quan_ly_chua_phu_trach_phong_nao_rong():
    W = world()
    r = await get(W["mgr_none"], "/api/v1/reports/revenue", **period(W))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["meta"]["scope"] == "DEPARTMENT" and body["meta"]["departments"] == []
    assert body["data"]["summary"] == {"received_total": "0", "contract_value_total": "0",
                                       "collection_rate_pct": "0.00", "payment_count": 0}
    assert body["data"]["by_department"] == [] and body["data"]["by_matter_type"] == []
    assert [p["received_total"] for p in body["data"]["by_period"]] == ["0", "0", "0"]


# ================================================================== HOA HỒNG
async def test_commissions_theo_thang_loc_phong_ban_dung_tung_dong():
    """DEC-09: thống kê theo tháng, không còn tích luỹ/đã chi. 31/3 23:00 giờ VN vẫn thuộc tháng 3."""
    W = world()
    Y = W["Y"]
    m1, m2, m3 = f"{Y}-01", f"{Y}-02", f"{Y}-03"
    r = await get(W["exe"], "/api/v1/reports/commissions", **period(W, department_id=W["dA"]["id"]))
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert r.json()["meta"]["scope"] == "DEPARTMENT"
    assert d["summary"] == {"total_amount": "6833333", "transaction_count": 4,
                            "by_role": {**ZERO_ROLES, "CASE_MANAGER": "3000000", "EXECUTOR": "1500000",
                                        "SUPERVISOR": "2000000", "ASSISTANT": "333333"}}
    assert d["periods"] == [m1, m2, m3]
    assert d["by_period"] == [{"period": m1, "total_amount": "3333333"}, {"period": m2, "total_amount": "1500000"},
                              {"period": m3, "total_amount": "2000000"}]
    assert d["by_user"] == [
        {"user": {"id": W["u1"]["id"], "full_name": W["u1"]["full_name"], "department_name": W["dA"]["name"]},
         "total_amount": "4500000",
         "by_role": {**ZERO_ROLES, "CASE_MANAGER": "3000000", "EXECUTOR": "1500000"},
         "by_period": [{"period": m1, "total_amount": "3000000"}, {"period": m2, "total_amount": "1500000"},
                       {"period": m3, "total_amount": "0"}]},
        {"user": {"id": W["u2"]["id"], "full_name": W["u2"]["full_name"], "department_name": W["dA"]["name"]},
         "total_amount": "2333333",
         "by_role": {**ZERO_ROLES, "SUPERVISOR": "2000000", "ASSISTANT": "333333"},
         "by_period": [{"period": m1, "total_amount": "333333"}, {"period": m2, "total_amount": "0"},
                       {"period": m3, "total_amount": "2000000"}]},
    ]


async def test_commissions_bo_qua_payout_status_va_ky_cat_ngang_thang():
    W = world()
    Y = W["Y"]
    base = period(W, department_id=W["dA"]["id"])
    r0 = await get(W["exe"], "/api/v1/reports/commissions", **base)
    r1 = await get(W["exe"], "/api/v1/reports/commissions", **base, payout_status="DISBURSED")
    assert r1.status_code == 200, r1.text
    assert r1.json()["data"] == r0.json()["data"], "payout_status không còn tác dụng (DEC-09)"
    # kỳ 15/1 → 10/2: đủ 2 tháng, chỉ tính bút toán trong khoảng ngày
    r = await get(W["exe"], "/api/v1/reports/commissions",
                  **{"from": f"{Y}-01-15", "to": f"{Y}-02-10", "department_id": W["dA"]["id"]})
    d = r.json()["data"]
    assert d["periods"] == [f"{Y}-01", f"{Y}-02"]
    assert d["by_period"] == [{"period": f"{Y}-01", "total_amount": "3000000"},
                              {"period": f"{Y}-02", "total_amount": "0"}]
    assert d["summary"]["total_amount"] == "3000000" and d["summary"]["transaction_count"] == 1


async def test_commissions_pham_vi_theo_vai_tro():
    W = world()
    r = await get(W["mgrA"], "/api/v1/reports/commissions", **period(W))
    assert r.status_code == 200, r.text
    assert r.json()["meta"]["departments"] == [dept_ref(W["dA"])]
    assert [x["user"]["id"] for x in r.json()["data"]["by_user"]] == [W["u1"]["id"], W["u2"]["id"]]
    r = await get(W["mgrA"], "/api/v1/reports/commissions", **period(W, department_id=W["dB"]["id"]))
    assert r.status_code == 403 and err(r) == "NEED_TO_KNOW_DENIED"

    for dep in (None, W["dB"]["id"]):
        r = await get(W["u1"], "/api/v1/reports/commissions", **period(W, department_id=dep))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["meta"]["scope"] == "SELF"
        assert body["data"]["summary"]["total_amount"] == "4500000"
        assert [x["user"]["id"] for x in body["data"]["by_user"]] == [W["u1"]["id"]]

    for viewer in (W["acct"], W["exe"]):
        r = await get(viewer, "/api/v1/reports/commissions", **period(W))
        assert r.status_code == 200, r.text
        assert r.json()["meta"]["scope"] == "FIRM"
        rows = {x["user"]["id"]: x for x in r.json()["data"]["by_user"]}
        assert rows[W["u3"]["id"]]["total_amount"] == "5000000"
        assert rows[W["u3"]["id"]]["user"]["department_name"] == W["dB"]["name"]
        assert rows[W["u1"]["id"]]["total_amount"] == "4500000"
        totals = [int(x["total_amount"]) for x in r.json()["data"]["by_user"]]
        assert totals == sorted(totals, reverse=True)


# ================================================================== VẬN HÀNH
def _expected_ops_dept_c(W):
    t = today_vn()
    return {
        "cases_by_status": {"INITIALIZING": 0, "ACTIVE": 2, "PAUSED": 1, "CLOSED": 1, "TERMINATED": 0},
        "overdue_tasks": {"count": 3, "items": [
            {"task_id": W["T1"], "title": f"Nộp tờ khai {W['tag']}",
             "case": {"id": W["o1"]["id"], "case_code": W["o1"]["case_code"]},
             "assignee": {"full_name": W["law2"]["full_name"]},
             "due_date": (t - dt.timedelta(days=6)).isoformat(), "days_overdue": 6},
            {"task_id": W["T2"], "title": f"Bổ sung hồ sơ {W['tag']}",
             "case": {"id": W["o1"]["id"], "case_code": W["o1"]["case_code"]},
             "assignee": None, "due_date": (t - dt.timedelta(days=2)).isoformat(), "days_overdue": 2},
            {"task_id": W["T6"], "title": f"Chờ duyệt {W['tag']}",
             "case": {"id": W["o2"]["id"], "case_code": W["o2"]["case_code"]},
             "assignee": {"full_name": W["mgrC"]["full_name"]},
             "due_date": (t - dt.timedelta(days=1)).isoformat(), "days_overdue": 1},
        ]},
        "stage_durations": [{"stage_name": W["s_nd"], "completed_count": 1, "avg_days": "3.0"},
                            {"stage_name": W["s_td"], "completed_count": 2, "avg_days": "5.3"}],
        "opportunity_conversion": {"created_count": 4, "won_count": 2, "converted_count": 1,
                                   "conversion_rate_pct": "25.00"},
    }


async def test_operations_giam_doc_loc_phong_va_truong_phong():
    W = world()
    for viewer, params in ((W["exe"], period(W, department_id=W["dC"]["id"])), (W["mgrC"], period(W))):
        r = await get(viewer, "/api/v1/reports/operations", **params)
        assert r.status_code == 200, r.text
        assert r.json()["data"] == _expected_ops_dept_c(W)
        assert r.json()["meta"]["scope"] == "DEPARTMENT"
    r = await get(W["mgrC"], "/api/v1/reports/operations", **period(W, department_id=W["dA"]["id"]))
    assert r.status_code == 403 and err(r) == "NEED_TO_KNOW_DENIED"


async def test_operations_luat_su_chi_vu_viec_minh():
    W = world()
    r = await get(W["law2"], "/api/v1/reports/operations", **period(W, department_id=W["dA"]["id"]))
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert r.json()["meta"]["scope"] == "SELF"
    assert d["cases_by_status"] == {"INITIALIZING": 0, "ACTIVE": 1, "PAUSED": 0, "CLOSED": 0, "TERMINATED": 0}
    assert d["overdue_tasks"]["count"] == 2
    assert [x["task_id"] for x in d["overdue_tasks"]["items"]] == [W["T1"], W["T2"]]
    assert d["stage_durations"] == [{"stage_name": W["s_td"], "completed_count": 1, "avg_days": "10.0"}]
    assert d["opportunity_conversion"] == {"created_count": 1, "won_count": 0, "converted_count": 0,
                                           "conversion_rate_pct": "0.00"}


async def test_operations_toan_hang_co_du_5_trang_thai():
    W = world()
    r = await get(W["exe"], "/api/v1/reports/operations", **period(W))
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert r.json()["meta"]["scope"] == "FIRM"
    assert set(d["cases_by_status"]) == {"INITIALIZING", "ACTIVE", "PAUSED", "CLOSED", "TERMINATED"}
    assert d["cases_by_status"]["ACTIVE"] >= 2
    assert len(d["overdue_tasks"]["items"]) <= 50 and d["overdue_tasks"]["count"] >= 3
    days = [x["days_overdue"] for x in d["overdue_tasks"]["items"]]
    assert days == sorted(days, reverse=True)


# ================================================================== PHÂN QUYỀN & THAM SỐ
async def test_phan_quyen_vai_tro():
    W = world()
    for name in ("revenue", "commissions", "operations"):
        r = await get(W["admin"], f"/api/v1/reports/{name}", **period(W))
        assert r.status_code == 403 and err(r) == "FORBIDDEN_ROLE", name
        r = await get(W["admin"], f"/api/v1/reports/{name}/export", **period(W))
        assert r.status_code == 403 and err(r) == "FORBIDDEN_ROLE", name
    r = await get(W["acct"], "/api/v1/reports/operations", **period(W))
    assert r.status_code == 403 and err(r) == "FORBIDDEN_ROLE"
    import httpx
    from backend.app.main import app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://testserver") as anon:
        r = await anon.get("/api/v1/reports/revenue")
        assert r.status_code == 401


@pytest.mark.parametrize("params", [
    {"from": "2026-03-01", "to": "2026-02-28"},          # from > to
    {"from": "2025-01-01", "to": "2026-01-02"},          # 367 ngày
    {"from": "2026-13-01", "to": "2026-12-31"},          # ngày sai
    {"from": "01/01/2026", "to": "2026-12-31"},          # sai định dạng
    {"group_by": "week"},
    {"department_id": "khong-phai-uuid"},
])
async def test_tham_so_sai_422(params):
    W = world()
    r = await get(W["exe"], "/api/v1/reports/revenue", **params)
    assert r.status_code == 422 and err(r) == "VALIDATION_ERROR", r.text


async def test_tham_so_sai_422_rieng_tung_bao_cao():
    W = world()
    r = await get(W["exe"], "/api/v1/reports/commissions", **{"from": "2026-13-01"})
    assert r.status_code == 422 and err(r) == "VALIDATION_ERROR"
    r = await get(W["exe"], "/api/v1/reports/operations", **{"from": "2026-03-01", "to": "2026-02-01"})
    assert r.status_code == 422 and err(r) == "VALIDATION_ERROR"
    r = await get(W["exe"], "/api/v1/reports/revenue/export", **{"from": "2026-03-01", "to": "2026-02-01"})
    assert r.status_code == 422 and err(r) == "VALIDATION_ERROR"


async def test_khoang_dung_366_ngay_va_mac_dinh_dau_quy():
    W = world()
    r = await get(W["exe"], "/api/v1/reports/revenue", **{"from": "2024-01-01", "to": "2024-12-31"})  # năm nhuận 366 ngày
    assert r.status_code == 200, r.text
    r = await get(W["exe"], "/api/v1/reports/commissions")
    assert r.status_code == 200, r.text
    t = today_vn()
    q_start = dt.date(t.year, 3 * ((t.month - 1) // 3) + 1, 1)
    assert r.json()["meta"]["from"] == q_start.isoformat()
    assert r.json()["meta"]["to"] == t.isoformat()


# ================================================================== XUẤT EXCEL
def _audit_exports(actor):
    with db_conn() as conn:
        return conn.execute(
            """SELECT entity_name, entity_id, after_state FROM audit_logs
               WHERE action = 'REPORT_EXPORTED' AND actor_id = %s ORDER BY id""", (actor["id"],)).fetchall()


async def test_export_doanh_thu_dung_tep_va_ghi_audit():
    W = world()
    r = await get(W["exe"], "/api/v1/reports/revenue/export", **period(W, department_id=W["dA"]["id"]))
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith(XLSX)
    assert r.headers["content-disposition"] == content_disposition(export_filename("revenue", W["from"], W["to"]))
    wb = load_workbook(io.BytesIO(r.content))
    assert wb.sheetnames == ["Tổng quan", "Theo kỳ", "Theo phòng ban", "Theo loại vụ việc"]
    ws = wb["Tổng quan"]
    assert ws["B3"].value == f"Phòng ban: {W['dA']['name']}"
    assert ws["B4"].value == 65000000
    assert [ws2.value for ws2 in wb["Theo kỳ"]["B"]][1:] == [30000000, 20000000, 15000000]
    rows = _audit_exports(W["exe"])
    assert len(rows) == 1
    entity_name, entity_id, after = rows[0]
    assert entity_name == "reports" and entity_id == "revenue"
    assert after["name"] == "revenue" and after["from"] == W["from"] and after["to"] == W["to"]
    assert after["department_id"] == W["dA"]["id"] and after["scope"] == "DEPARTMENT"


async def test_export_pham_vi_theo_nguoi_xem():
    W = world()
    r = await get(W["mgrA"], "/api/v1/reports/commissions/export", **period(W))
    assert r.status_code == 200, r.text
    wb = load_workbook(io.BytesIO(r.content))
    assert wb["Tổng quan"]["B3"].value == f"Phòng ban: {W['dA']['name']}"
    ws = wb["Theo nhân sự"]
    assert ws["A2"].value == W["u1"]["full_name"] and ws["C2"].value == 4500000
    assert ws["A4"].value == "Tổng cộng" and ws["C4"].value == 6833333
    ws = wb["Theo tháng"]
    Y = W["Y"]
    assert [c.value for c in ws[1]] == ["Nhân sự", "Phòng ban", f"01/{Y}", f"02/{Y}", f"03/{Y}", "Tổng"]
    assert [c.value for c in ws[2]] == [W["u1"]["full_name"], W["dA"]["name"], 3000000, 1500000, 0, 4500000]

    r = await get(W["law"], "/api/v1/reports/revenue/export", **period(W))
    assert r.status_code == 200, r.text
    assert load_workbook(io.BytesIO(r.content))["Tổng quan"]["B3"].value == "Cá nhân"

    r = await get(W["acct"], "/api/v1/reports/revenue/export", **period(W))
    assert r.status_code == 200, r.text
    assert load_workbook(io.BytesIO(r.content))["Tổng quan"]["B3"].value == "Toàn hãng"

    r = await get(W["mgrC"], "/api/v1/reports/operations/export", **period(W))
    assert r.status_code == 200, r.text
    wb = load_workbook(io.BytesIO(r.content))
    assert [c.value for c in wb["Vụ việc theo trạng thái"]["B"]][1:] == [0, 2, 1, 1, 0]
    assert len(_audit_exports(W["mgrA"])) == 1 and len(_audit_exports(W["law"])) == 1


async def test_export_ten_bao_cao_sai_va_bi_cam_khong_ghi_audit():
    W = world()
    r = await get(W["exe"], "/api/v1/reports/payroll/export", **period(W))
    assert r.status_code == 404 and err(r) == "NOT_FOUND"
    r = await get(W["acct"], "/api/v1/reports/operations/export", **period(W))
    assert r.status_code == 403 and err(r) == "FORBIDDEN_ROLE"
    r = await get(W["mgrA"], "/api/v1/reports/revenue/export", **period(W, department_id=W["dB"]["id"]))
    assert r.status_code == 403 and err(r) == "NEED_TO_KNOW_DENIED"
    assert _audit_exports(W["admin"]) == []
    assert [x[1] for x in _audit_exports(W["acct"]) if x[1] == "operations"] == []
