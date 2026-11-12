"""TSK-10 — động cơ tính hoa hồng theo tiền thực thu (docs/12 §3, DEC-06).

Kiểm thử hàm thuần `backend.app.services.commission_engine` (không DB): TC-FIN-01 → TC-FIN-09.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from decimal import ROUND_FLOOR, Decimal
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from backend.app.services.commission_engine import (
    CommissionLine,
    CommissionPolicy,
    CommissionRatesExceed100,
    CommissionResult,
    EligibleTask,
    allocate_by_weight,
    compute_commission,
    distribute_carry_on_close,
    validate_policy,
)

D = Decimal
T0 = datetime(2026, 11, 1, 8, 0, tzinfo=timezone.utc)
ENGINE_SRC = Path(__file__).resolve().parents[1] / "app" / "services" / "commission_engine.py"


def task(tid: str, weight: int = 1, minutes: int = 0, assignee: str | None = None) -> EligibleTask:
    return EligibleTask(task_id=tid, assignee_id=assignee or f"u_{tid}", weight=weight,
                        completed_at=T0 + timedelta(minutes=minutes))


def policy(ro="0", rm="0", s="0", re_="0") -> CommissionPolicy:
    return CommissionPolicy(originator_rate=D(ro), management_rate=D(rm),
                            supervisor_share_pct=D(s), execution_rate=D(re_))


def by_role(res: CommissionResult, role: str) -> list[CommissionLine]:
    return [l for l in res.lines if l.role_type == role]


def one(res: CommissionResult, role: str) -> CommissionLine:
    lines = by_role(res, role)
    assert len(lines) == 1, f"cần đúng 1 dòng {role}, có {len(lines)}"
    return lines[0]


def floor_dong(x: Decimal) -> Decimal:
    return x.quantize(D("1"), rounding=ROUND_FLOOR)


# ---------------------------------------------------------------- TC-FIN-01
def test_tc_fin_01_cong_thuc_co_ban():
    res = compute_commission(
        D("50000000"), policy("5", "7", "40", "8"),
        originator_id="u_orig", supervisor_id="u_sup", case_manager_id="u_cm",
        eligible_tasks=[task("t1", assignee="u_exec")],
    )
    o, s, cm, e = (one(res, r) for r in ("ORIGINATOR", "SUPERVISOR", "CASE_MANAGER", "EXECUTOR"))
    assert (o.user_id, o.amount) == ("u_orig", D("2500000"))
    assert (s.user_id, s.amount) == ("u_sup", D("1400000"))
    assert (cm.user_id, cm.amount) == ("u_cm", D("2100000"))
    assert (e.user_id, e.amount, e.task_id) == ("u_exec", D("4000000"), "t1")
    assert res.execution_fund == D("4000000")
    assert res.carried_forward == D("0")
    # base_amount / rate_pct ghi sổ
    assert o.base_amount == D("50000000") and o.rate_pct == D("5")
    assert s.base_amount == D("50000000") and s.rate_pct == D("2.8")
    assert cm.base_amount == D("50000000") and cm.rate_pct == D("4.2")
    assert e.base_amount == D("4000000") and e.rate_pct == D("100")
    assert all(isinstance(l.amount, Decimal) for l in res.lines)


def test_vi_du_hop_dong_api_thu_mot_phan_30tr():
    """Ví dụ trong docs/07 §3.5: thu 30tr của đợt 60tr."""
    res = compute_commission(
        D("30000000"), policy("5", "7", "40", "8"),
        originator_id="u_orig", supervisor_id="u1", case_manager_id="u2",
        eligible_tasks=[task("t1", assignee="u3")],
    )
    assert one(res, "ORIGINATOR").amount == D("1500000")
    assert one(res, "SUPERVISOR").amount == D("840000")
    assert one(res, "CASE_MANAGER").amount == D("1260000")
    assert one(res, "EXECUTOR").amount == D("2400000")


def test_khong_co_nguoi_mang_khach_ve_thi_khong_co_dong_originator():
    res = compute_commission(D("50000000"), policy("5", "7", "40", "8"),
                             originator_id=None, supervisor_id="u_sup", case_manager_id="u_cm",
                             eligible_tasks=[task("t1")])
    assert by_role(res, "ORIGINATOR") == []
    assert sum(l.amount for l in res.lines) == D("1400000") + D("2100000") + D("4000000")


def test_khong_co_supervisor_thi_case_manager_nhan_toan_bo_quy_quan_ly():
    res = compute_commission(D("50000000"), policy("5", "7", "40", "8"),
                             originator_id="u_orig", supervisor_id=None, case_manager_id="u_cm",
                             eligible_tasks=[task("t1")])
    assert by_role(res, "SUPERVISOR") == []
    cm = one(res, "CASE_MANAGER")
    assert cm.amount == D("3500000")
    assert cm.rate_pct == D("7")


def test_lam_tron_xuong_tung_khoan_quy():
    # A = 33.333.333: C_o = 1.666.666,65 → 1.666.666; C_m = 2.333.333,31
    # Supervisor 40% = 933.333,324 → 933.333; Case Manager 60% = 1.399.999,986 → 1.399.999
    res = compute_commission(D("33333333"), policy("5", "7", "40", "0"),
                             originator_id="o", supervisor_id="s", case_manager_id="c",
                             eligible_tasks=[task("t1")])
    assert one(res, "ORIGINATOR").amount == D("1666666")
    assert one(res, "SUPERVISOR").amount == D("933333")
    assert one(res, "CASE_MANAGER").amount == D("1399999")
    assert by_role(res, "EXECUTOR") == []  # R_e = 0 → quỹ 0, không có dòng 0đ
    assert res.execution_fund == D("0")


def test_so_tien_le_hao_dung_decimal_khong_float():
    res = compute_commission(D("1000000.50"), policy(re_="10"),
                             originator_id=None, supervisor_id=None, case_manager_id="c",
                             eligible_tasks=[task("t1")])
    assert res.execution_fund == D("100000")
    assert one(res, "EXECUTOR").amount == D("100000")


def test_khong_sinh_dong_0_dong():
    res = compute_commission(D("10"), policy("1", "1", "50", "1"),
                             originator_id="o", supervisor_id="s", case_manager_id="c",
                             eligible_tasks=[task("t1")])
    assert res.lines == []
    assert res.execution_fund == D("0")
    assert res.carried_forward == D("0")


def test_cung_mot_nguoi_nhieu_vai_tro_van_tach_dong():
    res = compute_commission(D("50000000"), policy("5", "7", "40", "8"),
                             originator_id="u", supervisor_id="u", case_manager_id="u",
                             eligible_tasks=[task("t1", assignee="u"), task("t2", assignee="u", minutes=1)])
    assert sorted(l.role_type for l in res.lines) == [
        "CASE_MANAGER", "EXECUTOR", "EXECUTOR", "ORIGINATOR", "SUPERVISOR"]
    assert {l.task_id for l in by_role(res, "EXECUTOR")} == {"t1", "t2"}


# ---------------------------------------------------------------- TC-FIN-02
def test_tc_fin_02_chia_theo_trong_so():
    res = compute_commission(D("10000000"), policy(re_="10"),
                             originator_id=None, supervisor_id=None, case_manager_id="c",
                             eligible_tasks=[task("t1", 1), task("t2", 3, minutes=1)])
    ex = {l.task_id: l for l in by_role(res, "EXECUTOR")}
    assert ex["t1"].amount == D("250000")
    assert ex["t2"].amount == D("750000")
    assert ex["t1"].rate_pct == D("25") and ex["t2"].rate_pct == D("75")
    assert ex["t1"].base_amount == ex["t2"].base_amount == D("1000000")


def test_rate_pct_executor_lam_tron_4_chu_so():
    res = compute_commission(D("9000000"), policy(re_="10"),
                             originator_id=None, supervisor_id=None, case_manager_id="c",
                             eligible_tasks=[task("a", 1), task("b", 1, 1), task("c", 1, 2)])
    assert {l.rate_pct for l in by_role(res, "EXECUTOR")} == {D("33.3333")}


# ---------------------------------------------------------------- TC-FIN-03
def test_tc_fin_03_lam_tron_khop_tung_dong_uu_tien_task_xong_som():
    res = compute_commission(D("33333333"), policy(re_="8"),
                             originator_id=None, supervisor_id=None, case_manager_id="c",
                             eligible_tasks=[task("t3", minutes=30), task("t1", minutes=0), task("t2", minutes=10)])
    ex = {l.task_id: l.amount for l in by_role(res, "EXECUTOR")}
    assert ex == {"t1": D("888889"), "t2": D("888889"), "t3": D("888888")}
    assert sum(ex.values()) == D("2666666") == res.execution_fund


def test_hoa_nhau_ca_thoi_diem_thi_theo_id():
    same = T0
    tasks = [EligibleTask("c", "u", 1, same), EligibleTask("a", "u", 1, same), EligibleTask("b", "u", 1, same)]
    alloc = allocate_by_weight(D("2"), tasks)
    assert alloc == {"a": D("1"), "b": D("1"), "c": D("0")}


def test_phan_du_theo_phan_le_lon_nhat_khong_phai_thu_tu():
    # quỹ 10, trọng số 1:2 → 3,333 / 6,667 → sàn 3 / 6, dư 1 → task có phần lẻ lớn hơn (b) nhận
    alloc = allocate_by_weight(D("10"), [task("a", 1), task("b", 2, minutes=5)])
    assert alloc == {"a": D("3"), "b": D("7")}


def test_allocate_by_weight_kiem_tra_dau_vao():
    with pytest.raises(ValueError):
        allocate_by_weight(D("10"), [])
    with pytest.raises(ValueError):
        allocate_by_weight(D("-1"), [task("a")])
    with pytest.raises(ValueError):
        allocate_by_weight(D("10.5"), [task("a")])
    with pytest.raises(ValueError):
        allocate_by_weight(D("10"), [task("a", 0)])
    with pytest.raises(ValueError):
        allocate_by_weight(D("10"), [task("a", 5)])


# ---------------------------------------------------------------- TC-FIN-04 / 05
def test_tc_fin_04_don_quy_khi_khong_co_task_roi_dung_het_lan_sau():
    first = compute_commission(D("20000000"), policy("5", "7", "40", "8"),
                               originator_id="o", supervisor_id="s", case_manager_id="c",
                               eligible_tasks=[])
    assert by_role(first, "EXECUTOR") == []
    assert first.execution_fund == D("1600000")
    assert first.carried_forward == D("1600000")
    # các khoản khác vẫn chia bình thường
    assert one(first, "ORIGINATOR").amount == D("1000000")

    second = compute_commission(D("30000000"), policy("5", "7", "40", "8"),
                                originator_id="o", supervisor_id="s", case_manager_id="c",
                                eligible_tasks=[task("t1", 1), task("t2", 1, minutes=1)],
                                carry_in=first.carried_forward)
    assert second.execution_fund == D("2400000") + D("1600000")
    assert second.carried_forward == D("0")
    ex = {l.task_id: l.amount for l in by_role(second, "EXECUTOR")}
    assert ex == {"t1": D("2000000"), "t2": D("2000000")}


def test_tc_fin_05_lan_sau_khong_co_task_moi_thi_tiep_tuc_don():
    res = compute_commission(D("10000000"), policy(re_="8"),
                             originator_id=None, supervisor_id=None, case_manager_id="c",
                             eligible_tasks=[], carry_in=D("500000"))
    assert res.lines == []
    assert res.execution_fund == D("1300000")
    assert res.carried_forward == D("1300000")


def test_r_e_bang_0_va_khong_task_khong_don_gi():
    res = compute_commission(D("10000000"), policy(rm="5"),
                             originator_id=None, supervisor_id=None, case_manager_id="c",
                             eligible_tasks=[])
    assert res.carried_forward == D("0")
    assert one(res, "CASE_MANAGER").amount == D("500000")


# ---------------------------------------------------------------- TC-FIN-06
def test_tc_fin_06_dong_vu_viec_chia_quy_don_cho_moi_task_completed():
    lines = distribute_carry_on_close(D("1000001"), [task("t1", 1), task("t2", 1, minutes=1)])
    assert {(l.task_id, l.user_id, l.amount) for l in lines} == {
        ("t1", "u_t1", D("500001")), ("t2", "u_t2", D("500000"))}
    assert all(l.role_type == "EXECUTOR" and l.base_amount == D("1000001") for l in lines)


def test_dong_vu_viec_khong_co_task_thi_khong_phan_bo():
    assert distribute_carry_on_close(D("1000000"), []) == []
    assert distribute_carry_on_close(D("0"), [task("t1")]) == []


# ---------------------------------------------------------------- TC-FIN-07
def test_tc_fin_07_khong_bao_gio_sinh_dong_am():
    res = compute_commission(D("1"), policy("33.33", "33.33", "50", "33.34"),
                             originator_id="o", supervisor_id="s", case_manager_id="c",
                             eligible_tasks=[task("t1")])
    assert all(l.amount >= 0 for l in res.lines)


# ---------------------------------------------------------------- TC-FIN-08
def test_tc_fin_08_tong_ty_le_vuot_100():
    with pytest.raises(CommissionRatesExceed100):
        validate_policy(policy("50", "30", "40", "21"))
    validate_policy(policy("50", "30", "40", "20"))  # đúng 100 hợp lệ
    with pytest.raises(CommissionRatesExceed100):
        compute_commission(D("1000"), policy("50", "30", "40", "21"),
                           originator_id=None, supervisor_id=None, case_manager_id="c",
                           eligible_tasks=[])


@pytest.mark.parametrize("bad", [
    policy("-1", "0", "0", "0"), policy("0", "101", "0", "0"),
    policy("0", "10", "101", "0"), policy("0", "10", "-0.01", "0"),
])
def test_ty_le_ngoai_0_100_bi_tu_choi(bad):
    with pytest.raises(ValueError):
        validate_policy(bad)


def test_compute_kiem_tra_dau_vao():
    p = policy(re_="8")
    with pytest.raises(ValueError):
        compute_commission(D("0"), p, originator_id=None, supervisor_id=None, case_manager_id="c", eligible_tasks=[])
    with pytest.raises(ValueError):
        compute_commission(D("-5"), p, originator_id=None, supervisor_id=None, case_manager_id="c", eligible_tasks=[])
    with pytest.raises(ValueError):
        compute_commission(D("100"), p, originator_id=None, supervisor_id=None, case_manager_id="c",
                           eligible_tasks=[], carry_in=D("-1"))
    with pytest.raises(ValueError):
        compute_commission(D("100"), p, originator_id=None, supervisor_id=None, case_manager_id="c",
                           eligible_tasks=[], carry_in=D("0.5"))
    with pytest.raises(ValueError):
        compute_commission(D("100"), p, originator_id=None, supervisor_id=None, case_manager_id=None,
                           eligible_tasks=[])


# ---------------------------------------------------------------- TC-FIN-09 (property-based)
rate2 = st.integers(min_value=0, max_value=10000).map(lambda x: D(x) / 100)  # 0.00–100.00


@st.composite
def policies(draw):
    ro = draw(rate2)
    rm = draw(st.integers(min_value=0, max_value=int((D(100) - ro) * 100)).map(lambda x: D(x) / 100))
    re_ = draw(st.integers(min_value=0, max_value=int((D(100) - ro - rm) * 100)).map(lambda x: D(x) / 100))
    s = draw(rate2)
    return CommissionPolicy(originator_rate=ro, management_rate=rm, supervisor_share_pct=s, execution_rate=re_)


@st.composite
def task_lists(draw):
    n = draw(st.integers(min_value=0, max_value=20))
    weights = draw(st.lists(st.integers(min_value=1, max_value=4), min_size=n, max_size=n))
    mins = draw(st.lists(st.integers(min_value=0, max_value=5), min_size=n, max_size=n))
    return [task(f"t{i:02d}", w, m) for i, (w, m) in enumerate(zip(weights, mins))]


@settings(max_examples=10000, deadline=None)
@given(
    amount=st.integers(min_value=1, max_value=10_000_000_000).map(D),
    pol=policies(),
    tasks=task_lists(),
    carry=st.integers(min_value=0, max_value=1_000_000_000).map(D),
    has_orig=st.booleans(),
    has_sup=st.booleans(),
)
def test_tc_fin_09_bat_bien(amount, pol, tasks, carry, has_orig, has_sup):
    res = compute_commission(amount, pol, originator_id="o" if has_orig else None,
                             supervisor_id="s" if has_sup else None, case_manager_id="c",
                             eligible_tasks=tasks, carry_in=carry)
    expected_fund = floor_dong(amount * pol.execution_rate / 100) + carry
    assert res.execution_fund == expected_fund
    for l in res.lines:
        assert l.amount > 0
        assert l.amount == l.amount.to_integral_value()
    ex_total = sum((l.amount for l in by_role(res, "EXECUTOR")), D(0))
    if tasks:
        assert ex_total == expected_fund
        assert res.carried_forward == 0
    else:
        assert ex_total == 0
        assert res.carried_forward == expected_fund
    total = sum((l.amount for l in res.lines), D(0))
    cap = floor_dong(amount * (pol.originator_rate + pol.management_rate + pol.execution_rate) / 100) + carry
    assert total + res.carried_forward <= cap
    if not has_orig:
        assert by_role(res, "ORIGINATOR") == []


@settings(max_examples=2000, deadline=None)
@given(fund=st.integers(min_value=0, max_value=10_000_000_000).map(D),
       tasks=task_lists().filter(bool))
def test_allocate_by_weight_bat_bien(fund, tasks):
    alloc = allocate_by_weight(fund, tasks)
    assert set(alloc) == {t.task_id for t in tasks}
    assert sum(alloc.values()) == fund
    total_w = sum(t.weight for t in tasks)
    for t in tasks:
        exact = fund * t.weight / total_w
        assert floor_dong(exact) <= alloc[t.task_id] <= floor_dong(exact) + 1


# ---------------------------------------------------------------- quy ước mã
def test_dong_co_la_ham_thuan_khong_float_khong_db():
    src = ENGINE_SRC.read_text(encoding="utf-8")
    assert not re.search(r"\bfloat\b|\bround\(", src), "không dùng float/round() — chỉ Decimal"
    assert not re.search(r"^\s*(import|from)\s+(psycopg|sqlalchemy|fastapi|redis|neo4j|backend\.app\.(db|core|api))",
                         src, re.M), "động cơ phải là hàm thuần, không phụ thuộc DB/framework"
