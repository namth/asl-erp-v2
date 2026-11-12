import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, Any, List, Optional
import psycopg
from psycopg.rows import dict_row

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.schemas.crm import OpportunityConvertRequest
from backend.app.services.audit import log_audit_event


def convert_opportunity_to_case(
    opp_id: str,
    payload: OpportunityConvertRequest,
    current_user: Dict[str, Any]
) -> Dict[str, Any]:
    """Chuyển đổi 1-chạm cơ hội WON thành vụ việc INITIALIZING trong một transaction nguyên tử."""
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=False) as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            # 1. Khoá dòng cơ hội FOR UPDATE
            cur.execute(
                """SELECT id, stage, converted_case_id, client_id, originator_id, title
                   FROM opportunities
                   WHERE id = %s
                   FOR UPDATE""",
                (opp_id,)
            )
            opp = cur.fetchone()
            if not opp:
                raise AppException(404, "NOT_FOUND", "Không tìm thấy cơ hội kinh doanh")

            if opp["stage"] != "WON":
                raise AppException(
                    409,
                    "OPPORTUNITY_NOT_WON",
                    f"Chỉ có thể chuyển đổi cơ hội ở trạng thái WON (hiện tại: {opp['stage']})"
                )

            if opp["converted_case_id"] is not None:
                raise AppException(
                    409,
                    "OPPORTUNITY_ALREADY_CONVERTED",
                    "Cơ hội này đã được chuyển đổi thành vụ việc trước đó"
                )

            # 2. Tìm phiên bản template PUBLISHED mới nhất của matter_type_id
            cur.execute(
                """SELECT v.id AS version_id, v.version_no, t.mode AS workflow_mode,
                          m.id AS matter_type_id, m.department_id, m.code AS matter_code,
                          m.default_originator_rate, m.default_management_rate,
                          m.default_supervisor_share_pct, m.default_execution_rate
                   FROM workflow_template_versions v
                   JOIN workflow_templates t ON v.template_id = t.id
                   JOIN matter_types m ON t.matter_type_id = m.id
                   WHERE t.matter_type_id = %s
                     AND t.is_active = TRUE
                     AND v.status = 'PUBLISHED'
                   ORDER BY v.version_no DESC
                   LIMIT 1""",
                (payload.matter_type_id,)
            )
            tmpl = cur.fetchone()
            if not tmpl:
                raise AppException(
                    409,
                    "NO_PUBLISHED_TEMPLATE",
                    "Loại vụ việc chưa có phiên bản quy trình mẫu nào ở trạng thái PUBLISHED"
                )

            # 3. Kiểm tra tổng milestones.amount <= contract_value
            total_milestone_amount = sum(Decimal(str(m.amount)) for m in payload.milestones)
            contract_value = Decimal(str(payload.contract_value))
            if total_milestone_amount > contract_value:
                raise AppException(
                    422,
                    "MILESTONES_EXCEED_CONTRACT",
                    f"Tổng tiền các đợt thu ({total_milestone_amount}) vượt quá giá trị hợp đồng ({contract_value})"
                )

            # 4. Sinh case_code từ case_code_sequences (nguyên tử)
            year = datetime.now(timezone.utc).year
            matter_code = tmpl["matter_code"]
            cur.execute(
                """INSERT INTO case_code_sequences (year, matter_code, last_no)
                   VALUES (%s, %s, 1)
                   ON CONFLICT (year, matter_code)
                   DO UPDATE SET last_no = case_code_sequences.last_no + 1
                   RETURNING last_no""",
                (year, matter_code)
            )
            last_no = cur.fetchone()["last_no"]
            case_code = f"ASL-{year}-{matter_code}-{last_no:04d}"

            # 5. Xử lý originator_id
            originator_id = str(opp["originator_id"])
            if payload.originator_id and (
                current_user.get("system_role") == "MANAGER" or current_user.get("is_executive")
            ):
                originator_id = payload.originator_id
                cur.execute(
                    "UPDATE opportunities SET originator_id = %s, updated_at = NOW() WHERE id = %s",
                    (originator_id, opp_id)
                )

            # 6. Tạo vụ việc (cases)
            case_id = str(uuid.uuid4())
            cur.execute(
                """INSERT INTO cases (
                    id, case_code, title, client_id, opportunity_id,
                    matter_type_id, department_id, template_version_id,
                    workflow_mode, contract_value, status, created_by
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'INITIALIZING', %s)""",
                (
                    case_id,
                    case_code,
                    payload.title,
                    opp["client_id"],
                    opp_id,
                    payload.matter_type_id,
                    tmpl["department_id"],
                    tmpl["version_id"],
                    tmpl["workflow_mode"],
                    contract_value,
                    current_user["id"]
                )
            )

            # 7. Sao chép stages từ template
            cur.execute(
                """SELECT id, name, order_index, requires_approval
                   FROM template_stages
                   WHERE template_version_id = %s
                   ORDER BY order_index""",
                (tmpl["version_id"],)
            )
            template_stages = cur.fetchall()

            stage_map: Dict[str, str] = {}
            for s in template_stages:
                case_stage_id = str(uuid.uuid4())
                status = "ACTIVE" if s["order_index"] == 1 else "LOCKED"
                stage_map[str(s["id"])] = case_stage_id
                cur.execute(
                    """INSERT INTO case_stages (
                        id, case_id, template_stage_id, name, order_index,
                        requires_approval, status
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    (
                        case_stage_id,
                        case_id,
                        s["id"],
                        s["name"],
                        s["order_index"],
                        s["requires_approval"],
                        status
                    )
                )

            # 8. Tạo billing_milestones
            milestone_map: Dict[int, str] = {}
            for idx, m in enumerate(payload.milestones, start=1):
                milestone_id = str(uuid.uuid4())
                milestone_map[idx] = milestone_id
                cur.execute(
                    """INSERT INTO billing_milestones (
                        id, case_id, order_index, name, amount, received_total, status
                    ) VALUES (%s, %s, %s, %s, %s, 0, 'PENDING')""",
                    (
                        milestone_id,
                        case_id,
                        idx,
                        m.name,
                        Decimal(str(m.amount))
                    )
                )

            # 9. Sao chép tasks từ template
            template_stage_ids = [s["id"] for s in template_stages]
            template_tasks = []
            if template_stage_ids:
                cur.execute(
                    """SELECT id, template_stage_id, title, description,
                              complexity_weight, requires_approval, triggers_milestone_order
                       FROM template_tasks
                       WHERE template_stage_id = ANY(%s)
                       ORDER BY created_at""",
                    (template_stage_ids,)
                )
                template_tasks = cur.fetchall()

            task_map: Dict[str, str] = {}
            for t in template_tasks:
                case_task_id = str(uuid.uuid4())
                t_stage_id = str(t["template_stage_id"])
                case_stage_id = stage_map[t_stage_id]
                triggers_milestone_id = None
                if t["triggers_milestone_order"]:
                    triggers_milestone_id = milestone_map.get(t["triggers_milestone_order"])

                task_map[str(t["id"])] = case_task_id
                cur.execute(
                    """INSERT INTO case_tasks (
                        id, case_id, stage_id, template_task_id, title, description,
                        status, complexity_weight, requires_approval, triggers_milestone_id
                    ) VALUES (%s, %s, %s, %s, %s, %s, 'TODO', %s, %s, %s)""",
                    (
                        case_task_id,
                        case_id,
                        case_stage_id,
                        t["id"],
                        t["title"],
                        t["description"],
                        t["complexity_weight"],
                        t["requires_approval"],
                        triggers_milestone_id
                    )
                )

            # 10. Sao chép task dependencies
            if task_map:
                t_ids = list(task_map.keys())
                cur.execute(
                    """SELECT template_task_id, depends_on_template_task_id
                       FROM template_task_dependencies
                       WHERE template_task_id = ANY(%s)""",
                    (t_ids,)
                )
                deps = cur.fetchall()
                for dep in deps:
                    c_task = task_map.get(str(dep["template_task_id"]))
                    c_dep = task_map.get(str(dep["depends_on_template_task_id"]))
                    if c_task and c_dep:
                        cur.execute(
                            """INSERT INTO case_task_dependencies (case_task_id, depends_on_task_id)
                               VALUES (%s, %s)""",
                            (c_task, c_dep)
                        )

            # 11. Tạo commission_policies từ matter_types.default_*
            cur.execute(
                """INSERT INTO commission_policies (
                    case_id, originator_rate, management_rate,
                    supervisor_share_pct, execution_rate
                ) VALUES (%s, %s, %s, %s, %s)""",
                (
                    case_id,
                    tmpl["default_originator_rate"],
                    tmpl["default_management_rate"],
                    tmpl["default_supervisor_share_pct"],
                    tmpl["default_execution_rate"]
                )
            )

            # 12. Cập nhật converted_case_id vào opportunities
            cur.execute(
                "UPDATE opportunities SET converted_case_id = %s, updated_at = NOW() WHERE id = %s",
                (case_id, opp_id)
            )

            # 13. Ghi outbox_events
            outbox_payload = {
                "case_id": case_id,
                "case_code": case_code,
                "opportunity_id": opp_id,
                "client_id": str(opp["client_id"]),
                "originator_id": originator_id,
                "title": payload.title,
                "contract_value": str(contract_value)
            }
            cur.execute(
                """INSERT INTO outbox_events (event_type, payload, status)
                   VALUES ('CASE_CREATED', %s, 'PENDING')""",
                (json.dumps(outbox_payload),)
            )

            # 14. Ghi audit_logs (log_audit_event)
            log_audit_event(
                conn,
                actor_type="USER",
                action="OPPORTUNITY_CONVERTED",
                entity_name="opportunities",
                entity_id=str(opp_id),
                actor_id=str(current_user["id"]),
                before_state={"stage": "WON", "converted_case_id": None},
                after_state={"converted_case_id": case_id, "case_code": case_code}
            )

            conn.commit()

            return {
                "case_id": case_id,
                "case_code": case_code,
                "status": "INITIALIZING",
                "workflow_mode": tmpl["workflow_mode"],
                "template_version": tmpl["version_no"],
                "total_stages": len(template_stages),
                "total_tasks_created": len(template_tasks)
            }
