import math
import uuid
from decimal import Decimal
from typing import Optional, Dict, Any, List
from fastapi import Request
import psycopg
from psycopg.rows import dict_row

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.schemas.crm import OpportunityPatchRequest, OpportunityCreate
from backend.app.services.audit import log_audit_event
from backend.app.services.text_normalize import normalize_text

ALLOWED_TRANSITIONS = {
    "NEW_LEAD": {"PROPOSAL_SENT", "LOST"},
    "PROPOSAL_SENT": {"NEGOTIATION", "LOST"},
    "NEGOTIATION": {"WON", "LOST"},
    "WON": set(),
    "LOST": set(),
}

VI_ACCENTED_CHARS = (
    "àáảãạăằắẳẵặâầấẩẫậ"
    "èéẻẽẹêềếểễệ"
    "ìíỉĩị"
    "òóỏõọôồốổỗộơờớởỡợ"
    "ùúủũụưừứửữự"
    "ỳýỷỹỵ"
    "đ"
)
FROM_CHARS = VI_ACCENTED_CHARS
TO_CHARS = "".join(normalize_text(c) for c in VI_ACCENTED_CHARS)


def list_opportunities(
    current_user: Dict[str, Any],
    stage: Optional[str] = None,
    client_id: Optional[str] = None,
    q: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
) -> Dict[str, Any]:
    if page < 1:
        raise AppException(
            422,
            "VALIDATION_ERROR",
            "page phải lớn hơn hoặc bằng 1",
            details={"fields": [{"field": "page", "message": "page phải >= 1"}]}
        )
    if limit < 1 or limit > 100:
        raise AppException(
            422,
            "VALIDATION_ERROR",
            "limit phải từ 1 đến 100",
            details={"fields": [{"field": "limit", "message": "limit phải từ 1 đến 100"}]}
        )

    valid_stages = {"NEW_LEAD", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"}
    if stage is not None and stage not in valid_stages:
        raise AppException(
            422,
            "VALIDATION_ERROR",
            f"Trạng thái cơ hội không hợp lệ: {stage}",
            details={"fields": [{"field": "stage", "message": f"stage phải là một trong {sorted(valid_stages)}"}]}
        )

    if client_id is not None:
        try:
            uuid.UUID(str(client_id))
        except ValueError:
            raise AppException(
                422,
                "VALIDATION_ERROR",
                "client_id không đúng định dạng UUID",
                details={"fields": [{"field": "client_id", "message": "client_id không hợp lệ"}]}
            )

    role = current_user.get("system_role")
    where_clauses = ["1=1"]
    params: Dict[str, Any] = {}

    if role == "ATTORNEY":
        where_clauses.append("o.originator_id = %(originator_id)s")
        params["originator_id"] = current_user["id"]
    elif role == "MANAGER":
        pass
    else:
        raise AppException(
            403,
            "FORBIDDEN_ROLE",
            f"Vai trò {role} không có quyền truy cập cơ hội kinh doanh"
        )

    if stage:
        where_clauses.append("o.stage = %(stage)s")
        params["stage"] = stage

    if client_id:
        where_clauses.append("o.client_id = %(client_id)s")
        params["client_id"] = client_id

    if q and q.strip():
        q_norm = f"%{normalize_text(q.strip())}%"
        where_clauses.append(
            "(translate(lower(o.title), %(from_chars)s, %(to_chars)s) ILIKE %(q_norm)s OR c.normalized_name ILIKE %(q_norm)s)"
        )
        params["from_chars"] = FROM_CHARS
        params["to_chars"] = TO_CHARS
        params["q_norm"] = q_norm

    where_sql = " AND ".join(where_clauses)
    offset = (page - 1) * limit
    params["limit"] = limit
    params["offset"] = offset

    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"""SELECT count(*) AS total
                    FROM opportunities o
                    JOIN clients c ON o.client_id = c.id
                    LEFT JOIN users u ON o.originator_id = u.id
                    WHERE {where_sql}""",
                params
            )
            total_records = cur.fetchone()["total"]
            total_pages = math.ceil(total_records / limit) if total_records > 0 else 0

            cur.execute(
                f"""SELECT o.id, o.client_id, c.name AS client_name, o.title, o.lead_source,
                           o.expected_value, o.probability_pct, o.stage, o.lost_reason,
                           o.originator_id, u.full_name AS originator_name, o.converted_case_id,
                           o.created_at, o.updated_at
                    FROM opportunities o
                    JOIN clients c ON o.client_id = c.id
                    LEFT JOIN users u ON o.originator_id = u.id
                    WHERE {where_sql}
                    ORDER BY o.updated_at DESC, o.id ASC
                    LIMIT %(limit)s OFFSET %(offset)s""",
                params
            )
            rows = cur.fetchall()

    items = []
    for r in rows:
        items.append({
            "id": str(r["id"]),
            "client_id": str(r["client_id"]),
            "client_name": r["client_name"],
            "title": r["title"],
            "lead_source": r["lead_source"],
            "expected_value": str(r["expected_value"]),
            "probability_pct": r["probability_pct"],
            "stage": r["stage"],
            "lost_reason": r["lost_reason"],
            "originator_id": str(r["originator_id"]),
            "originator_name": r["originator_name"],
            "converted_case_id": str(r["converted_case_id"]) if r["converted_case_id"] else None,
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        })

    return {
        "data": items,
        "meta": {
            "page": page,
            "limit": limit,
            "total_records": total_records,
            "total_pages": total_pages,
        }
    }


