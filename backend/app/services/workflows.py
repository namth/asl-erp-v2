"""Nghiệp vụ Trình thiết kế quy trình (Workflow Builder), Phiên bản & Ngày nghỉ lễ."""
import json
import uuid
from typing import Dict, Any, List, Optional, Tuple
import psycopg
from psycopg.rows import dict_row

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.schemas.workflows import (
    WorkflowTemplateCreate,
    WorkflowTemplatePatch,
    WorkflowVersionTreePayload,
    CustomFieldsUpdateRequest,
    HolidaysUpdateRequest
)
from backend.app.services.audit import log_audit_event
from backend.app.services.workflow_graph import find_cycle, validate_stage_dependencies

# ---------- Database Connection Helper ----------

def get_db_conn() -> psycopg.Connection:
    return psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=False)

# ---------- 1. Template Management ----------

def list_templates(matter_type_id: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_db_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            if matter_type_id:
                cur.execute(
                    """SELECT id, matter_type_id, name, mode, is_active, created_at, updated_at
                       FROM workflow_templates
                       WHERE matter_type_id = %s
                       ORDER BY created_at ASC""",
                    (matter_type_id,)
                )
            else:
                cur.execute(
                    """SELECT id, matter_type_id, name, mode, is_active, created_at, updated_at
                       FROM workflow_templates
                       ORDER BY created_at ASC"""
                )
            templates = cur.fetchall()

            result = []
            for t in templates:
                t_id = str(t["id"])
                # Published version no
                cur.execute(
                    """SELECT version_no FROM workflow_template_versions
                       WHERE template_id = %s AND status = 'PUBLISHED'
                       ORDER BY version_no DESC LIMIT 1""",
                    (t_id,)
                )
                pub_row = cur.fetchone()
                pub_ver_no = pub_row["version_no"] if pub_row else None

                # Draft version id
                cur.execute(
                    """SELECT id FROM workflow_template_versions
                       WHERE template_id = %s AND status = 'DRAFT'
                       LIMIT 1""",
                    (t_id,)
                )
                draft_row = cur.fetchone()
                draft_id = str(draft_row["id"]) if draft_row else None

                result.append({
                    "id": t_id,
                    "matter_type_id": str(t["matter_type_id"]),
                    "name": t["name"],
                    "mode": t["mode"],
                    "is_active": t["is_active"],
                    "published_version_no": pub_ver_no,
                    "draft_version_id": draft_id
                })
            return result

def create_template(payload: WorkflowTemplateCreate) -> Dict[str, Any]:
    with get_db_conn() as conn:
        try:
            with conn.cursor(row_factory=dict_row) as cur:
                # Kiểm tra matter_type có template active chưa
                cur.execute(
                    """SELECT id FROM workflow_templates
                       WHERE matter_type_id = %s AND is_active = TRUE""",
                    (payload.matter_type_id,)
                )
                if cur.fetchone():
                    raise AppException(409, "ACTIVE_TEMPLATE_EXISTS", "Loại vụ việc đã có quy trình đang hoạt động")

                # Chèn template mới
                cur.execute(
                    """INSERT INTO workflow_templates (matter_type_id, name, mode, is_active)
                       VALUES (%s, %s, %s, TRUE)
                       RETURNING id, matter_type_id, name, mode, is_active""",
                    (payload.matter_type_id, payload.name, payload.mode)
                )
                t = cur.fetchone()
                template_id = str(t["id"])

                # Tạo phiên bản 1 DRAFT rỗng
                cur.execute(
                    """INSERT INTO workflow_template_versions (template_id, version_no, status)
                       VALUES (%s, 1, 'DRAFT')
                       RETURNING id""",
                    (template_id,)
                )
                v = cur.fetchone()
                draft_version_id = str(v["id"])

                conn.commit()
                return {
                    "id": template_id,
                    "matter_type_id": str(t["matter_type_id"]),
                    "name": t["name"],
                    "mode": t["mode"],
                    "is_active": t["is_active"],
                    "draft_version_id": draft_version_id
                }
        except Exception:
            conn.rollback()
            raise

def patch_template(template_id: str, payload: WorkflowTemplatePatch) -> Dict[str, Any]:
    with get_db_conn() as conn:
        try:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute("SELECT * FROM workflow_templates WHERE id = %s", (template_id,))
                t = cur.fetchone()
                if not t:
                    raise AppException(404, "NOT_FOUND", "Không tìm thấy template quy trình")

                if payload.is_active is True and not t["is_active"]:
                    # Kiểm tra xem có template active khác không
                    cur.execute(
                        """SELECT id FROM workflow_templates
                           WHERE matter_type_id = %s AND is_active = TRUE AND id != %s""",
                        (str(t["matter_type_id"]), template_id)
                    )
                    if cur.fetchone():
                        raise AppException(409, "ACTIVE_TEMPLATE_EXISTS", "Loại vụ việc đã có quy trình đang hoạt động")

                updates = []
                params = []
                if payload.name is not None:
                    updates.append("name = %s")
                    params.append(payload.name)
                if payload.mode is not None:
                    updates.append("mode = %s")
                    params.append(payload.mode)
                if payload.is_active is not None:
                    updates.append("is_active = %s")
                    params.append(payload.is_active)

                if updates:
                    updates.append("updated_at = NOW()")
                    params.append(template_id)
                    query = f"UPDATE workflow_templates SET {', '.join(updates)} WHERE id = %s RETURNING id, matter_type_id, name, mode, is_active"
                    cur.execute(query, tuple(params))
                    t = cur.fetchone()

                conn.commit()
                return {
                    "id": str(t["id"]),
                    "matter_type_id": str(t["matter_type_id"]),
                    "name": t["name"],
                    "mode": t["mode"],
                    "is_active": t["is_active"]
                }
        except Exception:
            conn.rollback()
            raise

# ---------- 2. Version Management ----------

def list_template_versions(template_id: str) -> List[Dict[str, Any]]:
    with get_db_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """SELECT id, template_id, version_no, status, published_by, published_at
                   FROM workflow_template_versions
                   WHERE template_id = %s
                   ORDER BY version_no ASC""",
                (template_id,)
            )
            rows = cur.fetchall()
            return [
                {
                    "id": str(r["id"]),
                    "template_id": str(r["template_id"]),
                    "version_no": r["version_no"],
                    "status": r["status"],
                    "published_by": str(r["published_by"]) if r["published_by"] else None,
                    "published_at": r["published_at"].isoformat() if r["published_at"] else None
                }
                for r in rows
            ]

