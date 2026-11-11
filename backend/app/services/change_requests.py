import json
import uuid
from typing import Optional, List, Dict, Any
from sqlalchemy import text

from backend.app.core.errors import AppException
from backend.app.db.postgres import engine
from backend.app.services.cases import check_case_access

async def list_change_requests(case_id: str, current_user: Dict[str, Any]) -> List[Dict[str, Any]]:
    await check_case_access(current_user["id"], case_id, "professional")

    async with engine.connect() as conn:
        res = await conn.execute(text("""
            SELECT cr.id, cr.case_id, cr.kind, cr.proposal, cr.reason, cr.requested_by, cr.status,
                   cr.approval_request_id, cr.created_at, u.full_name AS requester_name
            FROM workflow_change_requests cr
            LEFT JOIN users u ON cr.requested_by = u.id
            WHERE cr.case_id = :cid
            ORDER BY cr.created_at DESC
        """), {"cid": uuid.UUID(case_id)})
        rows = res.fetchall()
        return [
            {
                "id": str(r.id),
                "case_id": str(r.case_id),
                "kind": r.kind,
                "proposal": r.proposal if isinstance(r.proposal, dict) else json.loads(r.proposal or "{}"),
                "reason": r.reason,
                "requested_by": str(r.requested_by),
                "requester_name": r.requester_name,
                "status": r.status,
                "approval_request_id": str(r.approval_request_id) if r.approval_request_id else None,
                "created_at": r.created_at.isoformat() if r.created_at else None
            }
            for r in rows
        ]

async def create_change_request(
    case_id: str,
    kind: str,
    reason: str,
    proposal: Dict[str, Any],
    current_user: Dict[str, Any]
) -> Dict[str, Any]:
    await check_case_access(current_user["id"], case_id, "professional")

    async with engine.begin() as conn:
        res = await conn.execute(text("""
            SELECT id, workflow_mode, is_legacy FROM cases WHERE id = :cid
        """), {"cid": uuid.UUID(case_id)})
        c = res.fetchone()
        if not c:
            raise AppException(404, "NOT_FOUND", "Không tìm thấy vụ việc")

        if c.workflow_mode == "STRICT":
            raise AppException(
                403,
                "STRICT_GOVERNANCE_VIOLATION",
                "Vụ việc quy trình nghiêm ngặt (STRICT) không cho phép bổ sung tác vụ hoặc giai đoạn"
            )

        cr_id = uuid.uuid4()
        appr_id = uuid.uuid4()
        user_uuid = uuid.UUID(current_user["id"])

        # Insert approval_requests
        await conn.execute(text("""
            INSERT INTO approval_requests (id, case_id, subject_type, subject_id, requested_by, status, requested_at)
            VALUES (:aid, :cid, 'CHANGE_REQUEST', :sub_id, :uid, 'PENDING', NOW())
        """), {"aid": appr_id, "cid": c.id, "sub_id": cr_id, "uid": user_uuid})

        # Insert workflow_change_requests
        await conn.execute(text("""
            INSERT INTO workflow_change_requests (
                id, case_id, kind, proposal, reason, requested_by, status, approval_request_id, created_at
            ) VALUES (
                :crid, :cid, :kind, :proposal, :reason, :uid, 'PENDING', :aid, NOW()
            )
        """), {
            "crid": cr_id,
            "cid": c.id,
            "kind": kind,
            "proposal": json.dumps(proposal),
            "reason": reason,
            "uid": user_uuid,
            "aid": appr_id
        })

    return {
        "id": str(cr_id),
        "case_id": case_id,
        "kind": kind,
        "proposal": proposal,
        "reason": reason,
        "status": "PENDING",
        "approval_request_id": str(appr_id)
    }
