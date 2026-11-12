"""Thứ tự hiển thị task (order_index) — áp `004_task_order_index.sql`

Revision ID: 0005_task_order_index
Revises: 0004_user_recovery_codes
Create Date: 2026-11-12

"""
from pathlib import Path
from typing import Sequence, Union

from alembic import op

revision: str = "0005_task_order_index"
down_revision: Union[str, None] = "0004_user_recovery_codes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    sql = (Path(__file__).resolve().parent / "004_task_order_index.sql").read_text(encoding="utf-8")
    op.get_bind().exec_driver_sql(sql.replace("%", "%%"))


def downgrade() -> None:
    op.get_bind().exec_driver_sql("DROP INDEX IF EXISTS idx_case_tasks_stage_order; DROP INDEX IF EXISTS idx_template_tasks_stage_order; ALTER TABLE case_tasks DROP COLUMN IF EXISTS order_index; ALTER TABLE template_tasks DROP COLUMN IF EXISTS order_index;")