def create_new_version(template_id: str) -> Dict[str, Any]:
    """Tạo DRAFT mới sao chép từ bản PUBLISHED mới nhất. Đã có DRAFT -> 409 DRAFT_VERSION_EXISTS."""
    with get_db_conn() as conn:
        try:
            with conn.cursor(row_factory=dict_row) as cur:
                # 1. Kiểm tra template tồn tại
                # Khoá dòng template: hai yêu cầu tạo bản mới đồng thời phải xếp hàng, yêu cầu sau nhận 409 thay vì lỗi trùng version_no
                cur.execute("SELECT id FROM workflow_templates WHERE id = %s FOR UPDATE", (template_id,))
                if not cur.fetchone():
                    raise AppException(404, "NOT_FOUND", "Không tìm thấy template quy trình")

                # 2. Kiểm tra đã có DRAFT chưa
                cur.execute(
                    """SELECT id FROM workflow_template_versions
                       WHERE template_id = %s AND status = 'DRAFT'""",
                    (template_id,)
                )
                if cur.fetchone():
                    raise AppException(409, "DRAFT_VERSION_EXISTS", "Template đã có một phiên bản DRAFT")

                # 3. Lấy version_no cao nhất
                cur.execute(
                    """SELECT COALESCE(MAX(version_no), 0) AS max_v
                       FROM workflow_template_versions
                       WHERE template_id = %s""",
                    (template_id,)
                )
                max_v = cur.fetchone()["max_v"]
                next_version_no = max_v + 1

                # 4. Tìm bản PUBLISHED mới nhất để sao chép sâu
                cur.execute(
                    """SELECT id FROM workflow_template_versions
                       WHERE template_id = %s AND status = 'PUBLISHED'
                       ORDER BY version_no DESC LIMIT 1""",
                    (template_id,)
                )
                published_row = cur.fetchone()

                # 5. Tạo version DRAFT mới
                cur.execute(
                    """INSERT INTO workflow_template_versions (template_id, version_no, status)
                       VALUES (%s, %s, 'DRAFT')
                       RETURNING id, template_id, version_no, status""",
                    (template_id, next_version_no)
                )
                new_ver = cur.fetchone()
                new_version_id = str(new_ver["id"])

                # 6. Sao chép sâu nếu có bản PUBLISHED
                if published_row:
                    source_ver_id = str(published_row["id"])

                    # Lấy stages của source
                    cur.execute(
                        """SELECT id, name, order_index, requires_approval
                           FROM template_stages
                           WHERE template_version_id = %s
                           ORDER BY order_index ASC""",
                        (source_ver_id,)
                    )
                    source_stages = cur.fetchall()

                    stage_id_map: Dict[str, str] = {}
                    task_id_map: Dict[str, str] = {}

                    for stg in source_stages:
                        old_s_id = str(stg["id"])
                        cur.execute(
                            """INSERT INTO template_stages (template_version_id, name, order_index, requires_approval)
                               VALUES (%s, %s, %s, %s)
                               RETURNING id""",
                            (new_version_id, stg["name"], stg["order_index"], stg["requires_approval"])
                        )
                        new_s_id = str(cur.fetchone()["id"])
                        stage_id_map[old_s_id] = new_s_id

                        # Lấy tasks thuộc stage này
                        cur.execute(
                            """SELECT id, title, description, default_case_role, sla_business_days,
                                      complexity_weight, requires_approval, triggers_milestone_order
                               FROM template_tasks t
                               WHERE t.template_stage_id = %s
                               ORDER BY t.order_index ASC""",
                            (old_s_id,)
                        )
                        source_tasks = cur.fetchall()
                        for t_idx, t in enumerate(source_tasks, start=1):
                            old_t_id = str(t["id"])
                            cur.execute(
                                """INSERT INTO template_tasks (
                                       template_stage_id, title, description, default_case_role,
                                       sla_business_days, complexity_weight, requires_approval,
                                       triggers_milestone_order, order_index
                                   ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                                   RETURNING id""",
                                (
                                    new_s_id, t["title"], t["description"], t["default_case_role"],
                                    t["sla_business_days"], t["complexity_weight"], t["requires_approval"],
                                    t["triggers_milestone_order"], t_idx
                                )
                            )
                            new_t_id = str(cur.fetchone()["id"])
                            task_id_map[old_t_id] = new_t_id

                    # Sao chép dependencies
                    if task_id_map:
                        old_task_ids = list(task_id_map.keys())
                        cur.execute(
                            """SELECT template_task_id, depends_on_template_task_id
                               FROM template_task_dependencies
                               WHERE template_task_id = ANY(%s)""",
                            (old_task_ids,)
                        )
                        deps = cur.fetchall()
                        for d in deps:
                            old_tid = str(d["template_task_id"])
                            old_dep_id = str(d["depends_on_template_task_id"])
                            if old_tid in task_id_map and old_dep_id in task_id_map:
                                cur.execute(
                                    """INSERT INTO template_task_dependencies (template_task_id, depends_on_template_task_id)
                                       VALUES (%s, %s)""",
                                    (task_id_map[old_tid], task_id_map[old_dep_id])
                                )

                conn.commit()
                return {
                    "id": new_version_id,
                    "template_id": str(new_ver["template_id"]),
                    "version_no": new_ver["version_no"],
                    "status": new_ver["status"]
                }
        except Exception:
            conn.rollback()
            raise

