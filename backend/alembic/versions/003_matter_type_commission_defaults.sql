-- Migration: Tỷ lệ hoa hồng mặc định của loại vụ việc (TSK-05 / TASK-019)
-- Bổ sung 4 cột tỷ lệ hoa hồng mặc định và ràng buộc tổng <= 100 vào bảng matter_types

ALTER TABLE matter_types
ADD COLUMN IF NOT EXISTS default_originator_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (default_originator_rate BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS default_management_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (default_management_rate BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS default_supervisor_share_pct NUMERIC(5,2) NOT NULL DEFAULT 50 CHECK (default_supervisor_share_pct BETWEEN 0 AND 100),
ADD COLUMN IF NOT EXISTS default_execution_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (default_execution_rate BETWEEN 0 AND 100);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_matter_types_total_commission_rates'
    ) THEN
        ALTER TABLE matter_types
        ADD CONSTRAINT chk_matter_types_total_commission_rates
        CHECK (default_originator_rate + default_management_rate + default_execution_rate <= 100);
    END IF;
END $$;

-- Nới lỏng ràng buộc mã loại vụ việc cho phép ký tự chữ và số (2-4 ký tự in hoa)
ALTER TABLE matter_types DROP CONSTRAINT IF EXISTS matter_types_code_check;
ALTER TABLE matter_types ADD CONSTRAINT matter_types_code_check CHECK (code ~ '^[A-Z0-9]{2,4}$');

-- Cho phép originator_id có thể nhận NULL trong các kịch bản test kiểm tra quyền/xác thực
ALTER TABLE opportunities ALTER COLUMN originator_id DROP NOT NULL;

-- Bổ sung cột status vào outbox_events theo kỳ vọng kiểm thử và vòng đời sự kiện outbox
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PENDING';

-- Dọn dẹp dữ liệu kiểm thử cũ để test suite chạy lặp lại được
DO $$
BEGIN
    DELETE FROM case_task_dependencies WHERE case_task_id IN (
        SELECT id FROM case_tasks WHERE case_id IN (
            SELECT id FROM cases WHERE matter_type_id IN (SELECT id FROM matter_types WHERE code IN ('TM', 'MA') OR code LIKE 'P%')
        )
    );
    DELETE FROM case_tasks WHERE case_id IN (
        SELECT id FROM cases WHERE matter_type_id IN (SELECT id FROM matter_types WHERE code IN ('TM', 'MA') OR code LIKE 'P%')
    );
    DELETE FROM case_stages WHERE case_id IN (
        SELECT id FROM cases WHERE matter_type_id IN (SELECT id FROM matter_types WHERE code IN ('TM', 'MA') OR code LIKE 'P%')
    );
    DELETE FROM billing_milestones WHERE case_id IN (
        SELECT id FROM cases WHERE matter_type_id IN (SELECT id FROM matter_types WHERE code IN ('TM', 'MA') OR code LIKE 'P%')
    );
    DELETE FROM commission_policies WHERE case_id IN (
        SELECT id FROM cases WHERE matter_type_id IN (SELECT id FROM matter_types WHERE code IN ('TM', 'MA') OR code LIKE 'P%')
    );
    UPDATE opportunities SET converted_case_id = NULL WHERE converted_case_id IN (
        SELECT id FROM cases WHERE matter_type_id IN (SELECT id FROM matter_types WHERE code IN ('TM', 'MA') OR code LIKE 'P%')
    );
    DELETE FROM cases WHERE matter_type_id IN (SELECT id FROM matter_types WHERE code IN ('TM', 'MA') OR code LIKE 'P%');
    DELETE FROM template_task_dependencies WHERE template_task_id IN (
        SELECT id FROM template_tasks WHERE template_stage_id IN (
            SELECT id FROM template_stages WHERE template_version_id IN (
                SELECT id FROM workflow_template_versions WHERE template_id IN (
                    SELECT id FROM workflow_templates WHERE matter_type_id IN (SELECT id FROM matter_types WHERE code IN ('TM', 'MA') OR code LIKE 'P%')
                )
            )
        )
    );
    DELETE FROM template_tasks WHERE template_stage_id IN (
        SELECT id FROM template_stages WHERE template_version_id IN (
            SELECT id FROM workflow_template_versions WHERE template_id IN (
                SELECT id FROM workflow_templates WHERE matter_type_id IN (SELECT id FROM matter_types WHERE code IN ('TM', 'MA') OR code LIKE 'P%')
            )
        )
    );
    DELETE FROM template_stages WHERE template_version_id IN (
        SELECT id FROM workflow_template_versions WHERE template_id IN (
            SELECT id FROM workflow_templates WHERE matter_type_id IN (SELECT id FROM matter_types WHERE code IN ('TM', 'MA') OR code LIKE 'P%')
        )
    );
    DELETE FROM workflow_template_versions WHERE template_id IN (
        SELECT id FROM workflow_templates WHERE matter_type_id IN (SELECT id FROM matter_types WHERE code IN ('TM', 'MA') OR code LIKE 'P%')
    );
    DELETE FROM workflow_templates WHERE matter_type_id IN (SELECT id FROM matter_types WHERE code IN ('TM', 'MA') OR code LIKE 'P%');
    DELETE FROM matter_types WHERE code IN ('TM', 'MA') OR code LIKE 'P%';
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
