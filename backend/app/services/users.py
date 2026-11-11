import json
import secrets
import uuid
from typing import Optional, Dict, Any, List, Tuple
from sqlalchemy import text
import psycopg

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.db.postgres import engine
from backend.app.db.neo4j import get_neo4j_driver
from backend.app.schemas.users import UserCreateRequest, UserUpdateRequest
from backend.app.services.passwords import hash_password, SPECIAL_CHARS
from backend.app.services.sessions import revoke_user_sessions
from backend.app.services.audit import log_audit_event

def generate_temporary_password(length: int = 16) -> str:
    """Generates a secure 16-character temporary password meeting policy."""
    length = max(length, 16)
    uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    lowercase = "abcdefghijkmnopqrstuvwxyz"
    digits = "23456789"
    specials = "!@#$%^&*()_+-="
    all_chars = uppercase + lowercase + digits + specials

    pwd_chars = [
        secrets.choice(uppercase),
        secrets.choice(uppercase),
        secrets.choice(lowercase),
        secrets.choice(lowercase),
        secrets.choice(digits),
        secrets.choice(digits),
        secrets.choice(specials),
        secrets.choice(specials),
    ]
    while len(pwd_chars) < length:
        pwd_chars.append(secrets.choice(all_chars))
    secrets.SystemRandom().shuffle(pwd_chars)
    return "".join(pwd_chars)

async def create_user(
    payload: UserCreateRequest,
    current_user: Dict[str, Any],
    ip: str = "127.0.0.1",
    user_agent: str = "ASL-Client/2.0"
) -> Dict[str, Any]:
    # 1. Validation checks
    if not payload.email.lower().endswith("@asllaw.vn"):
        raise AppException(422, "VALIDATION_ERROR", "Email phải thuộc tên miền @asllaw.vn")

    if payload.is_executive and payload.system_role != "MANAGER":
        raise AppException(422, "VALIDATION_ERROR", "Chỉ vai trò MANAGER mới có thể là Giám đốc điều hành (is_executive)")

    dept_id = None
    if payload.department_id:
        try:
            dept_id = uuid.UUID(str(payload.department_id))
        except ValueError:
            raise AppException(422, "VALIDATION_ERROR", "department_id không hợp lệ")

    # 2. Generate credentials
    temp_password = generate_temporary_password(16)
    pwd_hash = hash_password(temp_password)
    user_id = uuid.uuid4()

    outbox_payload = {
        "id": str(user_id),
        "email": payload.email,
        "full_name": payload.full_name,
        "system_role": payload.system_role,
        "is_executive": payload.is_executive,
        "department_id": str(dept_id) if dept_id else None,
        "is_active": True
    }

    # 3. Validate and insert in a single transaction
    async with engine.begin() as conn:
        res_email = await conn.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": payload.email}
        )
        if res_email.fetchone():
            raise AppException(409, "DUPLICATE_EMAIL", "Email này đã tồn tại trong hệ thống")

        if dept_id:
            res_dept = await conn.execute(
                text("SELECT id FROM departments WHERE id = :dept_id"),
                {"dept_id": dept_id}
            )
            if not res_dept.fetchone():
                raise AppException(404, "NOT_FOUND", "Phòng ban không tồn tại")

        await conn.execute(
            text("""
                INSERT INTO users (
                    id, email, password_hash, full_name, title, phone_number,
                    system_role, is_executive, department_id, is_active,
                    must_reset_password, totp_enabled
                ) VALUES (
                    :id, :email, :password_hash, :full_name, :title, :phone_number,
                    :system_role, :is_executive, :department_id, true,
                    true, false
                )
            """),
            {
                "id": user_id,
                "email": payload.email,
                "password_hash": pwd_hash,
                "full_name": payload.full_name,
                "title": payload.title or "",
                "phone_number": payload.phone_number or "",
                "system_role": payload.system_role,
                "is_executive": payload.is_executive,
                "department_id": dept_id
            }
        )

        await conn.execute(
            text("""
                INSERT INTO outbox_events (event_type, payload)
                VALUES ('USER_UPSERTED', :payload)
            """),
            {"payload": json.dumps(outbox_payload)}
        )

    # 5. Audit log (never leak temporary_password or password_hash)
    audit_after = {
        "id": str(user_id),
        "email": payload.email,
        "full_name": payload.full_name,
        "title": payload.title or "",
        "phone_number": payload.phone_number or "",
        "system_role": payload.system_role,
        "is_executive": payload.is_executive,
        "department_id": str(dept_id) if dept_id else None,
        "is_active": True
    }

    with psycopg.connect(settings.DATABASE_SYNC_URL) as sync_conn:
        log_audit_event(
            conn=sync_conn,
            actor_type="USER",
            action="USER_CREATED",
            entity_name="users",
            entity_id=str(user_id),
            actor_id=current_user.get("id"),
            before_state=None,
            after_state=audit_after,
            ip_address=ip,
            user_agent=user_agent
        )
        sync_conn.commit()

    return {
        "id": str(user_id),
        "email": payload.email,
        "full_name": payload.full_name,
        "title": payload.title or "",
        "phone_number": payload.phone_number or "",
        "system_role": payload.system_role,
        "is_executive": payload.is_executive,
        "department_id": str(dept_id) if dept_id else None,
        "is_active": True,
        "must_reset_password": True,
        "temporary_password": temp_password
    }

