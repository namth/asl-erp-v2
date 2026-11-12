"""Dịch vụ nghiệp vụ tài liệu vụ việc (documents & document_versions).

Tuân thủ docs/07-api-contracts.md §3.8, docs/10-env-and-security.md và brief TASK-045.
"""
from __future__ import annotations

import asyncio
import hashlib
import uuid
from typing import Any, Dict, List, Optional, Tuple
import psycopg

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.guards.need_to_know import query_need_to_know_facts
from backend.app.guards.access_policy import can_access_scope
from backend.app.services.audit import log_audit_event
from backend.app.services.file_types import detect_file_type
from backend.app.services.file_vault import save_file_to_vault, read_file_from_vault

ALLOWED_FOLDERS = ["LEGAL_CONTRACTS", "CLIENT_SUBMISSIONS", "OFFICIAL_FILINGS", "INTERNAL_DRAFTS"]


def record_access_denied_audit(user_id: str, case_id: str) -> None:
    """Ghi nhận audit khi người dùng vi phạm need-to-know."""
    try:
        with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
            log_audit_event(
                conn=conn,
                actor_type="USER",
                action="ACCESS_DENIED",
                entity_name="cases",
                entity_id=case_id,
                actor_id=user_id,
            )
    except Exception:
        pass


async def check_document_access(user_id: str, case_id: str) -> Dict[str, bool]:
    """Kiểm tra phân quyền need-to-know (professional và finance) qua Neo4j Aura."""
    facts = await query_need_to_know_facts(user_id, case_id)
    prof = can_access_scope(facts, "professional")
    fin = can_access_scope(facts, "finance")

    if not prof and not fin:
        # Thử lại 1 lần sau 100ms phòng trễ đồng bộ phiên Neo4j
        await asyncio.sleep(0.1)
        facts = await query_need_to_know_facts(user_id, case_id)
        prof = can_access_scope(facts, "professional")
        fin = can_access_scope(facts, "finance")

    if not prof and not fin:
        record_access_denied_audit(user_id, case_id)
        raise AppException(
            status_code=403,
            code="NEED_TO_KNOW_DENIED",
            message=f"NEED_TO_KNOW_DENIED: Access to documents on case '{case_id}' is restricted.",
        )

    return {"professional": prof, "finance": fin}


def get_case_id_for_document_sync(document_id: str) -> Tuple[str, str, bool]:
    """Lấy case_id, folder, is_archived của tài liệu. Không có -> 404."""
    with psycopg.connect(settings.DATABASE_SYNC_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT case_id, folder, is_archived FROM documents WHERE id = %s",
                (document_id,),
            )
            row = cur.fetchone()
            if not row:
                raise AppException(404, "NOT_FOUND", "Không tìm thấy tài liệu")
            return str(row[0]), str(row[1]), bool(row[2])


