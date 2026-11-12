import hashlib
import hmac
import math
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple

from fastapi import Request
from sqlalchemy import text
import psycopg

from backend.app.core.config import settings
from backend.app.core.crypto import encrypt_aes_gcm, decrypt_aes_gcm, get_master_key
from backend.app.core.errors import AppException
from backend.app.db.postgres import engine
from backend.app.guards.access_policy import can_access_scope
from backend.app.guards.conflict_check import check_conflict_of_interest
from backend.app.guards.need_to_know import query_need_to_know_facts
from backend.app.schemas.crm import ClientCreate, ClientUpdate, InteractionCreate
from backend.app.services.audit import log_audit_event
from backend.app.services.text_normalize import normalize_text, normalize_identity_no, mask_identity_no


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"


async def create_client(
    client_in: ClientCreate,
    current_user: Dict[str, Any],
    request: Request
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Tạo khách hàng mới, kiểm tra trùng MST/CCCD, kiểm tra xung đột lợi ích, ghi thông báo và audit log."""
    norm_name = normalize_text(client_in.name)
    tax_code = client_in.tax_code.strip() if client_in.tax_code else None
    
    clean_id = None
    id_enc = None
    id_hash = None
    masked_id = None
    
    if client_in.identity_no:
        clean_id = normalize_identity_no(client_in.identity_no)
        master_key = get_master_key()
        id_hash = hmac.new(master_key, clean_id.encode("utf-8"), hashlib.sha256).hexdigest()
        id_enc = encrypt_aes_gcm(clean_id)
        masked_id = mask_identity_no(clean_id)

    async with engine.connect() as conn:
        # 1. Chặn trùng MST
        if tax_code:
            res_tax = await conn.execute(
                text("SELECT id FROM clients WHERE tax_code = :tax_code"),
                {"tax_code": tax_code}
            )
            if res_tax.fetchone():
                raise AppException(409, "DUPLICATE_TAX_CODE", f"Mã số thuế '{tax_code}' đã tồn tại trong hệ thống")

        # 2. Chặn trùng CCCD/CMND qua HMAC-SHA256 hash
        if id_hash:
            res_id = await conn.execute(
                text("SELECT id FROM clients WHERE identity_no_hash = :id_hash"),
                {"id_hash": id_hash}
            )
            if res_id.fetchone():
                raise AppException(409, "DUPLICATE_IDENTITY_NO", "Số định danh cá nhân (CCCD/CMND) đã tồn tại trong hệ thống")

    # 3. Kiểm tra xung đột lợi ích qua đồ thị Neo4j
    conflicts = await check_conflict_of_interest(norm_name, id_hash)
    warnings: List[Dict[str, Any]] = []
    if conflicts:
        case_codes = [c["case_code"] for c in conflicts if c.get("case_code")]
        warnings.append({
            "code": "CONFLICT_OF_INTEREST",
            "case_codes": case_codes
        })

    # 4. Ghi bản ghi vào PostgreSQL
    client_id = uuid.uuid4()
    cat_group = client_in.category_group or "NEW"
    user_id = uuid.UUID(current_user["id"])

    async with engine.begin() as conn:
        await conn.execute(
            text("""
                INSERT INTO clients (
                    id, client_type, name, normalized_name, tax_code,
                    identity_no_enc, identity_no_hash, representative_name,
                    phone, email, address, category_group, created_by,
                    created_at, updated_at
                ) VALUES (
                    :id, :client_type, :name, :normalized_name, :tax_code,
                    :identity_no_enc, :identity_no_hash, :representative_name,
                    :phone, :email, :address, :category_group, :created_by,
                    NOW(), NOW()
                )
            """),
            {
                "id": client_id,
                "client_type": client_in.client_type,
                "name": client_in.name,
                "normalized_name": norm_name,
                "tax_code": tax_code,
                "identity_no_enc": id_enc,
                "identity_no_hash": id_hash,
                "representative_name": client_in.representative_name,
                "phone": client_in.phone,
                "email": client_in.email,
                "address": client_in.address,
                "category_group": cat_group,
                "created_by": user_id,
            }
        )

        # 5. Nếu có xung đột: ghi notifications cho Trưởng phòng các phòng ban của vụ việc xung đột
        if conflicts:
            notified_leaders = set()
            for conf in conflicts:
                case_code = conf.get("case_code")
                case_id = conf.get("case_id")
                # Lấy department_id của vụ việc
                dept_res = await conn.execute(
                    text("SELECT department_id FROM cases WHERE case_code = :code OR id = :case_id"),
                    {"code": case_code, "case_id": case_id if case_id else uuid.uuid4()}
                )
                dept_row = dept_res.fetchone()
                if dept_row and dept_row[0]:
                    dept_id = dept_row[0]
                    # Tìm tất cả Trưởng phòng của phòng ban đó
                    leader_res = await conn.execute(
                        text("SELECT user_id FROM department_leaders WHERE department_id = :dept_id"),
                        {"dept_id": dept_id}
                    )
                    for l_row in leader_res.fetchall():
                        l_id = l_row[0]
                        if (l_id, case_code) not in notified_leaders:
                            notified_leaders.add((l_id, case_code))
                            await conn.execute(
                                text("""
                                    INSERT INTO notifications (
                                        id, user_id, kind, title, body, link, created_at
                                    ) VALUES (
                                        :id, :user_id, 'CONFLICT_OF_INTEREST', :title, :body, :link, NOW()
                                    )
                                """),
                                {
                                    "id": uuid.uuid4(),
                                    "user_id": l_id,
                                    "title": f"Cảnh báo xung đột lợi ích: Vụ việc {case_code}",
                                    "body": f"Phát hiện khách hàng mới '{client_in.name}' có dấu hiệu trùng thông tin với bên đối tụng trong vụ việc {case_code}.",
                                    "link": f"/cases/{case_id or ''}"
                                }
                            )

    # 6. Ghi nhật ký kiểm toán (Audit Log) đồng bộ
    ip = _get_client_ip(request)
    ua = request.headers.get("user-agent", "ASL-Client/2.0")

    after_state = {
        "id": str(client_id),
        "client_type": client_in.client_type,
        "name": client_in.name,
        "tax_code": tax_code,
        "identity_no_masked": masked_id,
        "representative_name": client_in.representative_name,
        "phone": client_in.phone,
        "email": client_in.email,
        "address": client_in.address,
        "category_group": cat_group
    }

    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as sync_conn:
        # Nếu có xung đột: ghi audit CONFLICT_OF_INTEREST_WARNING
        if conflicts:
            log_audit_event(
                sync_conn,
                actor_type="USER",
                action="CONFLICT_OF_INTEREST_WARNING",
                entity_name="clients",
                entity_id=str(client_id),
                actor_id=str(current_user["id"]),
                after_state={
                    "case_codes": [c["case_code"] for c in conflicts if c.get("case_code")],
                    "conflicts": conflicts
                },
                ip_address=ip,
                user_agent=ua
            )

        # Audit CLIENT_CREATED (không chứa CCCD bản rõ)
        log_audit_event(
            sync_conn,
            actor_type="USER",
            action="CLIENT_CREATED",
            entity_name="clients",
            entity_id=str(client_id),
            actor_id=str(current_user["id"]),
            after_state=after_state,
            ip_address=ip,
            user_agent=ua
        )

    client_data = {
        "id": str(client_id),
        "client_type": client_in.client_type,
        "name": client_in.name,
        "tax_code": tax_code,
        "identity_no": masked_id,
        "identity_no_masked": masked_id,
        "representative_name": client_in.representative_name,
        "phone": client_in.phone,
        "email": client_in.email,
        "address": client_in.address,
        "category_group": cat_group,
        "warnings": warnings,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    return client_data, warnings


async def get_client(client_id_str: str, current_user: Dict[str, Any]) -> Dict[str, Any]:
    """Lấy thông tin chi tiết khách hàng và danh sách vụ việc được lọc theo Need-to-Know."""
    try:
        c_uuid = uuid.UUID(client_id_str)
    except ValueError:
        raise AppException(404, "NOT_FOUND", "Không tìm thấy khách hàng")

    async with engine.connect() as conn:
        res = await conn.execute(
            text("""
                SELECT id, client_type, name, normalized_name, tax_code,
                       identity_no_enc, representative_name, phone, email,
                       address, category_group, created_at, updated_at
                FROM clients
                WHERE id = :id
            """),
            {"id": c_uuid}
        )
        row = res.fetchone()
        if not row:
            raise AppException(404, "NOT_FOUND", "Không tìm thấy khách hàng")

        # Lấy danh sách vụ việc của khách hàng
        case_res = await conn.execute(
            text("""
                SELECT id, case_code, title, status
                FROM cases
                WHERE client_id = :id
                ORDER BY created_at DESC
            """),
            {"id": c_uuid}
        )
        case_rows = case_res.fetchall()

    # Che CCCD (giải mã AES-GCM và mask, không lưu bản rõ vào memory lâu dài)
    masked_id = None
    if row.identity_no_enc:
        try:
            plain_id = decrypt_aes_gcm(row.identity_no_enc)
            masked_id = mask_identity_no(plain_id)
        except Exception:
            masked_id = "********"

    # Lọc danh sách vụ việc theo Need-to-Know (scope='progress')
    allowed_cases: List[Dict[str, Any]] = []
    user_id_str = str(current_user["id"])
    for crow in case_rows:
        case_id_val = str(crow.id)
        facts = await query_need_to_know_facts(user_id=user_id_str, case_id=case_id_val)
        if can_access_scope(facts, "progress"):
            allowed_cases.append({
                "id": case_id_val,
                "case_code": crow.case_code,
                "title": crow.title,
                "status": crow.status
            })

    return {
        "id": str(row.id),
        "client_type": row.client_type,
        "name": row.name,
        "tax_code": row.tax_code,
        "identity_no": masked_id,
        "identity_no_masked": masked_id,
        "representative_name": row.representative_name,
        "phone": row.phone,
        "email": row.email,
        "address": row.address,
        "category_group": row.category_group,
        "cases": allowed_cases,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None
    }


async def update_client(
    client_id_str: str,
    client_in: ClientUpdate,
    current_user: Dict[str, Any],
    request: Request
) -> Dict[str, Any]:
    """Cập nhật thông tin khách hàng, kiểm tra trùng lặp và ghi audit log CLIENT_UPDATED."""
    try:
        c_uuid = uuid.UUID(client_id_str)
    except ValueError:
        raise AppException(404, "NOT_FOUND", "Không tìm thấy khách hàng")

    async with engine.connect() as conn:
        res = await conn.execute(
            text("""
                SELECT id, client_type, name, normalized_name, tax_code,
                       identity_no_enc, identity_no_hash, representative_name,
                       phone, email, address, category_group, created_at, updated_at
                FROM clients
                WHERE id = :id
            """),
            {"id": c_uuid}
        )
        existing = res.fetchone()
        if not existing:
            raise AppException(404, "NOT_FOUND", "Không tìm thấy khách hàng")

        # Kiểm tra trùng MST nếu có thay đổi
        if client_in.tax_code is not None:
            new_tax = client_in.tax_code.strip() or None
            if new_tax and new_tax != existing.tax_code:
                dup_tax = await conn.execute(
                    text("SELECT id FROM clients WHERE tax_code = :tax_code AND id != :id"),
                    {"tax_code": new_tax, "id": c_uuid}
                )
                if dup_tax.fetchone():
                    raise AppException(409, "DUPLICATE_TAX_CODE", f"Mã số thuế '{new_tax}' đã tồn tại ở khách hàng khác")

    # Xử lý CCCD nếu có cập nhật
    new_id_enc = existing.identity_no_enc
    new_id_hash = existing.identity_no_hash
    if client_in.identity_no is not None:
        clean_new_id = normalize_identity_no(client_in.identity_no)
        if clean_new_id:
            master_key = get_master_key()
            calc_hash = hmac.new(master_key, clean_new_id.encode("utf-8"), hashlib.sha256).hexdigest()
            if calc_hash != existing.identity_no_hash:
                async with engine.connect() as conn:
                    dup_id = await conn.execute(
                        text("SELECT id FROM clients WHERE identity_no_hash = :h AND id != :id"),
                        {"h": calc_hash, "id": c_uuid}
                    )
                    if dup_id.fetchone():
                        raise AppException(409, "DUPLICATE_IDENTITY_NO", "Số định danh cá nhân đã tồn tại ở khách hàng khác")
                new_id_hash = calc_hash
                new_id_enc = encrypt_aes_gcm(clean_new_id)

    # Chuẩn bị giá trị cập nhật
    new_name = client_in.name if client_in.name is not None else existing.name
    new_norm_name = normalize_text(new_name) if client_in.name is not None else existing.normalized_name
    new_tax_code = client_in.tax_code if client_in.tax_code is not None else existing.tax_code
    new_rep = client_in.representative_name if client_in.representative_name is not None else existing.representative_name
    new_phone = client_in.phone if client_in.phone is not None else existing.phone
    new_email = client_in.email if client_in.email is not None else existing.email
    new_address = client_in.address if client_in.address is not None else existing.address
    new_category = client_in.category_group if client_in.category_group is not None else existing.category_group

    async with engine.begin() as conn:
        await conn.execute(
            text("""
                UPDATE clients
                SET name = :name,
                    normalized_name = :normalized_name,
                    tax_code = :tax_code,
                    identity_no_enc = :identity_no_enc,
                    identity_no_hash = :identity_no_hash,
                    representative_name = :representative_name,
                    phone = :phone,
                    email = :email,
                    address = :address,
                    category_group = :category_group,
                    updated_at = NOW()
                WHERE id = :id
            """),
            {
                "id": c_uuid,
                "name": new_name,
                "normalized_name": new_norm_name,
                "tax_code": new_tax_code,
                "identity_no_enc": new_id_enc,
                "identity_no_hash": new_id_hash,
                "representative_name": new_rep,
                "phone": new_phone,
                "email": new_email,
                "address": new_address,
                "category_group": new_category,
            }
        )

    # Chuẩn bị before_state và after_state (đã che CCCD)
    before_masked = None
    if existing.identity_no_enc:
        try:
            b_clean = decrypt_aes_gcm(existing.identity_no_enc)
            before_masked = mask_identity_no(b_clean)
        except Exception:
            before_masked = "********"

    after_masked = None
    if new_id_enc:
        try:
            a_clean = decrypt_aes_gcm(new_id_enc)
            after_masked = mask_identity_no(a_clean)
        except Exception:
            after_masked = "********"

    before_state = {
        "name": existing.name,
        "tax_code": existing.tax_code,
        "identity_no_masked": before_masked,
        "representative_name": existing.representative_name,
        "phone": existing.phone,
        "email": existing.email,
        "address": existing.address,
        "category_group": existing.category_group
    }

    after_state = {
        "name": new_name,
        "tax_code": new_tax_code,
        "identity_no_masked": after_masked,
        "representative_name": new_rep,
        "phone": new_phone,
        "email": new_email,
        "address": new_address,
        "category_group": new_category
    }

    ip = _get_client_ip(request)
    ua = request.headers.get("user-agent", "ASL-Client/2.0")

    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as sync_conn:
        log_audit_event(
            sync_conn,
            actor_type="USER",
            action="CLIENT_UPDATED",
            entity_name="clients",
            entity_id=str(c_uuid),
            actor_id=str(current_user["id"]),
            before_state=before_state,
            after_state=after_state,
            ip_address=ip,
            user_agent=ua
        )

    return {
        "id": str(c_uuid),
        "client_type": existing.client_type,
        "name": new_name,
        "tax_code": new_tax_code,
        "identity_no": after_masked,
        "identity_no_masked": after_masked,
        "representative_name": new_rep,
        "phone": new_phone,
        "email": new_email,
        "address": new_address,
        "category_group": new_category,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }


async def list_clients(
    q: Optional[str] = None,
    category_group: Optional[str] = None,
    page: int = 1,
    limit: int = 20
) -> Dict[str, Any]:
    """Tìm kiếm và phân trang danh sách khách hàng."""
    offset = (page - 1) * limit
    q_norm = None
    q_raw = None
    if q and q.strip():
        q_raw = f"%{q.strip()}%"
        q_norm = f"%{normalize_text(q.strip())}%"

    cat = category_group.strip() if category_group and category_group.strip() else None

    # Điều kiện WHERE linh hoạt
    where_clauses = ["1=1"]
    params: Dict[str, Any] = {"limit": limit, "offset": offset}

    if cat:
        where_clauses.append("category_group = :category_group")
        params["category_group"] = cat

    if q_norm:
        where_clauses.append("(normalized_name ILIKE :q_norm OR tax_code ILIKE :q_raw)")
        params["q_norm"] = q_norm
        params["q_raw"] = q_raw

    where_sql = " AND ".join(where_clauses)

    async with engine.connect() as conn:
        count_res = await conn.execute(
            text(f"SELECT COUNT(*) FROM clients WHERE {where_sql}"),
            params
        )
        total_records = count_res.scalar() or 0

        data_res = await conn.execute(
            text(f"""
                SELECT id, client_type, name, normalized_name, tax_code,
                       identity_no_enc, representative_name, phone, email,
                       address, category_group, created_at, updated_at
                FROM clients
                WHERE {where_sql}
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset
            """),
            params
        )
        rows = data_res.fetchall()

    items: List[Dict[str, Any]] = []
    for r in rows:
        masked_id = None
        if r.identity_no_enc:
            try:
                clean_id = decrypt_aes_gcm(r.identity_no_enc)
                masked_id = mask_identity_no(clean_id)
            except Exception:
                masked_id = "********"

        items.append({
            "id": str(r.id),
            "client_type": r.client_type,
            "name": r.name,
            "tax_code": r.tax_code,
            "identity_no": masked_id,
            "identity_no_masked": masked_id,
            "representative_name": r.representative_name,
            "phone": r.phone,
            "email": r.email,
            "address": r.address,
            "category_group": r.category_group,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None
        })

    total_pages = math.ceil(total_records / limit) if total_records > 0 else 0

    meta = {
        "page": page,
        "limit": limit,
        "total_records": total_records,
        "total_pages": total_pages
    }

    return {
        "items": items,
        "meta": meta
    }


async def check_conflicts_standalone(
    name: str,
    tax_code: Optional[str] = None,
    identity_no: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Kiểm tra xung đột lợi ích độc lập mà không tạo dữ liệu."""
    norm_name = normalize_text(name)
    id_hash = None
    if identity_no:
        clean_id = normalize_identity_no(identity_no)
        master_key = get_master_key()
        id_hash = hmac.new(master_key, clean_id.encode("utf-8"), hashlib.sha256).hexdigest()

    conflicts = await check_conflict_of_interest(norm_name, id_hash)
    formatted = []
    for c in conflicts:
        formatted.append({
            "case_code": c.get("case_code"),
            "case_id": c.get("case_id"),
            "party_name": name,
            "party_role": "OPPOSING"
        })
    return formatted


async def add_interaction(
    client_id_str: str,
    payload: InteractionCreate,
    current_user: Dict[str, Any]
) -> Dict[str, Any]:
    """Thêm một dòng tương tác vào hồ sơ khách hàng."""
    try:
        c_uuid = uuid.UUID(client_id_str)
    except ValueError:
        raise AppException(404, "NOT_FOUND", "Không tìm thấy khách hàng")

    # Parse occurred_at
    try:
        occ_dt = datetime.fromisoformat(payload.occurred_at.replace("Z", "+00:00"))
    except Exception:
        raise AppException(422, "VALIDATION_ERROR", "Định dạng occurred_at không hợp lệ (ISO-8601)")

    int_id = uuid.uuid4()
    user_id = uuid.UUID(current_user["id"])

    async with engine.begin() as conn:
        chk = await conn.execute(
            text("SELECT id FROM clients WHERE id = :id"),
            {"id": c_uuid}
        )
        if not chk.fetchone():
            raise AppException(404, "NOT_FOUND", "Không tìm thấy khách hàng")

        await conn.execute(
            text("""
                INSERT INTO client_interactions (
                    id, client_id, kind, summary, occurred_at, created_by, created_at
                ) VALUES (
                    :id, :client_id, :kind, :summary, :occurred_at, :created_by, NOW()
                )
            """),
            {
                "id": int_id,
                "client_id": c_uuid,
                "kind": payload.kind,
                "summary": payload.summary,
                "occurred_at": occ_dt,
                "created_by": user_id,
            }
        )

    return {
        "id": str(int_id),
        "client_id": str(c_uuid),
        "kind": payload.kind,
        "summary": payload.summary,
        "occurred_at": occ_dt.isoformat(),
        "created_by": str(user_id),
        "created_at": datetime.now(timezone.utc).isoformat()
    }


async def list_interactions(client_id_str: str) -> List[Dict[str, Any]]:
    """Lấy danh sách các tương tác của khách hàng sắp xếp mới nhất trước."""
    try:
        c_uuid = uuid.UUID(client_id_str)
    except ValueError:
        raise AppException(404, "NOT_FOUND", "Không tìm thấy khách hàng")

    async with engine.connect() as conn:
        chk = await conn.execute(
            text("SELECT id FROM clients WHERE id = :id"),
            {"id": c_uuid}
        )
        if not chk.fetchone():
            raise AppException(404, "NOT_FOUND", "Không tìm thấy khách hàng")

        res = await conn.execute(
            text("""
                SELECT id, client_id, kind, summary, occurred_at, created_by, created_at
                FROM client_interactions
                WHERE client_id = :id
                ORDER BY occurred_at DESC, created_at DESC
            """),
            {"id": c_uuid}
        )
        rows = res.fetchall()

    return [
        {
            "id": str(r.id),
            "client_id": str(r.client_id),
            "kind": r.kind,
            "summary": r.summary,
            "occurred_at": r.occurred_at.isoformat() if r.occurred_at else None,
            "created_by": str(r.created_by) if r.created_by else None,
            "created_at": r.created_at.isoformat() if r.created_at else None
        }
        for r in rows
    ]