async def update_user(
    user_id_str: str,
    payload: UserUpdateRequest,
    current_user: Dict[str, Any],
    ip: str = "127.0.0.1",
    user_agent: str = "ASL-Client/2.0"
) -> Dict[str, Any]:
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise AppException(422, "VALIDATION_ERROR", "Định danh người dùng không hợp lệ")

    # 1. Fetch user, validate and update in a single transaction
    async with engine.begin() as conn:
        res = await conn.execute(
            text("""
                SELECT id, email, full_name, title, phone_number,
                       system_role, is_executive, department_id, is_active, totp_enabled
                FROM users WHERE id = :id
            """),
            {"id": user_id}
        )
        row = res.fetchone()
        if not row:
            raise AppException(404, "NOT_FOUND", "Người dùng không tồn tại")

        target = {
            "id": str(row.id),
            "email": row.email,
            "full_name": row.full_name,
            "title": row.title or "",
            "phone_number": row.phone_number or "",
            "system_role": row.system_role,
            "is_executive": bool(row.is_executive),
            "department_id": str(row.department_id) if row.department_id else None,
            "is_active": bool(row.is_active),
            "totp_enabled": bool(row.totp_enabled)
        }

        # 2. Check ADMIN self-demotion
        if str(user_id) == str(current_user.get("id")):
            if payload.system_role is not None and payload.system_role != "ADMIN":
                raise AppException(403, "FORBIDDEN_ROLE", "Quản trị viên không thể tự hạ vai trò của chính mình")

        # 3. Check is_executive constraints
        effective_role = payload.system_role if payload.system_role is not None else target["system_role"]
        effective_exec = payload.is_executive if payload.is_executive is not None else target["is_executive"]
        if effective_exec and effective_role != "MANAGER":
            raise AppException(422, "VALIDATION_ERROR", "Chỉ vai trò MANAGER mới có thể là Giám đốc điều hành (is_executive)")

        dept_id = None
        if payload.department_id is not None:
            if payload.department_id != "":
                try:
                    dept_id = uuid.UUID(str(payload.department_id))
                except ValueError:
                    raise AppException(422, "VALIDATION_ERROR", "department_id không hợp lệ")
                res_dept = await conn.execute(
                    text("SELECT id FROM departments WHERE id = :did"),
                    {"did": dept_id}
                )
                if not res_dept.fetchone():
                    raise AppException(404, "NOT_FOUND", "Phòng ban không tồn tại")

        # 4. Prepare updated fields
        new_full_name = payload.full_name if payload.full_name is not None else target["full_name"]
        new_title = payload.title if payload.title is not None else target["title"]
        new_phone = payload.phone_number if payload.phone_number is not None else target["phone_number"]
        new_role = effective_role
        new_exec = effective_exec
        new_dept_id = dept_id if payload.department_id is not None else row.department_id

        role_changed = (payload.system_role is not None and payload.system_role != target["system_role"])
        dept_changed = (payload.department_id is not None and str(payload.department_id or "") != str(target["department_id"] or ""))

        outbox_payload = {
            "id": str(user_id),
            "email": target["email"],
            "full_name": new_full_name,
            "system_role": new_role,
            "is_executive": new_exec,
            "department_id": str(new_dept_id) if new_dept_id else None,
            "is_active": target["is_active"]
        }

        # 5. Execute DB update and outbox in same transaction
        await conn.execute(
            text("""
                UPDATE users SET
                    full_name = :full_name,
                    title = :title,
                    phone_number = :phone_number,
                    system_role = :system_role,
                    is_executive = :is_executive,
                    department_id = :department_id
                WHERE id = :id
            """),
            {
                "id": user_id,
                "full_name": new_full_name,
                "title": new_title,
                "phone_number": new_phone,
                "system_role": new_role,
                "is_executive": new_exec,
                "department_id": new_dept_id
            }
        )

        await conn.execute(
            text("""
                INSERT INTO outbox_events (event_type, payload)
                VALUES ('USER_UPSERTED', :payload)
            """),
            {"payload": json.dumps(outbox_payload)}
        )

    # 6. Revoke sessions if role or department changed
    if role_changed or dept_changed:
        await revoke_user_sessions(user_id)

    # 7. Audit log
    audit_before = target
    audit_after = {
        **target,
        "full_name": new_full_name,
        "title": new_title,
        "phone_number": new_phone,
        "system_role": new_role,
        "is_executive": new_exec,
        "department_id": str(new_dept_id) if new_dept_id else None
    }

    with psycopg.connect(settings.DATABASE_SYNC_URL) as sync_conn:
        log_audit_event(
            conn=sync_conn,
            actor_type="USER",
            action="USER_UPDATED",
            entity_name="users",
            entity_id=str(user_id),
            actor_id=current_user.get("id"),
            before_state=audit_before,
            after_state=audit_after,
            ip_address=ip,
            user_agent=user_agent
        )
        sync_conn.commit()

    return audit_after