# ---------- 3. Version Tree (GET & PUT) ----------

def get_version_tree(version_id: str) -> Dict[str, Any]:
    with get_db_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            # Lấy thông tin version và template
            cur.execute(
                """SELECT v.id, v.template_id, v.version_no, v.status, t.mode
                   FROM workflow_template_versions v
                   JOIN workflow_templates t ON v.template_id = t.id
                   WHERE v.id = %s""",
                (version_id,)
            )
            v = cur.fetchone()
            if not v:
                raise AppException(404, "NOT_FOUND", "Không tìm thấy phiên bản quy trình")

            # Lấy stages
            cur.execute(
                """SELECT id, name, order_index, requires_approval
                   FROM template_stages
                   WHERE template_version_id = %s
                   ORDER BY order_index ASC""",
                (version_id,)
            )
            stages = cur.fetchall()

            # Lấy tất cả tasks theo đúng thứ tự
            cur.execute(
                """SELECT t.id, t.template_stage_id, t.title, t.description, t.default_case_role,
                          t.sla_business_days, t.complexity_weight, t.requires_approval,
                          t.triggers_milestone_order, t.order_index
                   FROM template_tasks t
                   JOIN template_stages s ON t.template_stage_id = s.id
                   WHERE s.template_version_id = %s
                   ORDER BY s.order_index ASC, t.order_index ASC""",
                (version_id,)
            )
            all_tasks = cur.fetchall()

            # Gán key ổn định:
            # Stage: s{order_index}
            # Task: t{1..N} theo thứ tự duyệt
            task_id_to_key: Dict[str, str] = {}
            for idx, t in enumerate(all_tasks, start=1):
                task_id_to_key[str(t["id"])] = f"t{idx}"

            # Lấy dependencies
            cur.execute(
                """SELECT d.template_task_id, d.depends_on_template_task_id
                   FROM template_task_dependencies d
                   JOIN template_tasks t ON d.template_task_id = t.id
                   JOIN template_stages s ON t.template_stage_id = s.id
                   WHERE s.template_version_id = %s""",
                (version_id,)
            )
            dep_rows = cur.fetchall()
            task_deps_map: Dict[str, List[str]] = {str(t["id"]): [] for t in all_tasks}
            for d in dep_rows:
                tid = str(d["template_task_id"])
                dep_id = str(d["depends_on_template_task_id"])
                if tid in task_deps_map and dep_id in task_id_to_key:
                    task_deps_map[tid].append(task_id_to_key[dep_id])

            # Gom task vào stage
            stage_tasks_map: Dict[str, List[Dict[str, Any]]] = {str(s["id"]): [] for s in stages}
            for t in all_tasks:
                s_id = str(t["template_stage_id"])
                tid = str(t["id"])
                stage_tasks_map[s_id].append({
                    "key": task_id_to_key[tid],
                    "title": t["title"],
                    "description": t["description"],
                    "default_case_role": t["default_case_role"],
                    "sla_business_days": t["sla_business_days"],
                    "complexity_weight": t["complexity_weight"],
                    "requires_approval": t["requires_approval"],
                    "triggers_milestone_order": t["triggers_milestone_order"],
                    "depends_on": task_deps_map.get(tid, [])
                })

            result_stages = []
            for s in stages:
                s_id = str(s["id"])
                result_stages.append({
                    "key": f"s{s['order_index']}",
                    "name": s["name"],
                    "order_index": s["order_index"],
                    "requires_approval": s["requires_approval"],
                    "tasks": stage_tasks_map.get(s_id, [])
                })

            return {
                "id": str(v["id"]),
                "template_id": str(v["template_id"]),
                "version_no": v["version_no"],
                "status": v["status"],
                "mode": v["mode"],
                "stages": result_stages
            }

