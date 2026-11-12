import json
import math
import uuid
from decimal import Decimal
from typing import Dict, Any, List, Optional
import psycopg
from psycopg.rows import dict_row

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.schemas.accounting import PaymentConfirmRequest
from backend.app.services.audit import log_audit_event
from backend.app.services.commission_engine import (
    CommissionPolicy,
    EligibleTask,
    compute_commission,
)


ROLE_SORT_ORDER = {
    "ORIGINATOR": 1,
    "SUPERVISOR": 2,
    "CASE_MANAGER": 3,
    "EXECUTOR": 4,
    "ASSISTANT": 5,
}


def sort_commissions(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        items,
        key=lambda c: (
            ROLE_SORT_ORDER.get(c.get("role_type", ""), 99),
            Decimal(str(c.get("amount", "0"))),
            c.get("task_id") or "",
            c.get("user_id", "")
        )
    )


def format_money(val: Any) -> str:
    if val is None:
        return "0"
    d = Decimal(str(val))
    if d == d.to_integral_value():
        return str(int(d))
    return str(d)


def _replay_idempotency(payload: PaymentConfirmRequest, idempotency_key: str) -> Dict[str, Any]:
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """SELECT id, milestone_id, misa_invoice_no, bank_ref_code, received_amount, notes, confirmed_at, accountant_id
                   FROM misa_transactions
                   WHERE idempotency_key = %s""",
                (idempotency_key,)
            )
            existing = cur.fetchone()
            if not existing:
                raise AppException(500, "INTERNAL_ERROR", "Không thể tìm lại giao dịch theo Idempotency-Key")

            if (
                str(existing["milestone_id"]) != str(payload.milestone_id)
                or existing["misa_invoice_no"] != payload.misa_invoice_no
                or existing["bank_ref_code"] != payload.bank_ref_code
                or Decimal(str(existing["received_amount"])) != Decimal(payload.received_amount)
            ):
                raise AppException(409, "IDEMPOTENCY_KEY_REUSED", "Idempotency-Key đã được sử dụng cho một giao dịch khác")

            misa_id = existing["id"]
            milestone_id = existing["milestone_id"]

            cur.execute(
                """SELECT id, case_id, amount, received_total, status
                   FROM billing_milestones
                   WHERE id = %s""",
                (milestone_id,)
            )
            ms = cur.fetchone()
            if not ms:
                raise AppException(404, "NOT_FOUND", "Không tìm thấy đợt thanh toán")

            cur.execute(
                """SELECT user_id, role_type, amount, task_id
                   FROM commission_transactions
                   WHERE misa_transaction_id = %s""",
                (misa_id,)
            )
            comm_rows = cur.fetchall()

            commissions_data = []
            for c in comm_rows:
                item = {
                    "user_id": str(c["user_id"]),
                    "role_type": c["role_type"],
                    "amount": format_money(c["amount"]),
                }
                if c["task_id"] is not None:
                    item["task_id"] = str(c["task_id"])
                commissions_data.append(item)
            commissions_data = sort_commissions(commissions_data)

            cur.execute(
                """SELECT amount FROM commission_carry_forwards WHERE from_misa_transaction_id = %s""",
                (misa_id,)
            )
            cf_row = cur.fetchone()
            cf_amount = format_money(cf_row["amount"]) if cf_row else "0"

            cur.execute(
                """SELECT after_state
                   FROM audit_logs
                   WHERE action = 'PAYMENT_CONFIRMED'
                     AND entity_name = 'billing_milestones'
                     AND entity_id = %s
                     AND (after_state->>'misa_transaction_id') = %s
                   ORDER BY id DESC
                   LIMIT 1""",
                (str(milestone_id), str(misa_id))
            )
            audit_row = cur.fetchone()
            stage_unblocked = False
            if audit_row and audit_row["after_state"]:
                st_unb = audit_row["after_state"].get("stage_unblocked")
                if st_unb is not None:
                    stage_unblocked = bool(st_unb)

            amount_dec = Decimal(str(ms["amount"]))
            received_total_dec = Decimal(str(ms["received_total"]))
            remaining_dec = max(amount_dec - received_total_dec, Decimal("0"))

            warnings = []
            if received_total_dec > amount_dec:
                over = received_total_dec - amount_dec
                warnings.append({
                    "code": "OVERPAYMENT",
                    "amount": format_money(over),
                    "message": f"Số tiền thực thu vượt quá số phải thu {format_money(over)} VNĐ"
                })

            return {
                "success": True,
                "data": {
                    "milestone_status": ms["status"],
                    "received_total": format_money(received_total_dec),
                    "remaining": format_money(remaining_dec),
                    "stage_unblocked": stage_unblocked,
                    "commissions": commissions_data,
                    "execution_carried_forward": cf_amount,
                },
                "warnings": warnings,
            }