async def deactivate_user(
    user_id_str: str,
    reason: Optional[str],
    current_user: Dict[str, Any],
    ip: str = "127.0.0.1",
    user_agent: str = "ASL-Client/2.0"
) -> None:
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise AppException(422, "VALIDATION_ERROR", "Định danh người dùng không hợp lệ")

    # 1. Prevent self-deactivation
    if str(user_id) == str(current_user.get("id")):
        raise AppException(403, "FORBIDDEN_ROLE", "Quản trị viên không thể tự vô hiệu hóa tài khoản của chính mình")

    # 2. Check user exists
    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT id, email, is_active FROM users WHERE id = :id"), {"id": user_id})
        user = res.fetchone()
        if not user:
            raise AppException(404, "NOT_FOUND", "Người dùng không tồn tại")

    # 3. Update PostgreSQL & outbox event
    outbox_payload = {
        "id": str(user_id),
        "reason": reason or "",
        "is_active": False
    }

    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET is_active = FALSE, tokens_valid_after = clock_timestamp() WHERE id = :id"),
            {"id": user_id}
        )
        await conn.execute(
            text("""
                INSERT INTO outbox_events (event_type, payload)
                VALUES ('USER_DEACTIVATED', :payload)
            """),
            {"payload": json.dumps(outbox_payload)}
        )

    # 4. Revoke active sessions immediately
    await revoke_user_sessions(user_id)

    # 5. Sync Neo4j Aura immediately in request: u.is_active=false, remove :LEADS and :ASSIGNED_TO
    driver = get_neo4j_driver()
    async with driver.session() as session:
        res_neo = await session.run("""
            MERGE (u:User {id: $uid})
            SET u.is_active = false
            WITH u
            OPTIONAL MATCH (u)-[r_lead:LEADS]->()
            DELETE r_lead
            WITH u
            OPTIONAL MATCH (u)-[r_ass:ASSIGNED_TO]->()
            DELETE r_ass
        """, uid=str(user_id))
        await res_neo.consume()

    # 6. Audit log
    with psycopg.connect(settings.DATABASE_SYNC_URL) as sync_conn:
        log_audit_event(
            conn=sync_conn,
            actor_type="USER",
            action="USER_DEACTIVATED",
            entity_name="users",
            entity_id=str(user_id),
            actor_id=current_user.get("id"),
            before_state={"is_active": True},
            after_state={"is_active": False, "reason": reason or ""},
            ip_address=ip,
            user_agent=user_agent
        )
        sync_conn.commit()

