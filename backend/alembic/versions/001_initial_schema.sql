-- ASL LAW ERP v2.0 - Initial Schema Migration
-- Compliant with docs/06-database-schema.md, DEC-01 -> DEC-08

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Departments
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    must_reset_password BOOLEAN NOT NULL DEFAULT FALSE,
    full_name VARCHAR(150) NOT NULL,
    title VARCHAR(100),
    phone_number VARCHAR(20),
    system_role VARCHAR(20) NOT NULL CHECK (system_role IN ('ADMIN', 'MANAGER', 'ACCOUNTANT', 'ATTORNEY')),
    is_executive BOOLEAN NOT NULL DEFAULT FALSE CHECK (NOT is_executive OR system_role = 'MANAGER'),
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    totp_secret_enc BYTEA,
    totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    tokens_valid_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    telegram_chat_id VARCHAR(100),
    zalo_user_id VARCHAR(100),
    legacy_id VARCHAR(64) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Department Leaders
CREATE TABLE IF NOT EXISTS department_leaders (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, department_id)
);

-- 4. Refresh Tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id UUID NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by UUID,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);

-- 5. Holidays (SLA business days)
CREATE TABLE IF NOT EXISTS holidays (
    date DATE PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Clients
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_type VARCHAR(20) NOT NULL CHECK (client_type IN ('ENTERPRISE', 'INDIVIDUAL', 'FOREIGN')),
    name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    tax_code VARCHAR(14) UNIQUE,
    identity_no_enc BYTEA,
    identity_no_hash CHAR(64) UNIQUE,
    representative_name VARCHAR(150),
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(255),
    address TEXT NOT NULL,
    category_group VARCHAR(20) NOT NULL DEFAULT 'NEW' CHECK (category_group IN ('NEW', 'POTENTIAL', 'RETURNING', 'STRATEGIC', 'VIP')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    legacy_id VARCHAR(64) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_client_identification CHECK (
        (client_type = 'ENTERPRISE' AND tax_code IS NOT NULL) OR
        (client_type = 'INDIVIDUAL' AND identity_no_hash IS NOT NULL) OR
        (client_type = 'FOREIGN')
    )
);
CREATE INDEX IF NOT EXISTS idx_clients_normalized_name ON clients(normalized_name);

-- 7. Client Interactions
CREATE TABLE IF NOT EXISTS client_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('CALL', 'MEETING', 'EMAIL', 'NOTE')),
    summary TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_interactions_client ON client_interactions(client_id);

-- 8. Matter Types
CREATE TABLE IF NOT EXISTS matter_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(4) UNIQUE NOT NULL CHECK (code ~ '^[A-Z]{2,4}$'),
    custom_fields_schema JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Workflow Templates
