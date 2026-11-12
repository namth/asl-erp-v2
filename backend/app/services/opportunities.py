from decimal import Decimal
from typing import Optional, Dict, Any
import psycopg
from psycopg.rows import dict_row

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.schemas.crm import OpportunityPatchRequest

ALLOWED_TRANSITIONS = {
    "NEW_LEAD": {"PROPOSAL_SENT", "LOST"},
    "PROPOSAL_SENT": {"NEGOTIATION", "LOST"},
    "NEGOTIATION": {"WON", "LOST"},
    "WON": set(),
    "LOST": set(),
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