async def activate_user(
    user_id_str: str,
    current_user: Dict[str, Any],
    ip: str = "127.0.0.1",
    user_agent: str = "ASL-Client/2.0"
) -> None:
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise AppException(422, "VALIDATION_ERROR", "Định danh người dùng không hợp lệ")

    async with engine.connect() as conn:
        res = await conn.execute(text("SELECT id, email, is_active FROM users WHERE id = :id"), {"id": user_id})
        user = res.fetchone()
        if not user:
            raise AppException(404, "NOT_FOUND", "Người dùng không tồn tại")

    outbox_payload = {
        "id": str(user_id),
        "is_active": True
    }

    async with engine.begin() as conn:
        await conn.execute(
            text("UPDATE users SET is_active = TRUE WHERE id = :id"),
            {"id": user_id}
        )
        await conn.execute(
            text("""
                INSERT INTO outbox_events (event_type, payload)
                VALUES ('USER_UPSERTED', :payload)
            """),
            {"payload": json.dumps(outbox_payload)}
        )

    # Sync Neo4j
    driver = get_neo4j_driver()
    async with driver.session() as session:
        res_neo = await session.run("MERGE (u:User {id: $uid}) SET u.is_active = true", uid=str(user_id))
        await res_neo.consume()

    # Audit log
    with psycopg.connect(settings.DATABASE_SYNC_URL) as sync_conn:
        log_audit_event(
            conn=sync_conn,
            actor_type="USER",
            action="USER_ACTIVATED",
            entity_name="users",
            entity_id=str(user_id),
            actor_id=current_user.get("id"),
            before_state={"is_active": False},
            after_state={"is_active": True},
            ip_address=ip,
            user_agent=user_agent
        )
        sync_conn.commit()

async def list_users(
    q: Optional[str] = None,
    role: Optional[str] = None,
    department_id: Optional[str] = None,
    page: int = 1,
    limit: int = 20
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    page = max(1, page)
    limit = max(1, min(100, limit))
    offset = (page - 1) * limit

    clauses = ["1=1"]
    params: Dict[str, Any] = {"limit": limit, "offset": offset}

    if q:
        clauses.append("(email ILIKE :q OR full_name ILIKE :q)")
        params["q"] = f"%{q}%"

    if role:
        clauses.append("system_role = :role")
        params["role"] = role

    if department_id:
        try:
            d_uuid = uuid.UUID(department_id)
            clauses.append("department_id = :dept_id")
            params["dept_id"] = d_uuid
        except ValueError:
            return [], {"page": page, "limit": limit, "total_records": 0, "total_pages": 0}

    where_sql = " AND ".join(clauses)

    async with engine.connect() as conn:
        count_res = await conn.execute(
            text(f"SELECT count(*) FROM users WHERE {where_sql}"),
            params
        )
        total_records = count_res.fetchone()[0]

        res = await conn.execute(
            text(f"""
                SELECT id, email, full_name, title, phone_number,
                       system_role, is_executive, department_id, is_active,
                       totp_enabled, created_at
                FROM users
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset
            """),
            params
        )
        rows = res.fetchall()

    total_pages = (total_records + limit - 1) // limit if total_records > 0 else 0

    items = []
    for r in rows:
        items.append({
            "id": str(r.id),
            "email": r.email,
            "full_name": r.full_name,
            "title": r.title or "",
            "phone_number": r.phone_number or "",
            "system_role": r.system_role,
            "is_executive": bool(r.is_executive),
            "department_id": str(r.department_id) if r.department_id else None,
            "is_active": bool(r.is_active),
            "totp_enabled": bool(r.totp_enabled),
            "created_at": r.created_at.isoformat() if r.created_at else None
        })

    meta = {
        "page": page,
        "limit": limit,
        "total_records": total_records,
        "total_pages": total_pages
    }
    return items, meta

async def get_user_by_id(user_id_str: str) -> Dict[str, Any]:
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise AppException(422, "VALIDATION_ERROR", "Định danh người dùng không hợp lệ")

    async with engine.connect() as conn:
        res = await conn.execute(
            text("""
                SELECT id, email, full_name, title, phone_number,
                       system_role, is_executive, department_id, is_active,
                       totp_enabled, created_at
                FROM users WHERE id = :id
            """),
            {"id": user_id}
        )
        r = res.fetchone()
        if not r:
            raise AppException(404, "NOT_FOUND", "Người dùng không tồn tại")

    return {
        "id": str(r.id),
        "email": r.email,
        "full_name": r.full_name,
        "title": r.title or "",
        "phone_number": r.phone_number or "",
        "system_role": r.system_role,
        "is_executive": bool(r.is_executive),
        "department_id": str(r.department_id) if r.department_id else None,
        "is_active": bool(r.is_active),
        "totp_enabled": bool(r.totp_enabled),
        "created_at": r.created_at.isoformat() if r.created_at else None
    }