CREATE TABLE IF NOT EXISTS workflow_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    matter_type_id UUID NOT NULL REFERENCES matter_types(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    mode VARCHAR(10) NOT NULL CHECK (mode IN ('STRICT', 'FLEXIBLE')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_templates_active_unique ON workflow_templates(matter_type_id) WHERE is_active = TRUE;

-- 10. Workflow Template Versions
CREATE TABLE IF NOT EXISTS workflow_template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
    version_no INTEGER NOT NULL,
    status VARCHAR(10) NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
    published_by UUID REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(template_id, version_no)
);

-- 11. Template Stages
CREATE TABLE IF NOT EXISTS template_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_version_id UUID NOT NULL REFERENCES workflow_template_versions(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    order_index SMALLINT NOT NULL,
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(template_version_id, order_index)
);

-- 12. Template Tasks
CREATE TABLE IF NOT EXISTS template_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_stage_id UUID NOT NULL REFERENCES template_stages(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    default_case_role VARCHAR(20) CHECK (default_case_role IN ('CASE_MANAGER', 'EXECUTOR', 'ASSISTANT')),
    sla_business_days SMALLINT CHECK (sla_business_days > 0),
    complexity_weight SMALLINT NOT NULL DEFAULT 1 CHECK (complexity_weight BETWEEN 1 AND 4),
    requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
    triggers_milestone_order SMALLINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Template Task Dependencies
CREATE TABLE IF NOT EXISTS template_task_dependencies (
    template_task_id UUID NOT NULL REFERENCES template_tasks(id) ON DELETE CASCADE,
    depends_on_template_task_id UUID NOT NULL REFERENCES template_tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (template_task_id, depends_on_template_task_id),
    CHECK (template_task_id <> depends_on_template_task_id)
);

-- 14. Cases (Forward reference for opportunities)
CREATE TABLE IF NOT EXISTS cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_code VARCHAR(20) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    opportunity_id UUID,
    matter_type_id UUID NOT NULL REFERENCES matter_types(id) ON DELETE RESTRICT,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    template_version_id UUID REFERENCES workflow_template_versions(id) ON DELETE RESTRICT,
    workflow_mode VARCHAR(10) NOT NULL CHECK (workflow_mode IN ('STRICT', 'FLEXIBLE')),
    contract_value NUMERIC(15,2) NOT NULL CHECK (contract_value > 0),
    status VARCHAR(20) NOT NULL CHECK (status IN ('INITIALIZING', 'ACTIVE', 'PAUSED', 'CLOSED', 'TERMINATED')),
    current_stage_id UUID,
    custom_data JSONB NOT NULL DEFAULT '{}',
    due_date DATE,
    closed_at TIMESTAMPTZ,
    termination_reason TEXT,
    is_legacy BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    legacy_id VARCHAR(64) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cases_department ON cases(department_id);
CREATE INDEX IF NOT EXISTS idx_cases_custom_data ON cases USING GIN(custom_data);

-- 15. Opportunities
CREATE TABLE IF NOT EXISTS opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    lead_source VARCHAR(20) NOT NULL CHECK (lead_source IN ('WEBSITE', 'HOTLINE', 'FACEBOOK', 'REFERRAL', 'PARTNER', 'OTHER')),
    expected_value NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (expected_value >= 0),
    probability_pct SMALLINT CHECK (probability_pct BETWEEN 0 AND 100),
    stage VARCHAR(20) NOT NULL CHECK (stage IN ('NEW_LEAD', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST')),
    lost_reason TEXT,
    originator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    converted_case_id UUID UNIQUE REFERENCES cases(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Link opportunities back to cases foreign key
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_cases_opportunity'
    ) THEN
        ALTER TABLE cases ADD CONSTRAINT fk_cases_opportunity FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 16. Case Code Sequences
CREATE TABLE IF NOT EXISTS case_code_sequences (
    year SMALLINT NOT NULL,
    matter_code VARCHAR(4) NOT NULL,
    last_no INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (year, matter_code)
);

-- 17. Case Assignments
CREATE TABLE IF NOT EXISTS case_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role_in_case VARCHAR(20) NOT NULL CHECK (role_in_case IN ('SUPERVISOR', 'CASE_MANAGER', 'EXECUTOR', 'ASSISTANT')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unassigned_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_case_assignments_active ON case_assignments(case_id, user_id, role_in_case) WHERE unassigned_at IS NULL;

-- 18. Case Parties
CREATE TABLE IF NOT EXISTS case_parties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    party_role VARCHAR(20) NOT NULL CHECK (party_role IN ('OPPOSING', 'RELATED')),
    name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    tax_code_or_id_hash CHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_case_parties_normalized_name ON case_parties(normalized_name);
CREATE INDEX IF NOT EXISTS idx_case_parties_tax_hash ON case_parties(tax_code_or_id_hash);

-- 19. Billing Milestones
CREATE TABLE IF NOT EXISTS billing_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    order_index SMALLINT NOT NULL,
    name VARCHAR(150) NOT NULL,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    received_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'AWAITING_PAYMENT', 'PARTIALLY_PAID', 'PAID_CONFIRMED', 'CANCELLED')),
    requested_at TIMESTAMPTZ,
    cancelled_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(case_id, order_index)
);

-- 20. Case Stages
CREATE TABLE IF NOT EXISTS case_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    template_stage_id UUID REFERENCES template_stages(id) ON DELETE SET NULL,
    name VARCHAR(150) NOT NULL,
    order_index SMALLINT NOT NULL,
    requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('LOCKED', 'ACTIVE', 'WAITING_APPROVAL', 'WAITING_PAYMENT', 'COMPLETED')),
    blocking_milestone_id UUID REFERENCES billing_milestones(id) ON DELETE SET NULL,
    is_ad_hoc BOOLEAN NOT NULL DEFAULT FALSE,
    change_request_id UUID,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 21. Case Tasks
CREATE TABLE IF NOT EXISTS case_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES case_stages(id) ON DELETE CASCADE,
    template_task_id UUID REFERENCES template_tasks(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN_PROGRESS', 'WAITING_APPROVAL', 'COMPLETED')),
    complexity_weight SMALLINT NOT NULL DEFAULT 1 CHECK (complexity_weight BETWEEN 1 AND 4),
    requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
    triggers_milestone_id UUID REFERENCES billing_milestones(id) ON DELETE SET NULL,
    due_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    is_ad_hoc BOOLEAN NOT NULL DEFAULT FALSE,
    change_request_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_case_tasks_case ON case_tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_case_tasks_stage ON case_tasks(stage_id);

-- 22. Case Task Dependencies
CREATE TABLE IF NOT EXISTS case_task_dependencies (
    case_task_id UUID NOT NULL REFERENCES case_tasks(id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES case_tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (case_task_id, depends_on_task_id),
    CHECK (case_task_id <> depends_on_task_id)
);

-- 23. Case Task Comments
CREATE TABLE IF NOT EXISTS case_task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES case_tasks(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_case_task_comments_task ON case_task_comments(task_id);

-- 24. Approval Requests
CREATE TABLE IF NOT EXISTS approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    subject_type VARCHAR(20) NOT NULL CHECK (subject_type IN ('TASK', 'STAGE_GATE', 'CHANGE_REQUEST')),
    subject_id UUID NOT NULL,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
    decision_comment TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_case ON approval_requests(case_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_pending_subject ON approval_requests(subject_type, subject_id) WHERE status = 'PENDING';

-- 25. Workflow Change Requests (DEC-07)
CREATE TABLE IF NOT EXISTS workflow_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('ADD_TASK', 'ADD_STAGE')),
    proposal JSONB NOT NULL,
    reason TEXT NOT NULL,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    approval_request_id UUID REFERENCES approval_requests(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 26. Documents
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    folder VARCHAR(30) NOT NULL CHECK (folder IN ('LEGAL_CONTRACTS', 'CLIENT_SUBMISSIONS', 'OFFICIAL_FILINGS', 'INTERNAL_DRAFTS')),
    title VARCHAR(255) NOT NULL,
    task_id UUID REFERENCES case_tasks(id) ON DELETE SET NULL,
    current_version_id UUID,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_case ON documents(case_id);

-- 27. Document Versions
CREATE TABLE IF NOT EXISTS document_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version_no INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes <= 52428800), -- max 50MB
    sha256 CHAR(64) NOT NULL,
    scan_status VARCHAR(10) NOT NULL CHECK (scan_status IN ('PENDING', 'CLEAN', 'INFECTED')),
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(document_id, version_no)
);

-- Link documents current version
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_documents_current_version'
    ) THEN
        ALTER TABLE documents ADD CONSTRAINT fk_documents_current_version FOREIGN KEY (current_version_id) REFERENCES document_versions(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 28. Commission Policies
CREATE TABLE IF NOT EXISTS commission_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID UNIQUE NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    originator_rate NUMERIC(5,2) NOT NULL CHECK (originator_rate BETWEEN 0 AND 100),
    management_rate NUMERIC(5,2) NOT NULL CHECK (management_rate BETWEEN 0 AND 100),
    supervisor_share_pct NUMERIC(5,2) NOT NULL CHECK (supervisor_share_pct BETWEEN 0 AND 100),
    execution_rate NUMERIC(5,2) NOT NULL CHECK (execution_rate BETWEEN 0 AND 100),
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    locked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_commission_total_rate CHECK (originator_rate + management_rate + execution_rate <= 100)
);

-- 29. MISA Transactions (Only INSERT)
CREATE TABLE IF NOT EXISTS misa_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id UUID NOT NULL REFERENCES billing_milestones(id) ON DELETE RESTRICT,
    accountant_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    misa_invoice_no VARCHAR(100) NOT NULL,
    bank_ref_code VARCHAR(100) UNIQUE NOT NULL,
    idempotency_key UUID UNIQUE NOT NULL,
    received_amount NUMERIC(15,2) NOT NULL CHECK (received_amount > 0),
    notes TEXT,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_misa_transactions_milestone ON misa_transactions(milestone_id);

-- 30. Commission Transactions (Only INSERT except payout_status)
CREATE TABLE IF NOT EXISTS commission_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    misa_transaction_id UUID REFERENCES misa_transactions(id) ON DELETE RESTRICT,
    milestone_id UUID REFERENCES billing_milestones(id) ON DELETE RESTRICT,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role_type VARCHAR(20) NOT NULL CHECK (role_type IN ('ORIGINATOR', 'SUPERVISOR', 'CASE_MANAGER', 'EXECUTOR', 'ASSISTANT')),
    task_id UUID REFERENCES case_tasks(id) ON DELETE RESTRICT,
    base_amount NUMERIC(15,2) NOT NULL,
    rate_pct NUMERIC(7,4) NOT NULL,
    amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
    source VARCHAR(10) NOT NULL CHECK (source IN ('SYSTEM', 'LEGACY')),
    payout_status VARCHAR(20) NOT NULL DEFAULT 'ACCUMULATED' CHECK (payout_status IN ('ACCUMULATED', 'DISBURSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commission_transactions_case ON commission_transactions(case_id);
CREATE INDEX IF NOT EXISTS idx_commission_transactions_user ON commission_transactions(user_id);

-- 31. Commission Carry Forwards
CREATE TABLE IF NOT EXISTS commission_carry_forwards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    from_misa_transaction_id UUID UNIQUE NOT NULL REFERENCES misa_transactions(id) ON DELETE RESTRICT,
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    consumed_by_misa_transaction_id UUID REFERENCES misa_transactions(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commission_carry_case ON commission_carry_forwards(case_id);

-- 32. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(40) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    link TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

-- 33. Notification Deliveries
CREATE TABLE IF NOT EXISTS notification_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    channel VARCHAR(10) NOT NULL CHECK (channel IN ('WEB', 'TELEGRAM', 'ZALO', 'EMAIL')),
    dedupe_key VARCHAR(200) UNIQUE NOT NULL,
    status VARCHAR(10) NOT NULL CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
    attempts SMALLINT NOT NULL DEFAULT 0,
    last_error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 34. Outbox Events
CREATE TABLE IF NOT EXISTS outbox_events (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(60) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    attempts SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed ON outbox_events(id) WHERE processed_at IS NULL;

-- 35. Legacy Import Records (DEC-05)
CREATE TABLE IF NOT EXISTS legacy_import_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL,
    source_table VARCHAR(100) NOT NULL,
    source_id VARCHAR(64) NOT NULL,
    target_table VARCHAR(100) NOT NULL,
    target_id UUID NOT NULL,
    checksum CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_table, source_id)
);
CREATE INDEX IF NOT EXISTS idx_legacy_import_batch ON legacy_import_records(batch_id);

-- 36. Immutable Partitioned Audit Logs (TSK-12)
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_type VARCHAR(10) NOT NULL CHECK (actor_type IN ('USER', 'SYSTEM')),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(60) NOT NULL,
    entity_name VARCHAR(60) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    before_state JSONB,
    after_state JSONB,
    ip_address INET,
    user_agent TEXT,
    prev_hash CHAR(64) NOT NULL,
    row_hash CHAR(64) NOT NULL,
    PRIMARY KEY (id, created_at),
    CONSTRAINT chk_audit_user_ip CHECK (actor_type <> 'USER' OR ip_address IS NOT NULL)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_name, entity_id);

-- Create default and initial partitions for audit_logs
CREATE TABLE IF NOT EXISTS audit_logs_default PARTITION OF audit_logs DEFAULT;
CREATE TABLE IF NOT EXISTS audit_logs_2026_11 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');
CREATE TABLE IF NOT EXISTS audit_logs_2026_12 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');

-- Trigger to prevent UPDATE or DELETE on audit_logs
CREATE OR REPLACE FUNCTION trg_audit_logs_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only and strictly immutable. UPDATE and DELETE are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_no_modify ON audit_logs;
CREATE TRIGGER trg_audit_logs_no_modify
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION trg_audit_logs_immutable();

-- Trigger to prevent DELETE on misa_transactions
CREATE OR REPLACE FUNCTION trg_misa_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'misa_transactions cannot be deleted or modified. Only INSERT is allowed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_misa_no_delete ON misa_transactions;
CREATE TRIGGER trg_misa_no_delete
    BEFORE UPDATE OR DELETE ON misa_transactions
    FOR EACH ROW
    EXECUTE FUNCTION trg_misa_immutable();
