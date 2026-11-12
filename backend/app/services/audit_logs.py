"""Dịch vụ Nhật ký kiểm toán & kiểm toàn vẹn chuỗi băm (TSK-12, SCR-13).

Tuân thủ bất biến #6 (audit_logs chỉ INSERT/SELECT), không sửa hay lách test.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import psycopg
from psycopg.rows import dict_row

from backend.app.core.config import settings
from backend.app.services.audit import GENESIS_HASH, canonical_json, compute_row_hash


def get_db_conn() -> psycopg.Connection:
    """Tạo kết nối đồng bộ tới PostgreSQL cho tác vụ kiểm toán."""
    return psycopg.connect(settings.DATABASE_SYNC_URL, autocommit=True)


def scan_chain_rows(
    rows: List[Tuple[Any, ...]],
    expected_prev: str = GENESIS_HASH
) -> Tuple[int, Optional[int]]:
    """Hàm thuần: duyệt danh sách các dòng audit_logs theo id tăng dần.

    Mỗi dòng có cấu trúc tuple:
    (id, actor_type, actor_id, action, entity_name, entity_id,
     before_state, after_state, ip_address, prev_hash, row_hash)

    Kiểm tra:
    1. prev_hash của dòng đầu phải khớp expected_prev (mặc định GENESIS_HASH).
    2. prev_hash của các dòng tiếp theo phải khớp row_hash của dòng liền trước.
    3. row_hash tính lại từ nội dung phải khớp với row_hash lưu trữ.

    Trả về:
    (số dòng đã duyệt, id dòng gãy đầu tiên hoặc None)
    """
    if not rows:
        return 0, None

    checked_count = 0
    first_broken_id: Optional[int] = None
    cur_expected_prev = expected_prev

    for r in rows:
        checked_count += 1
        (
            r_id,
            a_type,
            a_id,
            action,
            e_name,
            e_id,
            b_state,
            a_state,
            ip,
            prev_h,
            row_h,
        ) = r

        # 1. Kiểm tra tính liên kết của chuỗi (prev_hash)
        if prev_h != cur_expected_prev:
            if first_broken_id is None:
                first_broken_id = r_id

        # 2. Tính lại hash của dòng để kiểm tra toàn vẹn dữ liệu
        payload_parts = [
            str(a_type or ""),
            str(a_id or ""),
            str(action or ""),
            str(e_name or ""),
            str(e_id or ""),
            canonical_json(b_state),
            canonical_json(a_state),
            str(ip or "")
        ]
        calculated_hash = compute_row_hash(prev_h, "|".join(payload_parts))
        if calculated_hash != row_h:
            if first_broken_id is None:
                first_broken_id = r_id

        # Cập nhật expected_prev cho dòng tiếp theo theo row_hash lưu trữ của dòng hiện tại
        cur_expected_prev = row_h

    return checked_count, first_broken_id


def scan_chain(
    conn: psycopg.Connection,
    batch_size: int = 2000
) -> Tuple[int, Optional[int]]:
    """Đọc toàn bộ audit_logs theo id ASC theo lô và gọi scan_chain_rows theo lô.

    Giữ prev_hash nối tiếp giữa các lô để không nạp toàn bộ vào RAM.
    API gọi hàm này qua tên module (svc.scan_chain(conn)) để test thay được.
    """
    total_checked = 0
    first_broken_id: Optional[int] = None
    cur_expected_prev = GENESIS_HASH
    last_id = 0

    while True:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, actor_type, actor_id, action, entity_name, entity_id,
                       before_state, after_state, ip_address, prev_hash, row_hash
                FROM audit_logs
                WHERE id > %s
                ORDER BY id ASC
                LIMIT %s;
            """, (last_id, batch_size))
            rows = cur.fetchall()

        if not rows:
            break

        batch_checked, batch_broken = scan_chain_rows(rows, expected_prev=cur_expected_prev)
        total_checked += batch_checked

        if batch_broken is not None and first_broken_id is None:
            first_broken_id = batch_broken

        last_id = rows[-1][0]
        cur_expected_prev = rows[-1][10]

    return total_checked, first_broken_id


def run_integrity_check(conn: Optional[psycopg.Connection] = None) -> Dict[str, Any]:
    """Chạy kiểm tra toàn vẹn chuỗi băm (dùng chung cho API và Celery beat)."""
    import backend.app.services.audit_logs as svc

    def _execute(c: psycopg.Connection) -> Dict[str, Any]:
        checked_rows, first_broken_id = svc.scan_chain(c)
        status = "BROKEN" if first_broken_id is not None else "OK"
        verified_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        return {
            "status": status,
            "checked_rows": checked_rows,
            "verified_at": verified_at,
            "first_broken_id": first_broken_id
        }

    if conn is not None:
        return _execute(conn)

    with get_db_conn() as c:
        return _execute(c)
