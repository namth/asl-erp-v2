"""Nghiệm thu: sổ hoa hồng GET /api/v1/finance/commissions (SCR-12).

Hợp đồng: docs/07-api-contracts.md mục `GET /api/v1/finance/commissions` (§3.7) và §1.2; phạm vi theo bảng
DEC-04 ở §3.9 cột `commissions`. Dữ liệu dựng trong một năm ngẫu nhiên; DB dùng chung có thể còn dòng hoa hồng của lần chạy khác cùng năm
(test báo cáo cũng ghi vào năm ngẫu nhiên), nên truy vấn toàn hãng luôn lọc thêm theo vụ việc/nhân sự riêng của test.
"""
import os
import random
import uuid
from decimal import Decimal

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/6")

import pytest

from backend.tests.test_task_flow import (
    create_test_case,
    create_test_client,
    create_test_department,
    create_test_matter_type,
    db_conn,
    make_auth_client,
)
from backend.tests.test_reports_api import _user, _commission, at

URL = "/api/v1/finance/commissions"
ROLES = ("ORIGINATOR", "SUPERVISOR", "CASE_MANAGER", "EXECUTOR", "ASSISTANT")
_W: dict = {}


def world():
    if _W:
        return _W
    Y = random.randint(1975, 2015)
    tag = uuid.uuid4().hex[:6]
    with db_conn() as conn:
        dA = create_test_department(conn, name=f"Phòng A hoa hồng {tag}")
        dB = create_test_department(conn, name=f"Phòng B hoa hồng {tag}")
        mt = create_test_matter_type(conn, dA["id"], name=f"Nhãn hiệu HH {tag}")
        cl = create_test_client(conn)
        exe = _user(conn, "MANAGER", f"Giám đốc HH {tag}", is_executive=True)
        mgrA = _user(conn, "MANAGER", f"Trưởng phòng A HH {tag}", dA)
        mgr_none = _user(conn, "MANAGER", f"Quản lý chưa phụ trách HH {tag}")
        acct = _user(conn, "ACCOUNTANT", f"Kế toán HH {tag}")
        admin = _user(conn, "ADMIN", f"Quản trị HH {tag}")
        u1 = _user(conn, "ATTORNEY", f"An HH {tag}", dA)
        u2 = _user(conn, "ATTORNEY", f"Bình HH {tag}", dA)
        u3 = _user(conn, "ATTORNEY", f"Cường HH {tag}", dB)
        conn.execute("INSERT INTO department_leaders (user_id, department_id) VALUES (%s, %s)", (mgrA["id"], dA["id"]))
        c1 = create_test_case(conn, cl["id"], mt["id"], dA["id"], contract_value="100000000", created_by=exe["id"])
        c2 = create_test_case(conn, cl["id"], mt["id"], dA["id"], contract_value="50000000", created_by=exe["id"])
        rows = [  # (case, user, role, amount, status, when)
            (c1, u1, "CASE_MANAGER", "3000000", "ACCUMULATED", at(Y, 1, 20)),
            (c1, u1, "EXECUTOR", "1500000", "DISBURSED", at(Y, 2, 20)),
            (c1, u2, "SUPERVISOR", "2000000", "ACCUMULATED", at(Y, 3, 31, 23, 0)),
            (c2, u2, "ASSISTANT", "333333", "ACCUMULATED", at(Y, 1, 5)),
            (c2, u3, "ORIGINATOR", "5000000", "ACCUMULATED", at(Y, 2, 2)),
            (c1, u1, "CASE_MANAGER", "9999999", "ACCUMULATED", at(Y, 4, 1, 1, 0)),     # 01/4 giờ VN → ngoài kỳ Q1
            (c2, u3, "EXECUTOR", "1000000", "ACCUMULATED", at(Y - 1, 12, 31, 23, 30)),  # ngoài kỳ
        ]
        for c, u, role, amount, status, when in rows:
            _commission(conn, c["id"], u["id"], role, amount, status, when)
    _W.update(dict(Y=Y, frm=f"{Y}-01-01", to=f"{Y}-03-31", dA=dA, exe=exe, mgrA=mgrA, mgr_none=mgr_none, acct=acct,
                   admin=admin, u1=u1, u2=u2, u3=u3, c1=c1, c2=c2))
    return _W


async def get(user, **params):
    async with make_auth_client(user["id"]) as c:
        return await c.get(URL, params={k: v for k, v in params.items() if v is not None})


def body_ok(r):
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["success"] is True and isinstance(b["data"], list), b
    for k in ("page", "limit", "total_records", "total_pages", "summary"):
        assert k in b["meta"], f"meta thiếu {k}"
    return b["data"], b["meta"]


def amounts(data):
    return sorted(Decimal(x["amount"]) for x in data)


def D(*xs):
    return sorted(Decimal(x) for x in xs)


