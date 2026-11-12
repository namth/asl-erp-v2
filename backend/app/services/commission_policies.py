from decimal import Decimal
from typing import Dict, Any, List, Optional
import psycopg
from psycopg.rows import dict_row

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.schemas.accounting import CommissionPolicyUpdateRequest
from backend.app.services.audit import log_audit_event
from backend.app.services.commission_engine import (
    CommissionPolicy,
    CommissionRatesExceed100,
    validate_policy,
)


def format_rate(val: Any) -> str:
    if val is None:
        return "0"
    d = Decimal(str(val))
    if d == d.to_integral_value():
        return str(int(d))
    return str(d)


def format_money(val: Any) -> str:
    if val is None:
        return "0"
    d = Decimal(str(val))
    if d == d.to_integral_value():
        return str(int(d))
    return str(d)


def get_case_milestones_sync(case_id: str) -> List[Dict[str, Any]]:
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """SELECT id, order_index, name, amount, received_total, status
                   FROM billing_milestones
                   WHERE case_id = %s
                   ORDER BY order_index ASC""",
                (case_id,)
            )
            milestones = cur.fetchall()

            cur.execute(
                """SELECT triggers_milestone_id, title
                   FROM case_tasks
                   WHERE case_id = %s
                     AND triggers_milestone_id IS NOT NULL
                   ORDER BY created_at ASC, id ASC""",
                (case_id,)
            )
            trigger_tasks = cur.fetchall()
            triggers_map: Dict[str, Dict[str, str]] = {}
            for t in trigger_tasks:
                mid = str(t["triggers_milestone_id"])
                if mid not in triggers_map:
                    triggers_map[mid] = {"title": t["title"]}

            result = []
            for m in milestones:
                mid = str(m["id"])
                result.append({
                    "id": mid,
                    "order_index": m["order_index"],
                    "name": m["name"],
                    "amount": format_money(m["amount"]),
                    "received_total": format_money(m["received_total"]),
                    "status": m["status"],
                    "triggered_by_task": triggers_map.get(mid),
                })
            return result


def get_commission_policy_sync(case_id: str) -> Dict[str, Any]:
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """SELECT originator_rate, management_rate, supervisor_share_pct, execution_rate, locked_at
                   FROM commission_policies
                   WHERE case_id = %s""",
                (case_id,)
            )
            policy = cur.fetchone()
            if not policy:
                raise AppException(404, "NOT_FOUND", "Vụ việc chưa có chính sách hoa hồng")

            return {
                "originator_rate": format_rate(policy["originator_rate"]),
                "management_rate": format_rate(policy["management_rate"]),
                "supervisor_share_pct": format_rate(policy["supervisor_share_pct"]),
                "execution_rate": format_rate(policy["execution_rate"]),
                "locked_at": policy["locked_at"].isoformat() if policy["locked_at"] else None,
            }


def update_commission_policy_sync(
    case_id: str,
    payload: CommissionPolicyUpdateRequest,
    current_user: Dict[str, Any]
) -> Dict[str, Any]:
    ro = Decimal(payload.originator_rate)
    rm = Decimal(payload.management_rate)
    s = Decimal(payload.supervisor_share_pct)
    re_ = Decimal(payload.execution_rate)

    policy_obj = CommissionPolicy(
        originator_rate=ro,
        management_rate=rm,
        supervisor_share_pct=s,
        execution_rate=re_,
    )
    try:
        validate_policy(policy_obj)
    except CommissionRatesExceed100:
        raise AppException(422, "COMMISSION_RATES_EXCEED_100", "Tổng tỷ lệ hoa hồng vượt quá 100%")
    except ValueError as e:
        raise AppException(422, "VALIDATION_ERROR", str(e))

    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=False) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """SELECT id, originator_rate, management_rate, supervisor_share_pct, execution_rate, locked_at
                   FROM commission_policies
                   WHERE case_id = %s
                   FOR UPDATE""",
                (case_id,)
            )
            policy = cur.fetchone()
            if not policy:
                raise AppException(404, "NOT_FOUND", "Vụ việc chưa có chính sách hoa hồng")

            if policy["locked_at"] is not None:
                raise AppException(409, "COMMISSION_POLICY_LOCKED", "Chính sách hoa hồng đã bị khoá sau lần thu tiền đầu tiên")

            before_state = {
                "originator_rate": format_rate(policy["originator_rate"]),
                "management_rate": format_rate(policy["management_rate"]),
                "supervisor_share_pct": format_rate(policy["supervisor_share_pct"]),
                "execution_rate": format_rate(policy["execution_rate"]),
            }

            cur.execute(
                """UPDATE commission_policies
                   SET originator_rate = %s,
                       management_rate = %s,
                       supervisor_share_pct = %s,
                       execution_rate = %s,
                       updated_at = NOW()
                   WHERE id = %s""",
                (ro, rm, s, re_, policy["id"])
            )

            after_state = {
                "originator_rate": format_rate(ro),
                "management_rate": format_rate(rm),
                "supervisor_share_pct": format_rate(s),
                "execution_rate": format_rate(re_),
            }

            log_audit_event(
                conn=conn,
                actor_type="USER",
                action="COMMISSION_POLICY_UPDATED",
                entity_name="commission_policies",
                entity_id=str(policy["id"]),
                actor_id=str(current_user["id"]),
                before_state=before_state,
                after_state=after_state,
            )

            conn.commit()

            return {
                "originator_rate": format_rate(ro),
                "management_rate": format_rate(rm),
                "supervisor_share_pct": format_rate(s),
                "execution_rate": format_rate(re_),
                "locked_at": None,
            }