def create_opportunity(
    payload: OpportunityCreate,
    current_user: Dict[str, Any],
    request: Request,
) -> Dict[str, Any]:
    role = current_user.get("system_role")
    user_id = str(current_user["id"])

    if role == "ATTORNEY":
        if payload.originator_id and payload.originator_id != user_id:
            raise AppException(
                403,
                "FORBIDDEN_ROLE",
                "Luật sư chỉ có thể tạo cơ hội kinh doanh cho chính mình"
            )
        originator_id = user_id
    elif role == "MANAGER":
        if payload.originator_id:
            try:
                orig_uuid = uuid.UUID(str(payload.originator_id))
            except ValueError:
                raise AppException(
                    422,
                    "VALIDATION_ERROR",
                    "originator_id không đúng định dạng UUID",
                    details={"fields": [{"field": "originator_id", "message": "originator_id không hợp lệ"}]}
                )
            originator_id = str(orig_uuid)
        else:
            originator_id = user_id
    else:
        raise AppException(
            403,
            "FORBIDDEN_ROLE",
            f"Vai trò {role} không có quyền tạo cơ hội kinh doanh"
        )

    try:
        client_uuid = uuid.UUID(str(payload.client_id))
    except ValueError:
        raise AppException(
            404,
            "NOT_FOUND",
            "Không tìm thấy khách hàng"
        )

    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=False) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT name FROM clients WHERE id = %s", (client_uuid,))
            c_row = cur.fetchone()
            if not c_row:
                raise AppException(404, "NOT_FOUND", "Không tìm thấy khách hàng")
            client_name = c_row["name"]

            originator_name = None
            if role == "MANAGER" and payload.originator_id:
                cur.execute("SELECT full_name, is_active FROM users WHERE id = %s", (originator_id,))
                u_row = cur.fetchone()
                if not u_row or not u_row["is_active"]:
                    raise AppException(
                        422,
                        "VALIDATION_ERROR",
                        "Người mang khách về không tồn tại hoặc đã bị vô hiệu hoá",
                        details={"fields": [{"field": "originator_id", "message": "Người mang khách về không hợp lệ hoặc đã bị vô hiệu hoá"}]}
                    )
                originator_name = u_row["full_name"]
            else:
                cur.execute("SELECT full_name FROM users WHERE id = %s", (originator_id,))
                u_row = cur.fetchone()
                originator_name = u_row["full_name"] if u_row else None

            opp_id = str(uuid.uuid4())
            exp_val = Decimal(str(payload.expected_value))
            prob_pct = payload.probability_pct
            title_clean = payload.title.strip()

            cur.execute(
                """INSERT INTO opportunities (
                    id, client_id, title, lead_source, expected_value,
                    probability_pct, stage, lost_reason, originator_id,
                    created_at, updated_at
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, 'NEW_LEAD', NULL, %s,
                    NOW(), NOW()
                ) RETURNING created_at, updated_at""",
                (
                    opp_id,
                    client_uuid,
                    title_clean,
                    payload.lead_source,
                    exp_val,
                    prob_pct,
                    originator_id
                )
            )
            t_row = cur.fetchone()
            created_at = t_row["created_at"]
            updated_at = t_row["updated_at"]

            after_state = {
                "id": opp_id,
                "client_id": str(client_uuid),
                "title": title_clean,
                "lead_source": payload.lead_source,
                "expected_value": str(exp_val),
                "probability_pct": prob_pct,
                "stage": "NEW_LEAD",
                "originator_id": originator_id
            }

            ip = request.client.host if request.client else "127.0.0.1"
            ua = request.headers.get("user-agent", "ASL-Client/2.0")

            log_audit_event(
                conn,
                actor_type="USER",
                action="OPPORTUNITY_CREATED",
                entity_name="opportunities",
                entity_id=opp_id,
                actor_id=user_id,
                before_state=None,
                after_state=after_state,
                ip_address=ip,
                user_agent=ua
            )

            conn.commit()

            return {
                "id": opp_id,
                "client_id": str(client_uuid),
                "client_name": client_name,
                "title": title_clean,
                "lead_source": payload.lead_source,
                "expected_value": str(exp_val),
                "probability_pct": prob_pct,
                "stage": "NEW_LEAD",
                "lost_reason": None,
                "originator_id": originator_id,
                "originator_name": originator_name,
                "converted_case_id": None,
                "created_at": created_at.isoformat(),
                "updated_at": updated_at.isoformat(),
            }



