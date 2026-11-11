import json
import uuid
from typing import Dict, Any, List
from fastapi import APIRouter, Request, Depends, status
from sqlalchemy import text
import psycopg

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.core.security import get_current_user, verify_csrf
from backend.app.db.postgres import engine
from backend.app.db.neo4j import get_neo4j_driver
from backend.app.schemas.users import DepartmentCreateRequest, DepartmentLeadersRequest
from backend.app.services.audit import log_audit_event

router = APIRouter(prefix="/departments", tags=["Departments"])

def _get_client_info(request: Request) -> tuple[str, str]:
    ip = request.client.host if request.client else "127.0.0.1"
    ua = request.headers.get("user-agent", "ASL-Client/2.0")
    return ip, ua

def _require_admin(current_user: Dict[str, Any]) -> None:
    if current_user.get("system_role") != "ADMIN":
        raise AppException(403, "FORBIDDEN_ROLE", "Chỉ Quản trị viên mới có quyền thực hiện thao tác này")

def _require_admin_or_manager(current_user: Dict[str, Any]) -> None:
    if current_user.get("system_role") not in ("ADMIN", "MANAGER"):
        raise AppException(403, "FORBIDDEN_ROLE", "Chỉ Quản trị viên và Quản lý mới có quyền xem thông tin này")