def list_documents_sync(
    case_id: str,
    folder: Optional[str],
    include_archived: bool,
    access: Dict[str, bool],
) -> Dict[str, Any]:
    """Lấy danh sách tài liệu vụ việc theo thư mục và trạng thái lưu trữ."""
    is_prof = access["professional"]
    is_fin = access["finance"]

    if not is_prof and is_fin:
        allowed_folders = ["LEGAL_CONTRACTS"]
        can_upload = False
        if folder and folder != "LEGAL_CONTRACTS":
            raise AppException(403, "FOLDER_NOT_ALLOWED", "Bạn chỉ có quyền xem thư mục LEGAL_CONTRACTS")
        query_folder = "LEGAL_CONTRACTS"
    else:
        allowed_folders = list(ALLOWED_FOLDERS)
        can_upload = True
        if folder:
            if folder not in ALLOWED_FOLDERS:
                raise AppException(422, "VALIDATION_ERROR", f"Thư mục không hợp lệ: {folder}")
            query_folder = folder
        else:
            query_folder = None

    sql = """
        SELECT d.id, d.folder, d.title, d.task_id, d.is_archived, d.created_at,
               t.title AS task_title,
               v.id AS v_id, v.version_no, v.original_filename, v.mime_type,
               v.size_bytes, v.scan_status, v.created_at AS v_created_at,
               u.id AS uploader_id, u.full_name AS uploader_name
        FROM documents d
        LEFT JOIN case_tasks t ON d.task_id = t.id
        LEFT JOIN document_versions v ON d.current_version_id = v.id
        LEFT JOIN users u ON v.uploaded_by = u.id
        WHERE d.case_id = %s
    """
    params: List[Any] = [case_id]

    if query_folder:
        sql += " AND d.folder = %s"
        params.append(query_folder)

    if not include_archived:
        sql += " AND d.is_archived = FALSE"

    sql += " ORDER BY d.created_at DESC, d.id DESC"

    with psycopg.connect(settings.DATABASE_SYNC_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    items = []
    for r in rows:
        task_data = {"id": str(r[3]), "title": r[6]} if r[3] else None
        current_v = None
        if r[7]:  # v_id
            current_v = {
                "id": str(r[7]),
                "version_no": r[8],
                "original_filename": r[9],
                "mime_type": r[10],
                "size_bytes": r[11],
                "scan_status": r[12],
                "uploaded_by": {
                    "id": str(r[14]) if r[14] else None,
                    "name": r[15] or "",
                },
                "uploaded_at": r[13].isoformat() if r[13] else None,
            }

        items.append({
            "id": str(r[0]),
            "folder": r[1],
            "title": r[2],
            "task": task_data,
            "is_archived": bool(r[4]),
            "created_at": r[5].isoformat() if r[5] else None,
            "current_version": current_v,
        })

    return {
        "data": items,
        "meta": {
            "allowed_folders": allowed_folders,
            "can_upload": can_upload,
        },
    }


def create_document_sync(
    case_id: str,
    folder: str,
    title: str,
    task_id: Optional[str],
    file_bytes: bytes,
    original_filename: str,
    current_user: Dict[str, Any],
    access: Dict[str, bool],
) -> Dict[str, Any]:
    """Tải lên tài liệu lần đầu: kiểm tra tính hợp lệ, mã hoá, lưu DB và NAS, ghi audit."""
    if not access["professional"]:
        raise AppException(403, "FOLDER_NOT_ALLOWED", "Bạn không có quyền tải lên tài liệu vụ việc")

    # 1. Kiểm tra đầu vào title
    if not title or not (1 <= len(title.strip()) <= 255):
        raise AppException(422, "VALIDATION_ERROR", "Tiêu đề tài liệu phải từ 1 đến 255 ký tự")

    # 2. Kiểm tra folder
    if folder not in ALLOWED_FOLDERS:
        raise AppException(422, "VALIDATION_ERROR", f"Thư mục '{folder}' không hợp lệ")

    # 3. Kiểm tra vụ việc và tính legacy
    with psycopg.connect(settings.DATABASE_SYNC_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, is_legacy FROM cases WHERE id = %s", (case_id,))
            case_row = cur.fetchone()
            if not case_row:
                raise AppException(404, "NOT_FOUND", "Không tìm thấy vụ việc")
            if case_row[1]:  # is_legacy
                raise AppException(409, "LEGACY_CASE_READ_ONLY", "Vụ việc lịch sử chỉ đọc")

            # 4. Kiểm tra task_id nếu có
            if task_id:
                cur.execute("SELECT 1 FROM case_tasks WHERE id = %s AND case_id = %s", (task_id, case_id))
                if not cur.fetchone():
                    raise AppException(422, "VALIDATION_ERROR", "Tác vụ không thuộc vụ việc này")

    # 5. Kiểm tra kích cỡ tệp
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise AppException(413, "FILE_TOO_LARGE", f"Tệp vượt quá giới hạn tối đa {settings.MAX_UPLOAD_SIZE_MB}MB")

    # 6. Nhận diện định dạng tệp qua nội dung (bỏ qua đuôi và client mime)
    mime_type = detect_file_type(file_bytes)
    if not mime_type:
        raise AppException(415, "FILE_TYPE_NOT_ALLOWED", "Định dạng tệp không được hỗ trợ")

    # 7. Chuẩn bị mã hoá và sinh ID
    doc_id = str(uuid.uuid4())
    version_id = str(uuid.uuid4())
    sha256_hash = hashlib.sha256(file_bytes).hexdigest()
    size_bytes = len(file_bytes)

    # 8. Lưu tệp mã hoá lên NAS
    storage_path = save_file_to_vault(case_id, doc_id, version_id, file_bytes)

    # 9. Ghi DB trong transaction
    user_id = current_user["id"]
    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=False) as conn:
        with conn.cursor() as cur:
            # Chèn documents trước với current_version_id = NULL
            cur.execute("""
                INSERT INTO documents (
                    id, case_id, folder, title, task_id, current_version_id,
                    is_archived, created_by, created_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, NULL, FALSE, %s, NOW(), NOW())
            """, (doc_id, case_id, folder, title.strip(), task_id or None, user_id))

            # Chèn document_versions phiên bản 1
            cur.execute("""
                INSERT INTO document_versions (
                    id, document_id, version_no, storage_path, original_filename,
                    mime_type, size_bytes, sha256, scan_status, uploaded_by, created_at
                ) VALUES (%s, %s, 1, %s, %s, %s, %s, %s, 'PENDING', %s, NOW())
            """, (version_id, doc_id, storage_path, original_filename, mime_type, size_bytes, sha256_hash, user_id))

            # Cập nhật current_version_id của documents
            cur.execute("""
                UPDATE documents SET current_version_id = %s WHERE id = %s
            """, (version_id, doc_id))

            # Ghi audit log
            log_audit_event(
                conn=conn,
                actor_type="USER",
                action="DOCUMENT_UPLOADED",
                entity_name="documents",
                entity_id=doc_id,
                actor_id=user_id,
            )

        conn.commit()

    # 10. Trả về cấu trúc tài liệu vừa tạo
    return get_document_detail_sync(doc_id)


def add_document_version_sync(
    document_id: str,
    file_bytes: bytes,
    original_filename: str,
    current_user: Dict[str, Any],
    access: Dict[str, bool],
) -> Dict[str, Any]:
    """Thêm phiên bản mới cho tài liệu đã tồn tại."""
    if not access["professional"]:
        raise AppException(403, "FOLDER_NOT_ALLOWED", "Bạn không có quyền tải lên phiên bản mới")

    # 1. Kiểm tra kích cỡ tệp
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(file_bytes) > max_bytes:
        raise AppException(413, "FILE_TOO_LARGE", f"Tệp vượt quá giới hạn tối đa {settings.MAX_UPLOAD_SIZE_MB}MB")

    # 2. Nhận diện định dạng tệp qua nội dung
    mime_type = detect_file_type(file_bytes)
    if not mime_type:
        raise AppException(415, "FILE_TYPE_NOT_ALLOWED", "Định dạng tệp không được hỗ trợ")

    sha256_hash = hashlib.sha256(file_bytes).hexdigest()
    size_bytes = len(file_bytes)
    version_id = str(uuid.uuid4())
    user_id = current_user["id"]

    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=False) as conn:
        with conn.cursor() as cur:
            # Khoá hàng tài liệu và kiểm tra
            cur.execute("""
                SELECT d.id, d.case_id, d.is_archived, c.is_legacy
                FROM documents d
                JOIN cases c ON d.case_id = c.id
                WHERE d.id = %s
                FOR UPDATE
            """, (document_id,))
            doc_row = cur.fetchone()
            if not doc_row:
                raise AppException(404, "NOT_FOUND", "Không tìm thấy tài liệu")

            case_id = str(doc_row[1])
            is_archived = bool(doc_row[2])
            is_legacy = bool(doc_row[3])

            if is_archived:
                raise AppException(409, "DOCUMENT_ARCHIVED", "Tài liệu đã được lưu trữ, không thể thêm phiên bản mới")

            if is_legacy:
                raise AppException(409, "LEGACY_CASE_READ_ONLY", "Vụ việc lịch sử chỉ đọc")

            # Tính version_no mới
            cur.execute("""
                SELECT COALESCE(MAX(version_no), 0) + 1
                FROM document_versions
                WHERE document_id = %s
            """, (document_id,))
            next_version_no = cur.fetchone()[0]

            # Lưu tệp mã hoá lên NAS
            storage_path = save_file_to_vault(case_id, document_id, version_id, file_bytes)

            # Chèn document_versions
            cur.execute("""
                INSERT INTO document_versions (
                    id, document_id, version_no, storage_path, original_filename,
                    mime_type, size_bytes, sha256, scan_status, uploaded_by, created_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'PENDING', %s, NOW())
            """, (version_id, document_id, next_version_no, storage_path, original_filename,
                  mime_type, size_bytes, sha256_hash, user_id))

            # Cập nhật documents
            cur.execute("""
                UPDATE documents
                SET current_version_id = %s, updated_at = NOW()
                WHERE id = %s
            """, (version_id, document_id))

            # Ghi audit log
            log_audit_event(
                conn=conn,
                actor_type="USER",
                action="DOCUMENT_VERSION_UPLOADED",
                entity_name="documents",
                entity_id=document_id,
                actor_id=user_id,
            )

        conn.commit()

    return get_document_detail_sync(document_id)


