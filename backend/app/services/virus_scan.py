"""Dịch vụ quét virus tích hợp ClamAV qua giao thức clamd INSTREAM.

Tuân thủ brief TASK-045:
- Kết nối tới CLAMAV_HOST:CLAMAV_PORT (timeout ~10s).
- Gửi lệnh zINSTREAM\0, truyền từng khối [4 bytes big-endian length][dữ liệu], kết thúc bằng \0\0\0\0.
- Nhận phản hồi:
    * chứa 'FOUND' -> INFECTED
    * kết thúc/chứa 'OK' -> CLEAN
    * lỗi kết nối / timeout -> giữ PENDING, ghi log (không bao giờ coi là sạch).
- Hàm quét thuần độc lập, tương thích BackgroundTasks của FastAPI và Celery.
"""
from __future__ import annotations

import logging
import socket
from typing import Optional
import psycopg

from backend.app.core.config import settings
from backend.app.services.file_vault import read_file_from_vault

logger = logging.getLogger(__name__)

CHUNK_SIZE = 64 * 1024  # 64 KB


def scan_bytes_clamd(data: bytes, host: Optional[str] = None, port: Optional[int] = None) -> Optional[str]:
    """Gửi dữ liệu thô tới máy chủ ClamAV qua giao thức clamd INSTREAM.
    
    Trả về 'CLEAN', 'INFECTED', hoặc None nếu không kết nối được hoặc timeout.
    """
    host = host or settings.CLAMAV_HOST
    port = port or settings.CLAMAV_PORT

    try:
        with socket.create_connection((host, port), timeout=10.0) as s:
            s.settimeout(10.0)
            # 1. Gửi lệnh INSTREAM (zINSTREAM theo chuẩn clamd)
            s.sendall(b"zINSTREAM\0")

            # 2. Truyền dữ liệu từng chunk kèm 4-byte big-endian length
            offset = 0
            total_len = len(data)
            while offset < total_len:
                chunk = data[offset : offset + CHUNK_SIZE]
                chunk_len = len(chunk)
                s.sendall(chunk_len.to_bytes(4, byteorder="big") + chunk)
                offset += chunk_len

            # 3. Gửi 4 byte 0 kết thúc stream
            s.sendall(b"\x00\x00\x00\x00")

            # 4. Đọc phản hồi từ ClamAV
            resp = b""
            while True:
                part = s.recv(4096)
                if not part:
                    break
                resp += part
                if b"\0" in part or b"\n" in part:
                    break

            if b"FOUND" in resp:
                logger.warning("ClamAV phát hiện mã độc trong tệp: %s", resp)
                return "INFECTED"
            if b"OK" in resp:
                return "CLEAN"

            logger.error("Phản hồi không xác định từ ClamAV: %s", resp)
            return None

    except (socket.error, socket.timeout, OSError) as e:
        logger.warning("Không thể kết nối hoặc quét qua ClamAV (%s:%s): %s", host, port, e)
        return None
    except Exception as e:
        logger.exception("Lỗi không mong muốn khi quét virus ClamAV: %s", e)
        return None


def scan_document_version(version_id: str) -> None:
    """Hàm background task: giải mã tệp từ NAS, quét virus và cập nhật DB."""
    try:
        # 1. Lấy storage_path từ DB
        with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT storage_path FROM document_versions WHERE id = %s",
                    (version_id,),
                )
                row = cur.fetchone()
                if not row:
                    logger.error("Không tìm thấy document_version %s để quét", version_id)
                    return
                storage_path = row[0]

        # 2. Giải mã tệp từ NAS
        plaintext = read_file_from_vault(storage_path)

        # 3. Gửi sang ClamAV quét
        scan_result = scan_bytes_clamd(plaintext)
        if not scan_result:
            logger.info("Giữ trạng thái PENDING cho phiên bản %s do chưa kết nối được ClamAV", version_id)
            return

        # 4. Cập nhật scan_status vào DB
        with psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE document_versions SET scan_status = %s WHERE id = %s",
                    (scan_result, version_id),
                )
        logger.info("Cập nhật kết quả quét virus phiên bản %s: %s", version_id, scan_result)

    except Exception as e:
        logger.exception("Lỗi trong tiến trình quét virus background cho %s: %s", version_id, e)