def save_version_tree(version_id: str, tree: WorkflowVersionTreePayload) -> Dict[str, Any]:
    """Thay TOÀN BỘ cây của bản DRAFT trong 1 transaction; kiểm tra mọi luật §3.3a."""
    # 1. Kiểm tra ràng buộc hợp đồng
    tree.validate_tree_constraints()

    with get_db_conn() as conn:
        try:
            with conn.cursor(row_factory=dict_row) as cur:
                # 2. Kiểm tra version và trạng thái DRAFT
                cur.execute(
                    # FOR UPDATE: xếp hàng với publish_version (cũng khoá dòng này) để không ghi đè cây của bản vừa phát hành
                    "SELECT status FROM workflow_template_versions WHERE id = %s FOR UPDATE",
                    (version_id,)
                )
                v = cur.fetchone()
                if not v:
                    raise AppException(404, "NOT_FOUND", "Không tìm thấy phiên bản quy trình")
                if v["status"] != "DRAFT":
                    raise AppException(409, "VERSION_NOT_DRAFT", "Chỉ được chỉnh sửa phiên bản ở trạng thái DRAFT")

                # 3. Xoá stages cũ (CASCADE sẽ xoá tasks và dependencies)
                cur.execute("DELETE FROM template_stages WHERE template_version_id = %s", (version_id,))

                # 4. Chèn stages mới
                task_key_to_uuid: Dict[str, str] = {}
                task_dependencies_to_insert: List[Tuple[str, str]] = []

                for stage in tree.stages:
                    cur.execute(
                        """INSERT INTO template_stages (template_version_id, name, order_index, requires_approval)
                           VALUES (%s, %s, %s, %s)
                           RETURNING id""",
                        (version_id, stage.name, stage.order_index, stage.requires_approval)
                    )
                    stage_id = str(cur.fetchone()["id"])

                    for t_idx, task in enumerate(stage.tasks, start=1):
                        cur.execute(
                            """INSERT INTO template_tasks (
                                   template_stage_id, title, description, default_case_role,
                                   sla_business_days, complexity_weight, requires_approval,
                                   triggers_milestone_order, order_index
                               ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                               RETURNING id""",
                            (
                                stage_id, task.title, task.description, task.default_case_role,
                                task.sla_business_days, task.complexity_weight, task.requires_approval,
                                task.triggers_milestone_order, t_idx
                            )
                        )
                        task_id = str(cur.fetchone()["id"])
                        task_key_to_uuid[task.key] = task_id

                        for dep_key in task.depends_on:
                            task_dependencies_to_insert.append((task.key, dep_key))

                # 5. Chèn dependencies
                for t_key, dep_key in task_dependencies_to_insert:
                    tid = task_key_to_uuid[t_key]
                    dep_id = task_key_to_uuid[dep_key]
                    cur.execute(
                        """INSERT INTO template_task_dependencies (template_task_id, depends_on_template_task_id)
                           VALUES (%s, %s)""",
                        (tid, dep_id)
                    )

                conn.commit()

            # Trả về cây vừa lưu theo định dạng của GET
            return get_version_tree(version_id)
        except Exception:
            conn.rollback()
            raise