@router.get("", status_code=status.HTTP_200_OK)
async def list_departments_endpoint(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    _require_admin_or_manager(current_user)
    async with engine.connect() as conn:
        res = await conn.execute(
            text("SELECT id, code, name FROM departments ORDER BY code ASC")
        )
        rows = res.fetchall()

    items = [{"id": str(r.id), "code": r.code, "name": r.name} for r in rows]
    return {
        "success": True,
        "data": items
    }

@router.post("", status_code=status.HTTP_201_CREATED, dependencies=[Depends(verify_csrf)])
async def create_department_endpoint(
    payload: DepartmentCreateRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    _require_admin(current_user)
    ip, ua = _get_client_info(request)

    dept_id = uuid.uuid4()
    code = payload.code.strip()
    name = payload.name.strip()

    # Check duplicate code
    async with engine.connect() as conn:
        res = await conn.execute(
            text("SELECT id FROM departments WHERE code = :code"),
            {"code": code}
        )
        if res.fetchone():
            raise AppException(409, "DUPLICATE_CODE", f"Mã phòng ban '{code}' đã tồn tại")

    outbox_payload = {
        "id": str(dept_id),
        "code": code,
        "name": name
    }

    async with engine.begin() as conn:
        await conn.execute(
            text("""
                INSERT INTO departments (id, code, name)
                VALUES (:id, :code, :name)
            """),
            {"id": dept_id, "code": code, "name": name}
        )
        await conn.execute(
            text("""
                INSERT INTO outbox_events (event_type, payload)
                VALUES ('DEPARTMENT_UPSERTED', :payload)
            """),
            {"payload": json.dumps(outbox_payload)}
        )

    # Audit log
    with psycopg.connect(settings.DATABASE_SYNC_URL) as sync_conn:
        log_audit_event(
            conn=sync_conn,
            actor_type="USER",
            action="DEPARTMENT_CREATED",
            entity_name="departments",
            entity_id=str(dept_id),
            actor_id=current_user.get("id"),
            before_state=None,
            after_state=outbox_payload,
            ip_address=ip,
            user_agent=ua
        )
        sync_conn.commit()

    return {
        "success": True,
        "data": {
            "id": str(dept_id),
            "code": code,
            "name": name
        },
        "message": "Tạo phòng ban thành công"
    }

@router.put("/{id}/leaders", status_code=status.HTTP_200_OK, dependencies=[Depends(verify_csrf)])
async def put_department_leaders_endpoint(
    id: str,
    payload: DepartmentLeadersRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    _require_admin(current_user)
    ip, ua = _get_client_info(request)

    try:
        dept_id = uuid.UUID(id)
    except ValueError:
        raise AppException(422, "VALIDATION_ERROR", "Định danh phòng ban không hợp lệ")

    outbox_payload: Dict[str, Any] = {}
    validated_leader_ids: List[uuid.UUID] = []

    # 1, 2, 3. Validate and update PostgreSQL in a single connection & transaction
    async with engine.begin() as conn:
        res_dept = await conn.execute(
            text("SELECT id, code, name FROM departments WHERE id = :id"),
            {"id": dept_id}
        )
        dept_row = res_dept.fetchone()
        if not dept_row:
            raise AppException(404, "NOT_FOUND", "Phòng ban không tồn tại")

        for uid_str in payload.leader_user_ids:
            try:
                uid = uuid.UUID(uid_str)
            except ValueError:
                raise AppException(422, "VALIDATION_ERROR", f"Định danh người dùng '{uid_str}' không hợp lệ")

            res_u = await conn.execute(
                text("SELECT id, system_role, is_active FROM users WHERE id = :id"),
                {"id": uid}
            )
            u_row = res_u.fetchone()
            if not u_row:
                raise AppException(422, "VALIDATION_ERROR", f"Không tìm thấy người dùng '{uid_str}'")
            if u_row.system_role != "MANAGER":
                raise AppException(422, "VALIDATION_ERROR", f"Người dùng '{uid_str}' không có vai trò MANAGER")
            if not u_row.is_active:
                raise AppException(422, "VALIDATION_ERROR", f"Người dùng '{uid_str}' đang bị vô hiệu hóa")
            validated_leader_ids.append(uid)

        outbox_payload = {
            "department_id": str(dept_id),
            "leader_user_ids": [str(x) for x in validated_leader_ids]
        }

        await conn.execute(
            text("DELETE FROM department_leaders WHERE department_id = :did"),
            {"did": dept_id}
        )
        for uid in validated_leader_ids:
            await conn.execute(
                text("""
                    INSERT INTO department_leaders (department_id, user_id)
                    VALUES (:did, :uid)
                    ON CONFLICT DO NOTHING
                """),
                {"did": dept_id, "uid": uid}
            )

        await conn.execute(
            text("""
                INSERT INTO outbox_events (event_type, payload)
                VALUES ('DEPARTMENT_LEADERS_SET', :payload)
            """),
            {"payload": json.dumps(outbox_payload)}
        )

    # 4. Neo4j Aura sync IMMEDIATELY in request: remove old :LEADS and set new :LEADS
    driver = get_neo4j_driver()
    async with driver.session() as session:
        if validated_leader_ids:
            res = await session.run("""
                MERGE (d:Department {id: $did})
                WITH d
                OPTIONAL MATCH ()-[r:LEADS]->(d)
                DELETE r
                WITH d
                UNWIND $leader_ids AS lid
                MERGE (u:User {id: lid})
                MERGE (u)-[:LEADS]->(d)
            """, did=str(dept_id), leader_ids=[str(x) for x in validated_leader_ids])
            await res.consume()
        else:
            res = await session.run("""
                MERGE (d:Department {id: $did})
                WITH d
                OPTIONAL MATCH ()-[r:LEADS]->(d)
                DELETE r
            """, did=str(dept_id))
            await res.consume()

    # 5. Audit log
    with psycopg.connect(settings.DATABASE_SYNC_URL) as sync_conn:
        log_audit_event(
            conn=sync_conn,
            actor_type="USER",
            action="DEPARTMENT_LEADERS_UPDATED",
            entity_name="departments",
            entity_id=str(dept_id),
            actor_id=current_user.get("id"),
            before_state=None,
            after_state=outbox_payload,
            ip_address=ip,
            user_agent=ua
        )
        sync_conn.commit()

    return {
        "success": True,
        "data": {
            "department_id": str(dept_id),
            "leader_user_ids": [str(x) for x in validated_leader_ids]
        },
        "message": "Cập nhật danh sách trưởng phòng thành công"
    }
