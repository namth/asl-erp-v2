"""Bảng mã khôi phục 2FA — áp `002_user_recovery_codes.sql`

Revision ID: 0004_user_recovery_codes
Revises: 0003_mt_commission_defaults
Create Date: 2026-11-12

"""
from pathlib import Path
from typing import Sequence, Union

from alembic import op

revision: str = "0004_user_recovery_codes"
down_revision: Union[str, None] = "0003_mt_commission_defaults"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    sql = (Path(__file__).resolve().parent / "002_user_recovery_codes.sql").read_text(encoding="utf-8")
    op.get_bind().exec_driver_sql(sql.replace("%", "%%"))


def downgrade() -> None:
    op.get_bind().exec_driver_sql("DROP TABLE IF EXISTS user_recovery_codes;")
