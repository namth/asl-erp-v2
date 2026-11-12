"""Nhận diện định dạng tệp dựa theo nội dung (magic bytes / cấu trúc zip).

Bỏ qua phần mở rộng (extension) và Content-Type do client gửi lên.
Chỉ cho phép danh sách trắng: PDF, PNG, JPEG, DOCX, XLSX.
"""
from __future__ import annotations

import io
import zipfile
from typing import Optional

MIME_PDF = "application/pdf"
MIME_PNG = "image/png"
MIME_JPEG = "image/jpeg"
MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def detect_file_type(data: bytes) -> Optional[str]:
    """Phát hiện MIME type từ nội dung nhị phân.
    
    Trả về MIME type chuẩn nếu hợp lệ, None nếu không thuộc danh sách trắng.
    """
    if not data:
        return None

    # 1. PDF: %PDF-
    if data.startswith(b"%PDF-"):
        return MIME_PDF

    # 2. PNG: \x89PNG\r\n\x1a\n
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return MIME_PNG

    # 3. JPEG: \xff\xd8\xff
    if data.startswith(b"\xff\xd8\xff"):
        return MIME_JPEG

    # 4. Office OpenXML (DOCX, XLSX) được đóng gói dạng ZIP: PK\x03\x04
    if data.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                names = set(z.namelist())
                if "[Content_Types].xml" in names:
                    if any(n.startswith("word/") for n in names):
                        return MIME_DOCX
                    if any(n.startswith("xl/") for n in names):
                        return MIME_XLSX
        except Exception:
            return None

    return None