@pytest.mark.asyncio
async def test_ke_toan_toan_hang_dung_tung_dong_va_dang_phan_tu():
    W = world()
    q = {"from": W["frm"], "to": W["to"], "limit": 100}
    data, meta = body_ok(await get(W["acct"], **q, case_id=W["c1"]["id"]))
    assert amounts(data) == D("3000000", "1500000", "2000000")
    assert meta["total_records"] == 3
    data2, _ = body_ok(await get(W["acct"], **q, case_id=W["c2"]["id"]))
    assert amounts(data2) == D("333333", "5000000")
    row = next(x for x in data if Decimal(x["amount"]) == Decimal("3000000"))
    assert row["case"]["case_code"] == W["c1"]["case_code"]
    assert row["user"]["id"] == W["u1"]["id"] and row["user"]["full_name"] == W["u1"]["full_name"]
    assert row["role_type"] == "CASE_MANAGER"
    assert "payout_status" not in row, "DEC-09: không có trạng thái chi trả"
    assert Decimal(row["base_amount"]) == Decimal("3000000") and Decimal(row["rate_pct"]) == Decimal("5")
    for k in ("milestone", "task", "created_at"):
        assert k in row
    assert all(isinstance(x["amount"], str) for x in data), "tiền là chuỗi số"
    created = [x["created_at"] for x in data]
    assert created == sorted(created, reverse=True), "mới nhất trước"


@pytest.mark.asyncio
async def test_summary_tinh_tren_toan_bo_ket_qua_loc_khong_chi_trang_hien_tai():
    W = world()
    q = {"from": W["frm"], "to": W["to"], "case_id": W["c1"]["id"], "limit": 2}
    data, meta = body_ok(await get(W["exe"], **q, page=1))
    assert len(data) == 2 and meta["total_records"] == 3 and meta["total_pages"] == 2
    s = meta["summary"]
    assert Decimal(s["total_amount"]) == Decimal("6500000")
    by = {k: Decimal(v) for k, v in s["by_role"].items()}
    assert set(by) == set(ROLES)
    assert by == {"ORIGINATOR": Decimal("0"), "SUPERVISOR": Decimal("2000000"),
                  "CASE_MANAGER": Decimal("3000000"), "EXECUTOR": Decimal("1500000"), "ASSISTANT": Decimal("0")}
    p2, m2 = body_ok(await get(W["exe"], **q, page=2))
    assert len(p2) == 1 and m2["summary"] == s


@pytest.mark.asyncio
async def test_bo_loc_case_user_role():
    W = world()
    base = {"from": W["frm"], "to": W["to"], "limit": 100}
    data, _ = body_ok(await get(W["acct"], **base, case_id=W["c2"]["id"]))
    assert amounts(data) == D("333333", "5000000")
    data, _ = body_ok(await get(W["acct"], **base, user_id=W["u1"]["id"]))
    assert amounts(data) == D("3000000", "1500000")
    data, _ = body_ok(await get(W["acct"], **base, role_type="CASE_MANAGER", case_id=W["c1"]["id"]))
    assert amounts(data) == D("3000000")
    data, _ = body_ok(await get(W["acct"], **base, payout_status="DISBURSED", user_id=W["u1"]["id"]))
    assert amounts(data) == D("3000000", "1500000"), "payout_status bị bỏ qua (DEC-09)"
    data, _ = body_ok(await get(W["acct"], case_id=W["c1"]["id"], limit=100))  # không lọc ngày → mọi thời điểm
    assert amounts(data) == D("3000000", "1500000", "2000000", "9999999")


@pytest.mark.asyncio
async def test_pham_vi_theo_vai_tro():
    W = world()
    q = {"from": W["frm"], "to": W["to"], "limit": 100}
    data, _ = body_ok(await get(W["mgrA"], **q))  # Trưởng phòng A: nhân sự phòng A (u1, u2)
    assert amounts(data) == D("3000000", "1500000", "2000000", "333333")
    data, _ = body_ok(await get(W["mgrA"], **q, user_id=W["u3"]["id"]))  # nhân sự phòng khác → rỗng
    assert data == []
    data, _ = body_ok(await get(W["mgr_none"], **q))
    assert data == []
    data, meta = body_ok(await get(W["u2"], **q, user_id=W["u1"]["id"]))  # luật sư: user_id khác bị bỏ qua
    assert amounts(data) == D("2000000", "333333")
    assert Decimal(meta["summary"]["total_amount"]) == Decimal("2333333")
    r = await get(W["admin"], **q)
    assert r.status_code == 403 and r.json()["error"]["code"] == "FORBIDDEN_ROLE"


@pytest.mark.asyncio
@pytest.mark.parametrize("params", [
    {"from": "2020-13-01"}, {"from": "2020-03-02", "to": "2020-03-01"}, {"case_id": "abc"}, {"user_id": "x"},
    {"role_type": "SALES"}, {"page": 0}, {"limit": 101},
])
async def test_tham_so_sai_422(params):
    W = world()
    r = await get(W["acct"], **params)
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_chua_xac_thuc_401():
    from backend.tests.test_opportunity_conversion import client
    async with client() as c:
        r = await c.get(URL)
    assert r.status_code == 401
