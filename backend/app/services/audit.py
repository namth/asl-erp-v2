import json
import hashlib
from typing import Optional, Dict, Any, Tuple
import psycopg
from backend.app.core.config import settings

GENESIS_HASH = "0" * 64

def canonical_json(obj: Any) -> str:
    """Produces deterministic canonical JSON for hashing."""
    if obj is None:
        return ""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

def compute_row_hash(prev_hash: str, payload_str: str) -> str:
    """Computes SHA-256 hash of previous hash concatenated with row payload."""
    data = f"{prev_hash}|{payload_str}".encode("utf-8")
    return hashlib.sha256(data).hexdigest()

def log_audit_event(
    conn: psycopg.Connection,
    actor_type: str,
    action: str,
    entity_name: str,
    entity_id: str,
    actor_id: Optional[str] = None,
    before_state: Optional[Dict[str, Any]] = None,
    after_state: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = "127.0.0.1",
    user_agent: Optional[str] = "ASL-Internal/2.0"
) -> Tuple[int, str]:
    """Records an immutable audit log entry into PostgreSQL with cryptographic hash chaining."""
    with conn.cursor() as cur:
        # Acquire advisory transaction lock to serialize audit writes
        cur.execute("SELECT pg_advisory_xact_lock(742189);")

        # Get latest prev_hash
        cur.execute("SELECT row_hash FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1;")
        row = cur.fetchone()
        prev_hash = row[0] if row else GENESIS_HASH

        # Payload string for hashing
        payload_parts = [
            actor_type,
            str(actor_id or ""),
            action,
            entity_name,
            entity_id,
            canonical_json(before_state),
            canonical_json(after_state),
            str(ip_address or "")
        ]
        payload_str = "|".join(payload_parts)
        row_hash = compute_row_hash(prev_hash, payload_str)

        # Insert audit log
        cur.execute("""
            INSERT INTO audit_logs (
                actor_type, actor_id, action, entity_name, entity_id,
                before_state, after_state, ip_address, user_agent,
                prev_hash, row_hash
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s
            ) RETURNING id;
        """, (
            actor_type,
            actor_id,
            action,
            entity_name,
            entity_id,
            json.dumps(before_state) if before_state else None,
            json.dumps(after_state) if after_state else None,
            ip_address,
            user_agent,
            prev_hash,
            row_hash
        ))
        inserted_id = cur.fetchone()[0]
        return inserted_id, row_hash

def verify_audit_chain(
    conn: psycopg.Connection, 
    from_id: Optional[int] = None
) -> Tuple[bool, int, Optional[str]]:
    """Verifies that the audit chain in PostgreSQL is unbroken.

    Args:
        conn: PostgreSQL connection.
        from_id: Optional minimum audit log ID to verify from.

    Returns:
        (is_valid, count, error_message)
    """
    with conn.cursor() as cur:
        query = """
            SELECT id, actor_type, actor_id, action, entity_name, entity_id,
                   before_state, after_state, ip_address, prev_hash, row_hash
            FROM audit_logs
        """
        params = []
        if from_id is not None:
            query += " WHERE id >= %s"
            params.append(from_id)
        query += " ORDER BY created_at ASC, id ASC;"
        cur.execute(query, params)
        rows = cur.fetchall()

    if not rows:
        return True, 0, None

    # For the first row evaluated, its prev_hash is our baseline
    expected_prev = rows[0][9]
    for r in rows:
        r_id, a_type, a_id, action, e_name, e_id, b_state, a_state, ip, prev_h, row_h = r
        if prev_h != expected_prev:
            return False, len(rows), f"Chain broken at id {r_id}: expected prev_hash {expected_prev}, got {prev_h}"

        payload_parts = [
            a_type,
            str(a_id or ""),
            action,
            e_name,
            e_id,
            canonical_json(b_state),
            canonical_json(a_state),
            str(ip or "")
        ]
        calculated_hash = compute_row_hash(prev_h, "|".join(payload_parts))
        if calculated_hash != row_h:
            return False, len(rows), f"Data tampering detected at id {r_id}: expected row_hash {calculated_hash}, got {row_h}"

        expected_prev = row_h

    return True, len(rows), None