# ---------- 4. Publish Version ----------

def publish_version(
    version_id: str,
    user_id: str,
    ip_address: str = "127.0.0.1",
    user_agent: str = "ASL-Internal/2.0"
) -> Dict[str, Any]:
    with get_db_conn() as conn:
        try:
            with conn.cursor(row_factory=dict_row) as cur:
                # 1. Khoá dòng phiên bản
                cur.execute(
                    """SELECT id, template_id, version_no, status
                       FROM workflow_template_versions
                       WHERE id = %s
                       FOR UPDATE""",
                    (version_id,)
                )
                v = cur.fetchone()
                if not v:
                    raise AppException(404, "NOT_FOUND", "Không tìm thấy phiên bản quy trình")
                if v["status"] != "DRAFT":
                    raise AppException(409, "VERSION_NOT_DRAFT", "Phiên bản không ở trạng thái DRAFT")

                template_id = str(v["template_id"])
                version_no = v["version_no"]

                # 2. Kiểm tra stage và task
                cur.execute(
                    """SELECT id, order_index
                       FROM template_stages
                       WHERE template_version_id = %s
                       ORDER BY order_index ASC""",
                    (version_id,)
                )
                stages = cur.fetchall()
                if not stages:
                    raise AppException(422, "VALIDATION_ERROR", "Phiên bản phải có ít nhất 1 giai đoạn", details={"stages": "Trống"})

                total_stages = len(stages)
                total_tasks = 0

                cur.execute(
                    """SELECT t.id, t.template_stage_id, s.order_index
                       FROM template_tasks t
                       JOIN template_stages s ON t.template_stage_id = s.id
                       WHERE s.template_version_id = %s
                       ORDER BY s.order_index ASC, t.order_index ASC""",
                    (version_id,)
                )
                tasks = cur.fetchall()
                total_tasks = len(tasks)

                # Kiểm tra stage rỗng
                stage_tasks_count = {str(s["id"]): 0 for s in stages}
                for t in tasks:
                    stage_tasks_count[str(t["template_stage_id"])] += 1

                for s in stages:
                    if stage_tasks_count[str(s["id"])] == 0:
                        raise AppException(422, "VALIDATION_ERROR", f"Giai đoạn {s['order_index']} không có nhiệm vụ nào")

                # 3. Xây dựng đồ thị phụ thuộc để kiểm tra:
                # Ánh xạ task_id -> key ổn định t1, t2, ...
                task_id_to_key = {str(t["id"]): f"t{idx}" for idx, t in enumerate(tasks, start=1)}
                task_to_stage_order = {str(t["id"]): t["order_index"] for t in tasks}

                cur.execute(
                    """SELECT d.template_task_id, d.depends_on_template_task_id
                       FROM template_task_dependencies d
                       JOIN template_tasks t ON d.template_task_id = t.id
                       JOIN template_stages s ON t.template_stage_id = s.id
                       WHERE s.template_version_id = %s""",
                    (version_id,)
                )
                deps = cur.fetchall()

                # Kiểm tra phụ thuộc stage sau (INVALID_DEPENDENCY)
                for d in deps:
                    tid = str(d["template_task_id"])
                    dep_id = str(d["depends_on_template_task_id"])
                    if task_to_stage_order[dep_id] > task_to_stage_order[tid]:
                        raise AppException(422, "INVALID_DEPENDENCY", "Nhiệm vụ không được phụ thuộc vào nhiệm vụ ở giai đoạn sau")

                # Kiểm tra chu trình (DEPENDENCY_CYCLE)
                graph: Dict[str, List[str]] = {task_id_to_key[str(t["id"])]: [] for t in tasks}
                for d in deps:
                    t_key = task_id_to_key[str(d["template_task_id"])]
                    dep_key = task_id_to_key[str(d["depends_on_template_task_id"])]
                    graph[t_key].append(dep_key)

                cycle = find_cycle(graph)
                if cycle:
                    raise AppException(422, "DEPENDENCY_CYCLE", "Đồ thị phụ thuộc chứa chu trình", details={"cycle": cycle})

                # 4. Chuyển bản PUBLISHED cũ sang RETIRED
                cur.execute(
                    """UPDATE workflow_template_versions
                       SET status = 'RETIRED'
                       WHERE template_id = %s AND status = 'PUBLISHED'""",
                    (template_id,)
                )

                # 5. Đặt bản hiện tại là PUBLISHED
                cur.execute(
                    """UPDATE workflow_template_versions
                       SET status = 'PUBLISHED', published_by = %s, published_at = NOW()
                       WHERE id = %s
                       RETURNING id, template_id, version_no, status, published_by, published_at""",
                    (user_id, version_id)
                )
                updated_v = cur.fetchone()

                # 6. Ghi nhật ký kiểm toán WORKFLOW_PUBLISHED
                after_state = {
                    "version_no": version_no,
                    "stages_count": total_stages,
                    "tasks_count": total_tasks,
                    "total_stages": total_stages,
                    "total_tasks": total_tasks
                }
                log_audit_event(
                    conn,
                    actor_type="USER",
                    action="WORKFLOW_PUBLISHED",
                    entity_name="workflow_template_versions",
                    entity_id=version_id,
                    actor_id=user_id,
                    after_state=after_state,
                    ip_address=ip_address,
                    user_agent=user_agent
                )

                conn.commit()
                return {
                    "id": str(updated_v["id"]),
                    "template_id": str(updated_v["template_id"]),
                    "version_no": updated_v["version_no"],
                    "status": updated_v["status"],
                    "published_by": str(updated_v["published_by"]),
                    "published_at": updated_v["published_at"].isoformat()
                }
        except Exception:
            conn.rollback()
            raise

