"""add_ibkr_cash_flows

Revision ID: c9f1a87e5b42
Revises: b8e2d4a6f901
Create Date: 2026-07-10 01:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c9f1a87e5b42"
down_revision: Union[str, None] = "b8e2d4a6f901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ibkr_cash_flows",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.String(length=16), nullable=False, comment="结算日期"),
        sa.Column("currency", sa.String(length=8), nullable=False, comment="币种"),
        sa.Column("description", sa.String(length=256), nullable=False, comment="描述"),
        sa.Column("amount", sa.Numeric(precision=18, scale=4), nullable=False, comment="金额，正数为入金，负数为出金"),
        sa.Column("flow_type", sa.String(length=16), nullable=False, comment="deposit / withdrawal"),
        sa.Column("import_fingerprint", sa.String(length=96), nullable=False, comment="导入去重指纹"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_ibkr_cash_flows_user_id"), "ibkr_cash_flows", ["user_id"], unique=False)
    op.create_index(op.f("ix_ibkr_cash_flows_date"), "ibkr_cash_flows", ["date"], unique=False)
    op.create_index(op.f("ix_ibkr_cash_flows_flow_type"), "ibkr_cash_flows", ["flow_type"], unique=False)
    op.create_index("ux_ibkr_cash_flows_user_fingerprint", "ibkr_cash_flows", ["user_id", "import_fingerprint"], unique=True)


def downgrade() -> None:
    op.drop_index("ux_ibkr_cash_flows_user_fingerprint", table_name="ibkr_cash_flows")
    op.drop_index(op.f("ix_ibkr_cash_flows_flow_type"), table_name="ibkr_cash_flows")
    op.drop_index(op.f("ix_ibkr_cash_flows_date"), table_name="ibkr_cash_flows")
    op.drop_index(op.f("ix_ibkr_cash_flows_user_id"), table_name="ibkr_cash_flows")
    op.drop_table("ibkr_cash_flows")
