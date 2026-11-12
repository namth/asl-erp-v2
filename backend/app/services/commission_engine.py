from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, ROUND_FLOOR, ROUND_HALF_UP
from typing import Sequence


@dataclass(frozen=True)
class CommissionPolicy:
    originator_rate: Decimal        # R_o, %
    management_rate: Decimal        # R_m, %
    supervisor_share_pct: Decimal   # s, % của quỹ quản lý
    execution_rate: Decimal         # R_e, %


@dataclass(frozen=True)
class EligibleTask:                 # thứ tự field cố định (test tạo theo vị trí)
    task_id: str
    assignee_id: str
    weight: int                     # complexity_weight 1..4
    completed_at: datetime


@dataclass(frozen=True)
class CommissionLine:
    user_id: str
    role_type: str                  # ORIGINATOR | SUPERVISOR | CASE_MANAGER | EXECUTOR
    amount: Decimal                 # số nguyên đồng
    base_amount: Decimal
    rate_pct: Decimal
    task_id: str | None = None


@dataclass(frozen=True)
class CommissionResult:
    lines: list[CommissionLine]
    execution_fund: Decimal         # F = ⌊A·R_e%⌋ + D
    carried_forward: Decimal        # = F khi không có task đủ điều kiện, ngược lại 0


class CommissionRatesExceed100(ValueError):
    pass


def validate_policy(policy: CommissionPolicy) -> None:
    rates = (
        policy.originator_rate,
        policy.management_rate,
        policy.supervisor_share_pct,
        policy.execution_rate,
    )
    for rate in rates:
        if rate < Decimal(0) or rate > Decimal(100):
            raise ValueError("Tỷ lệ hoa hồng phải nằm trong khoảng [0, 100]")

    total_rate = policy.originator_rate + policy.management_rate + policy.execution_rate
    if total_rate > Decimal(100):
        raise CommissionRatesExceed100("Tổng tỷ lệ hoa hồng vượt quá 100%")


def allocate_by_weight(fund: Decimal, tasks: Sequence[EligibleTask]) -> dict[str, Decimal]:
    if not tasks:
        raise ValueError("Danh sách task không được để trống")
    if fund < Decimal(0) or fund != fund.to_integral_value():
        raise ValueError("Quỹ phân bổ phải là số nguyên đồng không âm")
    for t in tasks:
        if not isinstance(t.weight, int) or t.weight < 1 or t.weight > 4:
            raise ValueError("Trọng số task phải là số nguyên trong khoảng 1..4")

    total_w = sum(t.weight for t in tasks)
    total_w_dec = Decimal(total_w)

    task_allocations: list[tuple[int, EligibleTask, Decimal, Decimal]] = []
    sum_base = Decimal(0)
    for idx, t in enumerate(tasks):
        exact = (fund * Decimal(t.weight)) / total_w_dec
        base = exact.to_integral_value(rounding=ROUND_FLOOR)
        remainder = exact - base
        sum_base += base
        task_allocations.append((idx, t, remainder, base))

    remainder_dong = int(fund - sum_base)

    sorted_tasks = sorted(
        task_allocations,
        key=lambda item: (-item[2], item[1].completed_at, item[1].task_id),
    )

    bonus_indices = {item[0] for item in sorted_tasks[:remainder_dong]}

    result: dict[str, Decimal] = {}
    for idx, t, _, base in task_allocations:
        amount = base + (Decimal(1) if idx in bonus_indices else Decimal(0))
        result[t.task_id] = amount

    return result