# ---------- 5. Custom Fields ----------

def update_matter_type_custom_fields(
    matter_type_id: str,
    payload: CustomFieldsUpdateRequest,
    user_id: str,
    ip_address: str = "127.0.0.1",
    user_agent: str = "ASL-Internal/2.0"
) -> Dict[str, Any]:
    fields_data = [f.model_dump() for f in payload.fields]
    with get_db_conn() as conn:
        try:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    "SELECT id, custom_fields_schema FROM matter_types WHERE id = %s",
                    (matter_type_id,)
                )
                mt = cur.fetchone()
                if not mt:
                    raise AppException(404, "NOT_FOUND", "Không tìm thấy loại vụ việc")

                old_schema = mt["custom_fields_schema"]

                cur.execute(
                    """UPDATE matter_types
                       SET custom_fields_schema = %s, updated_at = NOW()
                       WHERE id = %s""",
                    (json.dumps(fields_data), matter_type_id)
                )

                # Ghi audit
                log_audit_event(
                    conn,
                    actor_type="USER",
                    action="CUSTOM_FIELDS_UPDATED",
                    entity_name="matter_types",
                    entity_id=matter_type_id,
                    actor_id=user_id,
                    before_state={"custom_fields_schema": old_schema},
                    after_state={"custom_fields_schema": fields_data},
                    ip_address=ip_address,
                    user_agent=user_agent
                )

                conn.commit()
                return {
                    "matter_type_id": matter_type_id,
                    "custom_fields_schema": fields_data
                }
        except Exception:
            conn.rollback()
            raise

# ---------- 6. Holidays ----------

def get_holidays(year: int) -> Dict[str, Any]:
    with get_db_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """SELECT date, name FROM holidays
                   WHERE EXTRACT(YEAR FROM date) = %s
                   ORDER BY date ASC""",
                (year,)
            )
            rows = cur.fetchall()
            return {
                "year": year,
                "days": [{"date": r["date"].isoformat(), "name": r["name"]} for r in rows]
            }

def update_holidays(payload: HolidaysUpdateRequest) -> Dict[str, Any]:
    with get_db_conn() as conn:
        try:
            with conn.cursor(row_factory=dict_row) as cur:
                # Xoá ngày nghỉ của năm
                cur.execute("DELETE FROM holidays WHERE EXTRACT(YEAR FROM date) = %s", (payload.year,))

                # Chèn các ngày nghỉ mới
                for day in payload.days:
                    cur.execute(
                        "INSERT INTO holidays (date, name) VALUES (%s, %s)",
                        (day.date, day.name)
                    )

                conn.commit()
                return {
                    "year": payload.year,
                    "days": [d.model_dump() for d in payload.days]
                }
        except Exception:
            conn.rollback()
            raise