def confirm_payment_sync(
    payload: PaymentConfirmRequest,
    idempotency_key: str,
    current_user: Dict[str, Any]
) -> Dict[str, Any]:
    received_amount = Decimal(payload.received_amount)

    try:
        with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=False) as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                # 1. SELECT ... FOR UPDATE trên billing_milestones
                cur.execute(
                    """SELECT id, case_id, order_index, name, amount, received_total, status
                       FROM billing_milestones
                       WHERE id = %s
                       FOR UPDATE""",
                    (str(payload.milestone_id),)
                )
                milestone = cur.fetchone()
                if not milestone:
                    raise AppException(404, "NOT_FOUND", "Không tìm thấy đợt thanh toán")

                # 2. Kiểm tra Idempotency-Key
                cur.execute(
                    """SELECT id, milestone_id, misa_invoice_no, bank_ref_code, received_amount
                       FROM misa_transactions
                       WHERE idempotency_key = %s""",
                    (idempotency_key,)
                )
                existing = cur.fetchone()
                if existing:
                    conn.rollback()
                    return _replay_idempotency(payload, idempotency_key)

                # 3. Trạng thái đợt thu phải là AWAITING_PAYMENT hoặc PARTIALLY_PAID
                if milestone["status"] not in ("AWAITING_PAYMENT", "PARTIALLY_PAID"):
                    raise AppException(
                        409,
                        "MILESTONE_NOT_AWAITING_PAYMENT",
                        f"Đợt thanh toán không ở trạng thái chờ thu tiền (trạng thái: {milestone['status']})"
                    )

                # 4. bank_ref_code đã tồn tại
                cur.execute(
                    """SELECT id FROM misa_transactions WHERE bank_ref_code = %s""",
                    (payload.bank_ref_code,)
                )
                if cur.fetchone():
                    raise AppException(409, "DUPLICATE_BANK_REF", "Mã giao dịch ngân hàng đã được ghi nhận")

                case_id = milestone["case_id"]

                # 5. Xác định người nhận
                # Originator
                cur.execute(
                    """SELECT o.originator_id
                       FROM cases c
                       JOIN opportunities o ON c.opportunity_id = o.id
                       WHERE c.id = %s""",
                    (case_id,)
                )
                opp_row = cur.fetchone()
                originator_id = str(opp_row["originator_id"]) if opp_row and opp_row["originator_id"] else None

                # Case Manager & Supervisor
                cur.execute(
                    """SELECT user_id, role_in_case, assigned_at
                       FROM case_assignments
                       WHERE case_id = %s
                         AND unassigned_at IS NULL
                         AND role_in_case IN ('CASE_MANAGER', 'SUPERVISOR')
                       ORDER BY assigned_at ASC""",
                    (case_id,)
                )
                assignments = cur.fetchall()
                case_manager_id: Optional[str] = None
                supervisor_id: Optional[str] = None
                for a in assignments:
                    if a["role_in_case"] == "CASE_MANAGER" and case_manager_id is None:
                        case_manager_id = str(a["user_id"])
                    elif a["role_in_case"] == "SUPERVISOR" and supervisor_id is None:
                        supervisor_id = str(a["user_id"])

                if not case_manager_id:
                    raise AppException(409, "CASE_MANAGER_REQUIRED", "Vụ việc chưa có Case Manager đang phân công")

                # 6. INSERT misa_transactions
                misa_id = uuid.uuid4()
                cur.execute(
                    """INSERT INTO misa_transactions (
                           id, milestone_id, accountant_id, misa_invoice_no, bank_ref_code,
                           idempotency_key, received_amount, notes, confirmed_at, created_at
                       ) VALUES (
                           %s, %s, %s, %s, %s,
                           %s, %s, %s, NOW(), NOW()
                       )""",
                    (
                        str(misa_id),
                        str(milestone["id"]),
                        str(current_user["id"]),
                        payload.misa_invoice_no,
                        payload.bank_ref_code,
                        idempotency_key,
                        received_amount,
                        payload.notes,
                    )
                )

                # 7. commission_policies của vụ việc
                cur.execute(
                    """SELECT id, originator_rate, management_rate, supervisor_share_pct, execution_rate, locked_at
                       FROM commission_policies
                       WHERE case_id = %s
                       FOR UPDATE""",
                    (case_id,)
                )
                policy_row = cur.fetchone()
                if not policy_row:
                    raise AppException(422, "VALIDATION_ERROR", "Vụ việc chưa có chính sách hoa hồng")

                if policy_row["locked_at"] is None:
                    cur.execute(
                        """UPDATE commission_policies
                           SET locked_at = NOW(), updated_at = NOW()
                           WHERE id = %s""",
                        (policy_row["id"],)
                    )

                # 8. Task đủ điều kiện
                cur.execute(
                    """SELECT ct.id, ct.assigned_to, ct.complexity_weight, ct.completed_at
                       FROM case_tasks ct
                       WHERE ct.case_id = %s
                         AND ct.status = 'COMPLETED'
                         AND ct.assigned_to IS NOT NULL
                         AND NOT EXISTS (
                             SELECT 1 FROM commission_transactions com
                             WHERE com.task_id = ct.id AND com.role_type = 'EXECUTOR'
                         )
                       ORDER BY ct.completed_at ASC, ct.id ASC""",
                    (case_id,)
                )
                task_rows = cur.fetchall()
                eligible_tasks = [
                    EligibleTask(
                        task_id=str(r["id"]),
                        assignee_id=str(r["assigned_to"]),
                        weight=int(r["complexity_weight"]),
                        completed_at=r["completed_at"],
                    )
                    for r in task_rows
                ]

                # 9. Quỹ dồn D
                cur.execute(
                    """SELECT coalesce(sum(amount), 0) AS carry_in
                       FROM commission_carry_forwards
                       WHERE case_id = %s AND consumed_by_misa_transaction_id IS NULL""",
                    (case_id,)
                )
                carry_row = cur.fetchone()
                carry_in = Decimal(str(carry_row["carry_in"])) if carry_row else Decimal("0")

                # 10. compute_commission
                policy_obj = CommissionPolicy(
                    originator_rate=Decimal(str(policy_row["originator_rate"])),
                    management_rate=Decimal(str(policy_row["management_rate"])),
                    supervisor_share_pct=Decimal(str(policy_row["supervisor_share_pct"])),
                    execution_rate=Decimal(str(policy_row["execution_rate"])),
                )
                res = compute_commission(
                    received_amount,
                    policy_obj,
                    originator_id=originator_id,
                    supervisor_id=supervisor_id,
                    case_manager_id=case_manager_id,
                    eligible_tasks=eligible_tasks,
                    carry_in=carry_in,
                )

                for line in res.lines:
                    cur.execute(
                        """INSERT INTO commission_transactions (
                               id, misa_transaction_id, milestone_id, case_id, user_id,
                               role_type, task_id, base_amount, rate_pct, amount,
                               source, payout_status, created_at
                           ) VALUES (
                               gen_random_uuid(), %s, %s, %s, %s,
                               %s, %s, %s, %s, %s,
                               'SYSTEM', 'ACCUMULATED', NOW()
                           )""",
                        (
                            str(misa_id),
                            str(milestone["id"]),
                            str(case_id),
                            line.user_id,
                            line.role_type,
                            line.task_id,
                            line.base_amount,
                            line.rate_pct,
                            line.amount,
                        )
                    )

                if eligible_tasks and carry_in > Decimal("0"):
                    cur.execute(
                        """UPDATE commission_carry_forwards
                           SET consumed_by_misa_transaction_id = %s
                           WHERE case_id = %s AND consumed_by_misa_transaction_id IS NULL""",
                        (str(misa_id), case_id)
                    )

                if res.carried_forward > Decimal("0"):
                    cur.execute(
                        """INSERT INTO commission_carry_forwards (
                               id, case_id, from_misa_transaction_id, amount, created_at
                           ) VALUES (
                               gen_random_uuid(), %s, %s, %s, NOW()
                           )""",
                        (case_id, str(misa_id), res.carried_forward)
                    )

                # 11. Cập nhật billing_milestones
                current_total = Decimal(str(milestone["received_total"]))
                new_received_total = current_total + received_amount
                target_amount = Decimal(str(milestone["amount"]))
                new_status = "PAID_CONFIRMED" if new_received_total >= target_amount else "PARTIALLY_PAID"

                cur.execute(
                    """UPDATE billing_milestones
                       SET received_total = %s,
                           status = %s,
                           updated_at = NOW()
                       WHERE id = %s""",
                    (new_received_total, new_status, str(milestone["id"]))
                )

                # 12. Khi chuyển PAID_CONFIRMED: mở khoá stage
                stage_unblocked = False
                if new_status == "PAID_CONFIRMED":
                    cur.execute(
                        """UPDATE case_stages
                           SET status = 'ACTIVE', started_at = NOW(), updated_at = NOW()
                           WHERE blocking_milestone_id = %s AND status = 'WAITING_PAYMENT'
                           RETURNING id""",
                        (str(milestone["id"]),)
                    )
                    unblocked_stages = cur.fetchall()
                    if unblocked_stages:
                        stage_unblocked = True

                    outbox_payload = {
                        "milestone_id": str(milestone["id"]),
                        "case_id": str(case_id),
                    }
                    cur.execute(
                        """INSERT INTO outbox_events (event_type, payload, created_at)
                           VALUES ('MILESTONE_PAID', %s, NOW())""",
                        (json.dumps(outbox_payload),)
                    )

                # 13. log_audit_event
                after_state = {
                    "received_amount": format_money(received_amount),
                    "received_total": format_money(new_received_total),
                    "status": new_status,
                    "misa_transaction_id": str(misa_id),
                    "stage_unblocked": stage_unblocked,
                }
                log_audit_event(
                    conn=conn,
                    actor_type="USER",
                    action="PAYMENT_CONFIRMED",
                    entity_name="billing_milestones",
                    entity_id=str(milestone["id"]),
                    actor_id=str(current_user["id"]),
                    after_state=after_state,
                )

                conn.commit()

                # Response
                commissions_data = []
                for line in res.lines:
                    item = {
                        "user_id": line.user_id,
                        "role_type": line.role_type,
                        "amount": format_money(line.amount),
                    }
                    if line.task_id is not None:
                        item["task_id"] = line.task_id
                    commissions_data.append(item)
                commissions_data = sort_commissions(commissions_data)

                remaining_dec = max(target_amount - new_received_total, Decimal("0"))
                warnings = []
                if new_received_total > target_amount:
                    over = new_received_total - target_amount
                    warnings.append({
                        "code": "OVERPAYMENT",
                        "amount": format_money(over),
                        "message": f"Số tiền thực thu vượt quá số phải thu {format_money(over)} VNĐ"
                    })

                return {
                    "success": True,
                    "data": {
                        "milestone_status": new_status,
                        "received_total": format_money(new_received_total),
                        "remaining": format_money(remaining_dec),
                        "stage_unblocked": stage_unblocked,
                        "commissions": commissions_data,
                        "execution_carried_forward": format_money(res.carried_forward),
                    },
                    "warnings": warnings,
                }
    except psycopg.errors.UniqueViolation as e:
        err_msg = str(e).lower()
        if "bank_ref_code" in err_msg:
            raise AppException(409, "DUPLICATE_BANK_REF", "Mã giao dịch ngân hàng đã được ghi nhận")
        if "idempotency_key" in err_msg:
            return _replay_idempotency(payload, idempotency_key)
        raise