def update_opportunity(
    opp_id: str,
    patch: OpportunityPatchRequest,
    current_user: Dict[str, Any]
) -> Dict[str, Any]:
    """Cập nhật thông tin cơ hội và thực thi máy trạng thái CRM §1.1."""
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=False) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """SELECT id, client_id, title, lead_source, expected_value,
                          probability_pct, stage, lost_reason, originator_id,
                          converted_case_id
                   FROM opportunities
                   WHERE id = %s
                   FOR UPDATE""",
                (opp_id,)
            )
            opp = cur.fetchone()
            if not opp:
                raise AppException(404, "NOT_FOUND", "Không tìm thấy cơ hội kinh doanh")

            current_stage = opp["stage"]
            new_stage = patch.stage

            # Kiểm tra trạng thái cuối (Terminal states: WON, LOST)
            if new_stage is not None:
                if current_stage in ("WON", "LOST"):
                    raise AppException(
                        409,
                        "INVALID_STATE_TRANSITION",
                        f"Cơ hội đã ở trạng thái kết thúc ({current_stage}), không thể thay đổi trạng thái"
                    )

                valid_next = ALLOWED_TRANSITIONS.get(current_stage, set())
                if new_stage not in valid_next:
                    raise AppException(
                        409,
                        "INVALID_STATE_TRANSITION",
                        f"Không thể chuyển trạng thái từ {current_stage} sang {new_stage}"
                    )

                if new_stage == "LOST":
                    if not patch.lost_reason or not patch.lost_reason.strip():
                        raise AppException(
                            422,
                            "VALIDATION_ERROR",
                            "Lý do mất cơ hội (lost_reason) là bắt buộc khi chuyển sang LOST",
                            details={"fields": [{"field": "lost_reason", "message": "Bắt buộc có lý do khi chuyển sang LOST"}]}
                        )

            # Cập nhật các trường
            update_fields = []
            update_params = []

            if new_stage is not None:
                update_fields.append("stage = %s")
                update_params.append(new_stage)

            if patch.lost_reason is not None:
                update_fields.append("lost_reason = %s")
                update_params.append(patch.lost_reason.strip())

            if patch.expected_value is not None:
                update_fields.append("expected_value = %s")
                update_params.append(patch.expected_value)

            if patch.probability_pct is not None:
                update_fields.append("probability_pct = %s")
                update_params.append(patch.probability_pct)

            if update_fields:
                update_fields.append("updated_at = NOW()")
                update_params.append(opp_id)
                cur.execute(
                    f"UPDATE opportunities SET {', '.join(update_fields)} WHERE id = %s RETURNING *",
                    update_params
                )
                updated_opp = cur.fetchone()
                conn.commit()
                return dict(updated_opp)
            else:
                conn.commit()
                return dict(opp)