def get_document_versions_sync(
    document_id: str,
    access: Dict[str, bool],
) -> List[Dict[str, Any]]:
    """Lấy danh sách các phiên bản của tài liệu, mới nhất trước."""
    with psycopg.connect(settings.DATABASE_SYNC_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT folder FROM documents WHERE id = %s", (document_id,))
            doc_row = cur.fetchone()
            if not doc_row:
                raise AppException(404, "NOT_FOUND", "Không tìm thấy tài liệu")

            folder = doc_row[0]
            if not access["professional"] and access["finance"]:
                if folder != "LEGAL_CONTRACTS":
                    raise AppException(403, "FOLDER_NOT_ALLOWED", "Bạn chỉ có quyền xem phiên bản tài liệu hợp đồng")

            cur.execute("""
                SELECT v.id, v.version_no, v.original_filename, v.mime_type,
                       v.size_bytes, v.scan_status, v.created_at,
                       u.id AS uploader_id, u.full_name AS uploader_name
                FROM document_versions v
                LEFT JOIN users u ON v.uploaded_by = u.id
                WHERE v.document_id = %s
                ORDER BY v.version_no DESC
            """, (document_id,))
            rows = cur.fetchall()

    versions = []
    for r in rows:
        versions.append({
            "id": str(r[0]),
            "version_no": r[1],
            "original_filename": r[2],
            "mime_type": r[3],
            "size_bytes": r[4],
            "scan_status": r[5],
            "uploaded_by": {
                "id": str(r[7]) if r[7] else None,
                "name": r[8] or "",
            },
            "uploaded_at": r[6].isoformat() if r[6] else None,
        })
    return versions


def get_document_download_sync(
    document_id: str,
    version_id: str,
    current_user: Dict[str, Any],
    access: Dict[str, bool],
) -> Tuple[bytes, str, str]:
    """Tải xuống tệp: kiểm tra quyền, trạng thái quét virus, giải mã từ NAS và ghi audit."""
    with psycopg.connect(settings.DATABASE_SYNC_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT d.id, d.folder, v.scan_status, v.storage_path, v.mime_type, v.original_filename
                FROM documents d
                JOIN document_versions v ON d.id = v.document_id
                WHERE d.id = %s AND v.id = %s
            """, (document_id, version_id))
            row = cur.fetchone()
            if not row:
                raise AppException(404, "NOT_FOUND", "Không tìm thấy phiên bản tài liệu")

            folder = row[1]
            scan_status = row[2]
            storage_path = row[3]
            mime_type = row[4]
            original_filename = row[5]

            if not access["professional"] and access["finance"]:
                if folder != "LEGAL_CONTRACTS":
                    raise AppException(403, "FOLDER_NOT_ALLOWED", "Bạn chỉ có quyền tải tài liệu hợp đồng")

            if scan_status != "CLEAN":
                raise AppException(409, "FILE_NOT_AVAILABLE", "Tệp chưa quét xong hoặc bị nhiễm virus")

            # Ghi nhận audit log mỗi lượt tải
            log_audit_event(
                conn=conn,
                actor_type="USER",
                action="DOCUMENT_DOWNLOADED",
                entity_name="documents",
                entity_id=document_id,
                actor_id=current_user["id"],
            )

    # Giải mã tệp từ NAS
    decrypted_bytes = read_file_from_vault(storage_path)
    return decrypted_bytes, mime_type, original_filename


def archive_document_sync(
    document_id: str,
    reason: Optional[str],
    current_user: Dict[str, Any],
    access: Dict[str, bool],
) -> None:
    """Lưu trữ tài liệu: ghi nhận lý do vào audit log, đánh dấu is_archived = True."""
    if not access["professional"]:
        raise AppException(403, "FOLDER_NOT_ALLOWED", "Bạn không có quyền lưu trữ tài liệu")

    if reason is None or not (1 <= len(reason.strip()) <= 500):
        raise AppException(422, "VALIDATION_ERROR", "Lý do lưu trữ tài liệu phải từ 1 đến 500 ký tự")

    with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=False) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM documents WHERE id = %s", (document_id,))
            if not cur.fetchone():
                raise AppException(404, "NOT_FOUND", "Không tìm thấy tài liệu")

            cur.execute("""
                UPDATE documents
                SET is_archived = TRUE, updated_at = NOW()
                WHERE id = %s
            """, (document_id,))

            log_audit_event(
                conn=conn,
                actor_type="USER",
                action="DOCUMENT_ARCHIVED",
                entity_name="documents",
                entity_id=document_id,
                actor_id=current_user["id"],
                after_state={"reason": reason.strip()},
            )

        conn.commit()


def get_document_detail_sync(document_id: str) -> Dict[str, Any]:
    """Truy vấn thông tin chi tiết một tài liệu cùng phiên bản hiện tại."""
    sql = """
        SELECT d.id, d.folder, d.title, d.task_id, d.is_archived, d.created_at,
               t.title AS task_title,
               v.id AS v_id, v.version_no, v.original_filename, v.mime_type,
               v.size_bytes, v.scan_status, v.created_at AS v_created_at,
               u.id AS uploader_id, u.full_name AS uploader_name
        FROM documents d
        LEFT JOIN case_tasks t ON d.task_id = t.id
        LEFT JOIN document_versions v ON d.current_version_id = v.id
        LEFT JOIN users u ON v.uploaded_by = u.id
        WHERE d.id = %s
    """
    with psycopg.connect(settings.DATABASE_SYNC_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (document_id,))
            r = cur.fetchone()
            if not r:
                raise AppException(404, "NOT_FOUND", "Không tìm thấy tài liệu")

    task_data = {"id": str(r[3]), "title": r[6]} if r[3] else None
    current_v = None
    if r[7]:
        current_v = {
            "id": str(r[7]),
            "version_no": r[8],
            "original_filename": r[9],
            "mime_type": r[10],
            "size_bytes": r[11],
            "scan_status": r[12],
            "uploaded_by": {
                "id": str(r[14]) if r[14] else None,
                "name": r[15] or "",
            },
            "uploaded_at": r[13].isoformat() if r[13] else None,
        }

    return {
        "id": str(r[0]),
        "folder": r[1],
        "title": r[2],
        "task": task_data,
        "is_archived": bool(r[4]),
        "created_at": r[5].isoformat() if r[5] else None,
        "current_version": current_v,
    }
