"""API Router cho tài liệu vụ việc (documents & document_versions).

Tuân thủ docs/07-api-contracts.md §3.8 và brief TASK-045:
- GET  /api/v1/cases/{case_id}/documents
- POST /api/v1/cases/{case_id}/documents
- GET  /api/v1/documents/{document_id}/versions
- POST /api/v1/documents/{document_id}/versions
- GET  /api/v1/documents/{document_id}/versions/{version_id}/download
- POST /api/v1/documents/{document_id}/archive
"""
from __future__ import annotations

import asyncio
from urllib.parse import quote
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, Response, UploadFile
from pydantic import BaseModel

from backend.app.core.config import settings
from backend.app.core.errors import AppException
from backend.app.core.security import get_current_user
from backend.app.services.documents import (
    check_document_access,
    get_case_id_for_document_sync,
    list_documents_sync,
    create_document_sync,
    add_document_version_sync,
    get_document_versions_sync,
    get_document_download_sync,
    archive_document_sync,
)
from backend.app.services.virus_scan import scan_document_version

router = APIRouter(tags=["Documents"])


class ArchiveRequest(BaseModel):
    reason: Optional[str] = None


def validate_uuid(value: str, name: str = "Tài nguyên") -> str:
    """Xác thực UUID chuỗi, trả 404 nếu không phải UUID hợp lệ."""
    try:
        uuid.UUID(str(value))
        return str(value)
    except (ValueError, AttributeError):
        raise AppException(404, "NOT_FOUND", f"{name} không tồn tại")


@router.get("/cases/{case_id}/documents")
async def get_case_documents(
    case_id: str,
    folder: Optional[str] = Query(default=None),
    include_archived: bool = Query(default=False),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Liệt kê danh sách tài liệu trong vụ việc."""
    valid_case_id = validate_uuid(case_id, "Vụ việc")
    access = await check_document_access(current_user["id"], valid_case_id)
    result = await asyncio.to_thread(
        list_documents_sync,
        valid_case_id,
        folder,
        include_archived,
        access,
    )
    return {"success": True, "data": result["data"], "meta": result["meta"]}


@router.post("/cases/{case_id}/documents", status_code=201)
async def upload_case_document(
    case_id: str,
    background_tasks: BackgroundTasks,
    folder: str = Form(default=""),
    title: str = Form(default=""),
    task_id: Optional[str] = Form(default=None),
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Tải lên tài liệu lần đầu."""
    valid_case_id = validate_uuid(case_id, "Vụ việc")
    access = await check_document_access(current_user["id"], valid_case_id)

    # Đọc tệp theo khối và kiểm tra giới hạn kích thước trước khi xử lý
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    content = bytearray()
    while chunk := await file.read(1024 * 1024):  # 1MB chunk
        content.extend(chunk)
        if len(content) > max_bytes:
            raise AppException(413, "FILE_TOO_LARGE", f"Tệp vượt quá kích thước cho phép ({settings.MAX_UPLOAD_SIZE_MB}MB)")
    file_bytes = bytes(content)

    clean_task_id = task_id.strip() if task_id and task_id.strip() else None
    if clean_task_id:
        try:
            uuid.UUID(clean_task_id)
        except (ValueError, AttributeError):
            raise AppException(422, "VALIDATION_ERROR", "task_id không hợp lệ")

    doc = await asyncio.to_thread(
        create_document_sync,
        valid_case_id,
        folder,
        title,
        clean_task_id,
        file_bytes,
        file.filename or "tai-lieu.bin",
        current_user,
        access,
    )

    # Đưa tác vụ quét virus vào chạy ngầm (BackgroundTasks)
    if doc.get("current_version") and doc["current_version"].get("id"):
        background_tasks.add_task(scan_document_version, doc["current_version"]["id"])

    return {"success": True, "data": doc}


@router.get("/documents/{document_id}/versions")
async def list_document_versions(
    document_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Lấy danh sách các phiên bản của tài liệu, mới nhất trước."""
    valid_doc_id = validate_uuid(document_id, "Tài liệu")
    case_id, _, _ = await asyncio.to_thread(get_case_id_for_document_sync, valid_doc_id)
    access = await check_document_access(current_user["id"], case_id)

    versions = await asyncio.to_thread(get_document_versions_sync, valid_doc_id, access)
    return {"success": True, "data": versions}


@router.post("/documents/{document_id}/versions", status_code=201)
async def add_new_document_version(
    document_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Thêm một phiên bản mới cho tài liệu."""
    valid_doc_id = validate_uuid(document_id, "Tài liệu")
    case_id, _, _ = await asyncio.to_thread(get_case_id_for_document_sync, valid_doc_id)
    access = await check_document_access(current_user["id"], case_id)

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    content = bytearray()
    while chunk := await file.read(1024 * 1024):
        content.extend(chunk)
        if len(content) > max_bytes:
            raise AppException(413, "FILE_TOO_LARGE", f"Tệp vượt quá kích thước cho phép ({settings.MAX_UPLOAD_SIZE_MB}MB)")
    file_bytes = bytes(content)

    doc = await asyncio.to_thread(
        add_document_version_sync,
        valid_doc_id,
        file_bytes,
        file.filename or "ban-moi.bin",
        current_user,
        access,
    )

    if doc.get("current_version") and doc["current_version"].get("id"):
        background_tasks.add_task(scan_document_version, doc["current_version"]["id"])

    return {"success": True, "data": doc}


@router.get("/documents/{document_id}/versions/{version_id}/download")
async def download_document(
    document_id: str,
    version_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Tải xuống nội dung tệp phiên bản tài liệu (sau khi giải mã từ NAS)."""
    valid_doc_id = validate_uuid(document_id, "Tài liệu")
    valid_ver_id = validate_uuid(version_id, "Phiên bản tài liệu")

    case_id, _, _ = await asyncio.to_thread(get_case_id_for_document_sync, valid_doc_id)
    access = await check_document_access(current_user["id"], case_id)

    content, mime_type, filename = await asyncio.to_thread(
        get_document_download_sync,
        valid_doc_id,
        valid_ver_id,
        current_user,
        access,
    )

    encoded_name = quote(filename)
    headers = {
        "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_name}",
    }
    return Response(content=content, media_type=mime_type, headers=headers)


@router.post("/documents/{document_id}/archive")
async def archive_document(
    document_id: str,
    payload: ArchiveRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Lưu trữ tài liệu."""
    valid_doc_id = validate_uuid(document_id, "Tài liệu")
    case_id, _, _ = await asyncio.to_thread(get_case_id_for_document_sync, valid_doc_id)
    access = await check_document_access(current_user["id"], case_id)

    await asyncio.to_thread(
        archive_document_sync,
        valid_doc_id,
        payload.reason,
        current_user,
        access,
    )
    return {"success": True, "message": "Đã lưu trữ tài liệu"}
