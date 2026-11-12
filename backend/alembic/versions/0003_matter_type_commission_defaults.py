"""Matter type commission defaults migration (TSK-05 / TASK-019)

Revision ID: 0003_mt_commission_defaults
Revises: 0002_roles_and_grants
Create Date: 2026-11-11

"""
from pathlib import Path
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
# alembic_version.version_num là varchar(32) → mã revision phải ≤ 32 ký tự.
revision: str = "0003_mt_commission_defaults"
down_revision: Union[str, None] = "0002_roles_and_grants"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    sql_path = Path(__file__).resolve().parent / "003_matter_type_commission_defaults.sql"
    if sql_path.exists():
        sql_content = sql_path.read_text(encoding="utf-8")
        # exec_driver_sql coi % là ký hiệu tham số của psycopg → nhân đôi.
        conn.exec_driver_sql(sql_content.replace("%", "%%"))
    else:
        conn.exec_driver_sql("""
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

        ALTER TABLE matter_types DROP CONSTRAINT IF EXISTS matter_types_code_check;
        ALTER TABLE matter_types ADD CONSTRAINT matter_types_code_check CHECK (code ~ '^[A-Z0-9]{2,4}$');
        ALTER TABLE opportunities ALTER COLUMN originator_id DROP NOT NULL;
        ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'PENDING';
        """)


def downgrade() -> None:
    conn = op.get_bind()
    conn.exec_driver_sql("""
    ALTER TABLE matter_types DROP CONSTRAINT IF EXISTS chk_matter_types_total_commission_rates;
    ALTER TABLE matter_types
    DROP COLUMN IF EXISTS default_originator_rate,
    DROP COLUMN IF EXISTS default_management_rate,
    DROP COLUMN IF EXISTS default_supervisor_share_pct,
    DROP COLUMN IF EXISTS default_execution_rate;
    ALTER TABLE matter_types DROP CONSTRAINT IF EXISTS matter_types_code_check;
    ALTER TABLE matter_types ADD CONSTRAINT matter_types_code_check CHECK (code ~ '^[A-Z]{2,4}$');
    ALTER TABLE opportunities ALTER COLUMN originator_id SET NOT NULL;
    ALTER TABLE outbox_events DROP COLUMN IF EXISTS status;
    """)
