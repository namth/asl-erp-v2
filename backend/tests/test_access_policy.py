import pytest
from backend.app.guards.access_policy import can_access_scope, NeedToKnowFacts

@pytest.fixture
def base_facts() -> NeedToKnowFacts:
    return {
        "case_exists": True,
        "active": True,
        "system_role": "ATTORNEY",
        "is_executive": False,
        "is_assigned": False,
        "is_case_manager": False,
        "leads_case_department": False,
        "is_originator": False
    }

def test_inactive_user_denied_all(base_facts):
    base_facts["active"] = False
    base_facts["is_executive"] = True
    for scope in ["professional", "finance", "progress", "admin_meta"]:
        assert can_access_scope(base_facts, scope) is False

def test_nonexistent_case_denied_all(base_facts):
    base_facts["case_exists"] = False
    base_facts["is_executive"] = True
    for scope in ["professional", "finance", "progress", "admin_meta"]:
        assert can_access_scope(base_facts, scope) is False

def test_executive_permissions(base_facts):
    base_facts["system_role"] = "MANAGER"
    base_facts["is_executive"] = True
    assert can_access_scope(base_facts, "professional") is True
    assert can_access_scope(base_facts, "finance") is True
    assert can_access_scope(base_facts, "progress") is True
    assert can_access_scope(base_facts, "admin_meta") is False

def test_dept_leader_permissions(base_facts):
    base_facts["system_role"] = "MANAGER"
    base_facts["leads_case_department"] = True
    assert can_access_scope(base_facts, "professional") is True
    assert can_access_scope(base_facts, "finance") is True
    assert can_access_scope(base_facts, "progress") is True
    assert can_access_scope(base_facts, "admin_meta") is False

def test_assigned_attorney_not_cm_permissions(base_facts):
    base_facts["system_role"] = "ATTORNEY"
    base_facts["is_assigned"] = True
    base_facts["is_case_manager"] = False
    assert can_access_scope(base_facts, "professional") is True
    assert can_access_scope(base_facts, "finance") is False
    assert can_access_scope(base_facts, "progress") is True
    assert can_access_scope(base_facts, "admin_meta") is False

def test_assigned_case_manager_permissions(base_facts):
    base_facts["system_role"] = "ATTORNEY"
    base_facts["is_assigned"] = True
    base_facts["is_case_manager"] = True
    assert can_access_scope(base_facts, "professional") is True
    assert can_access_scope(base_facts, "finance") is True
    assert can_access_scope(base_facts, "progress") is True
    assert can_access_scope(base_facts, "admin_meta") is False

def test_accountant_permissions(base_facts):
    base_facts["system_role"] = "ACCOUNTANT"
    assert can_access_scope(base_facts, "professional") is False
    assert can_access_scope(base_facts, "finance") is True
    assert can_access_scope(base_facts, "progress") is True
    assert can_access_scope(base_facts, "admin_meta") is False

def test_originator_permissions(base_facts):
    base_facts["system_role"] = "ATTORNEY"
    base_facts["is_originator"] = True
    assert can_access_scope(base_facts, "professional") is False
    assert can_access_scope(base_facts, "finance") is False
    assert can_access_scope(base_facts, "progress") is True
    assert can_access_scope(base_facts, "admin_meta") is False

def test_admin_permissions(base_facts):
    base_facts["system_role"] = "ADMIN"
    # Invariant: ADMIN has tech access (admin_meta) but cannot view professional/finance without assignment
    assert can_access_scope(base_facts, "professional") is False
    assert can_access_scope(base_facts, "finance") is False
    assert can_access_scope(base_facts, "progress") is False
    assert can_access_scope(base_facts, "admin_meta") is True

def test_invalid_scope_raises(base_facts):
    with pytest.raises(ValueError):
        can_access_scope(base_facts, "unknown_scope")
