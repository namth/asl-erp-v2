"""Pure-logic access policy table for Need-to-Know access control.

Compliant with docs/06-database-schema.md §3.3.
Evaluates facts retrieved from Neo4j Aura without external DB dependencies.
"""
from typing import TypedDict, Optional

class NeedToKnowFacts(TypedDict):
    case_exists: bool
    active: bool
    system_role: str
    is_executive: bool
    is_assigned: bool
    is_case_manager: bool
    leads_case_department: bool
    is_originator: bool

VALID_SCOPES = {"professional", "finance", "progress", "admin_meta"}

def can_access_scope(facts: NeedToKnowFacts, scope: str) -> bool:
    """Evaluates whether the facts grant access to the specified scope.

    Args:
        facts: Dict containing facts returned by Neo4j fact query.
        scope: One of 'professional', 'finance', 'progress', 'admin_meta'.

    Returns:
        bool: True if access is permitted, False otherwise.
    """
    if scope not in VALID_SCOPES:
        raise ValueError(f"Invalid scope '{scope}'. Must be one of {VALID_SCOPES}")

    # Account must be active and case must exist
    if not facts.get("active", False) or not facts.get("case_exists", False):
        return False

    is_exec = facts.get("is_executive", False)
    leads_dept = facts.get("leads_case_department", False)
    is_assigned = facts.get("is_assigned", False)
    is_case_mgr = facts.get("is_case_manager", False)
    role = facts.get("system_role", "")
    is_originator = facts.get("is_originator", False)

    # 1. Scope: professional (Hồ sơ, trường động, task, tài liệu chuyên môn, phê duyệt)
    # Allowed when: is_executive OR leads_case_department OR is_assigned
    if scope == "professional":
        return is_exec or leads_dept or is_assigned

    # 2. Scope: finance (Đợt thu, xác nhận MISA, hoa hồng của vụ việc, thư mục LEGAL_CONTRACTS)
    # Allowed when: system_role = ACCOUNTANT OR is_executive OR leads_case_department OR is_case_manager
    if scope == "finance":
        return (role == "ACCOUNTANT") or is_exec or leads_dept or is_case_mgr

    # 3. Scope: progress (Mã, tên, trạng thái, % tiến độ, tình trạng thu tiền)
    # Allowed when: any of professional OR system_role = ACCOUNTANT OR is_originator
    if scope == "progress":
        return is_exec or leads_dept or is_assigned or (role == "ACCOUNTANT") or is_originator

    # 4. Scope: admin_meta (Mã, trạng thái, danh sách phân công phục vụ kỹ thuật)
    # Allowed when: system_role = ADMIN
    # Note: ADMIN does NOT have access to professional or finance scopes unless assigned
    if scope == "admin_meta":
        return role == "ADMIN"

    return False