def get_accounting_inbox_sync(
    statuses: List[str],
    q: Optional[str],
    page: int,
    limit: int,
) -> Dict[str, Any]:
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            if q and q.strip():
                q_str = f"%{q.strip()}%"
                where_q = "AND (c.case_code ILIKE %s OR c.title ILIKE %s OR cl.name ILIKE %s)"
                q_params = [q_str, q_str, q_str]
            else:
                where_q = ""
                q_params = []

            # Đếm tổng
            cur.execute(
                f"""SELECT count(*) AS total
                   FROM billing_milestones bm
                   JOIN cases c ON bm.case_id = c.id
                   JOIN clients cl ON c.client_id = cl.id
                   WHERE bm.status = ANY(%s)
                     {where_q}""",
                (statuses, *q_params)
            )
            total_records = cur.fetchone()["total"]

            total_pages = math.ceil(total_records / limit) if total_records > 0 else 0
            offset = (page - 1) * limit

            cur.execute(
                f"""SELECT
                       bm.id AS milestone_id,
                       bm.name AS milestone_name,
                       bm.amount AS milestone_amount,
                       bm.received_total AS milestone_received_total,
                       bm.status AS milestone_status,
                       bm.requested_at AS milestone_requested_at,
                       c.id AS case_id,
                       c.case_code AS case_code,
                       c.title AS case_title,
                       cl.name AS client_name
                   FROM billing_milestones bm
                   JOIN cases c ON bm.case_id = c.id
                   JOIN clients cl ON c.client_id = cl.id
                   WHERE bm.status = ANY(%s)
                     {where_q}
                   ORDER BY bm.requested_at ASC NULLS LAST, bm.id ASC
                   LIMIT %s OFFSET %s""",
                (statuses, *q_params, limit, offset)
            )
            milestones = cur.fetchall()

            if not milestones:
                return {
                    "success": True,
                    "data": [],
                    "meta": {
                        "page": page,
                        "limit": limit,
                        "total_records": total_records,
                        "total_pages": total_pages,
                    }
                }

            milestone_ids = [str(m["milestone_id"]) for m in milestones]
            cur.execute(
                """SELECT
                       mt.milestone_id,
                       mt.received_amount,
                       mt.misa_invoice_no,
                       mt.bank_ref_code,
                       mt.confirmed_at,
                       u.full_name AS accountant_name
                   FROM misa_transactions mt
                   JOIN users u ON mt.accountant_id = u.id
                   WHERE mt.milestone_id = ANY(%s)
                   ORDER BY mt.confirmed_at ASC, mt.id ASC""",
                (milestone_ids,)
            )
            payment_rows = cur.fetchall()

            payments_by_mid: Dict[str, List[Dict[str, Any]]] = {}
            for p in payment_rows:
                mid = str(p["milestone_id"])
                if mid not in payments_by_mid:
                    payments_by_mid[mid] = []
                payments_by_mid[mid].append({
                    "received_amount": format_money(p["received_amount"]),
                    "misa_invoice_no": p["misa_invoice_no"],
                    "bank_ref_code": p["bank_ref_code"],
                    "confirmed_at": p["confirmed_at"].isoformat() if p["confirmed_at"] else None,
                    "confirmed_by": {
                        "full_name": p["accountant_name"]
                    }
                })

            data = []
            for m in milestones:
                mid = str(m["milestone_id"])
                amt = Decimal(str(m["milestone_amount"]))
                rec = Decimal(str(m["milestone_received_total"]))
                rem = max(amt - rec, Decimal("0"))
                data.append({
                    "milestone_id": mid,
                    "case": {
                        "id": str(m["case_id"]),
                        "case_code": m["case_code"],
                        "title": m["case_title"],
                        "client_name": m["client_name"]
                    },
                    "name": m["milestone_name"],
                    "amount": format_money(amt),
                    "received_total": format_money(rec),
                    "remaining": format_money(rem),
                    "status": m["milestone_status"],
                    "awaiting_since": m["milestone_requested_at"].isoformat() if m["milestone_requested_at"] else None,
                    "payments": payments_by_mid.get(mid, []),
                })

            return {
                "success": True,
                "data": data,
                "meta": {
                    "page": page,
                    "limit": limit,
                    "total_records": total_records,
                    "total_pages": total_pages,
                }
            }