def compute_commission(
    amount: Decimal,
    policy: CommissionPolicy,
    *,
    originator_id: str | None,
    supervisor_id: str | None,
    case_manager_id: str | None,
    eligible_tasks: Sequence[EligibleTask],
    carry_in: Decimal = Decimal(0),
) -> CommissionResult:
    validate_policy(policy)

    if amount <= Decimal(0):
        raise ValueError("Số tiền thực thu phải lớn hơn 0")
    if case_manager_id is None:
        raise ValueError("case_manager_id không được để trống")
    if carry_in < Decimal(0) or carry_in != carry_in.to_integral_value():
        raise ValueError("Số tiền quỹ dồn carry_in phải là số nguyên đồng không âm")

    lines: list[CommissionLine] = []

    # 1. ORIGINATOR
    if originator_id is not None:
        c_o = (amount * policy.originator_rate / Decimal(100)).to_integral_value(rounding=ROUND_FLOOR)
        if c_o > Decimal(0):
            lines.append(
                CommissionLine(
                    user_id=originator_id,
                    role_type="ORIGINATOR",
                    amount=c_o,
                    base_amount=amount,
                    rate_pct=policy.originator_rate,
                )
            )

    # 2. Quản lý: SUPERVISOR & CASE_MANAGER
    if supervisor_id is not None:
        c_s = (
            amount
            * policy.management_rate
            / Decimal(100)
            * policy.supervisor_share_pct
            / Decimal(100)
        ).to_integral_value(rounding=ROUND_FLOOR)
        rate_s = policy.management_rate * policy.supervisor_share_pct / Decimal(100)
        if c_s > Decimal(0):
            lines.append(
                CommissionLine(
                    user_id=supervisor_id,
                    role_type="SUPERVISOR",
                    amount=c_s,
                    base_amount=amount,
                    rate_pct=rate_s,
                )
            )

        cm_share_pct = Decimal(100) - policy.supervisor_share_pct
        c_cm = (
            amount
            * policy.management_rate
            / Decimal(100)
            * cm_share_pct
            / Decimal(100)
        ).to_integral_value(rounding=ROUND_FLOOR)
        rate_cm = policy.management_rate * cm_share_pct / Decimal(100)
        if c_cm > Decimal(0):
            lines.append(
                CommissionLine(
                    user_id=case_manager_id,
                    role_type="CASE_MANAGER",
                    amount=c_cm,
                    base_amount=amount,
                    rate_pct=rate_cm,
                )
            )
    else:
        c_cm = (amount * policy.management_rate / Decimal(100)).to_integral_value(rounding=ROUND_FLOOR)
        rate_cm = policy.management_rate
        if c_cm > Decimal(0):
            lines.append(
                CommissionLine(
                    user_id=case_manager_id,
                    role_type="CASE_MANAGER",
                    amount=c_cm,
                    base_amount=amount,
                    rate_pct=rate_cm,
                )
            )

    # 3. Quỹ thực hiện
    f_raw = (amount * policy.execution_rate / Decimal(100)).to_integral_value(rounding=ROUND_FLOOR)
    execution_fund = f_raw + carry_in

    if eligible_tasks:
        alloc = allocate_by_weight(execution_fund, eligible_tasks)
        total_w = sum(t.weight for t in eligible_tasks)
        total_w_dec = Decimal(total_w)
        for t in eligible_tasks:
            task_amount = alloc[t.task_id]
            if task_amount > Decimal(0):
                rate_pct = (
                    Decimal(t.weight * 100) / total_w_dec
                ).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
                lines.append(
                    CommissionLine(
                        user_id=t.assignee_id,
                        role_type="EXECUTOR",
                        amount=task_amount,
                        base_amount=execution_fund,
                        rate_pct=rate_pct,
                        task_id=t.task_id,
                    )
                )
        carried_forward = Decimal(0)
    else:
        carried_forward = execution_fund

    return CommissionResult(
        lines=lines,
        execution_fund=execution_fund,
        carried_forward=carried_forward,
    )


def distribute_carry_on_close(
    carry: Decimal,
    completed_tasks: Sequence[EligibleTask],
) -> list[CommissionLine]:
    if not completed_tasks or carry == Decimal(0):
        return []
    if carry < Decimal(0) or carry != carry.to_integral_value():
        raise ValueError("Quỹ dồn carry phải là số nguyên đồng không âm")

    alloc = allocate_by_weight(carry, completed_tasks)
    total_w = sum(t.weight for t in completed_tasks)
    total_w_dec = Decimal(total_w)

    lines: list[CommissionLine] = []
    for t in completed_tasks:
        task_amount = alloc[t.task_id]
        if task_amount > Decimal(0):
            rate_pct = (
                Decimal(t.weight * 100) / total_w_dec
            ).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            lines.append(
                CommissionLine(
                    user_id=t.assignee_id,
                    role_type="EXECUTOR",
                    amount=task_amount,
                    base_amount=carry,
                    rate_pct=rate_pct,
                    task_id=t.task_id,
                )
            )
    return lines
