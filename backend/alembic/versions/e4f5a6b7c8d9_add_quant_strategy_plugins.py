"""add private quant strategy plugins"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "quant_strategy_settings",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("strategy_key", sa.String(length=64), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "strategy_key", name="uq_quant_strategy_setting_user_key"),
    )
    op.create_index("ix_quant_strategy_settings_user_id", "quant_strategy_settings", ["user_id"])

    op.create_table(
        "quant_strategy_qualifications",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("strategy_key", sa.String(length=64), nullable=False),
        sa.Column("stock_id", sa.Integer(), nullable=False),
        sa.Column("historical_low", sa.Boolean(), nullable=True),
        sa.Column("valuation_low", sa.Boolean(), nullable=True),
        sa.Column("attention_low", sa.Boolean(), nullable=True),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stock_id"], ["watch_stocks.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "strategy_key", "stock_id", name="uq_quant_qualification_user_key_stock"),
    )
    op.create_index("ix_quant_strategy_qualifications_user_id", "quant_strategy_qualifications", ["user_id"])
    op.create_index("ix_quant_strategy_qualifications_stock_id", "quant_strategy_qualifications", ["stock_id"])
    op.create_table(
        "quant_signal_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("strategy_key", sa.String(length=64), nullable=False),
        sa.Column("stock_id", sa.Integer(), nullable=False),
        sa.Column("signal", sa.String(length=32), nullable=False),
        sa.Column("reason_codes", sa.JSON(), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("strategy_version", sa.String(length=32), nullable=False),
        sa.Column("bar_date", sa.String(length=32), nullable=True),
        sa.Column("source", sa.String(length=64), nullable=False),
        sa.Column("execution_timing", sa.String(length=32), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stock_id"], ["watch_stocks.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_quant_signal_snapshots_user_id", "quant_signal_snapshots", ["user_id"])
    op.create_index("ix_quant_signal_snapshots_stock_id", "quant_signal_snapshots", ["stock_id"])
    op.create_index(
        "ix_quant_snapshot_latest",
        "quant_signal_snapshots",
        ["user_id", "strategy_key", "stock_id", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_quant_snapshot_latest", table_name="quant_signal_snapshots")
    op.drop_index("ix_quant_signal_snapshots_stock_id", table_name="quant_signal_snapshots")
    op.drop_index("ix_quant_signal_snapshots_user_id", table_name="quant_signal_snapshots")
    op.drop_table("quant_signal_snapshots")
    op.drop_index("ix_quant_strategy_qualifications_stock_id", table_name="quant_strategy_qualifications")
    op.drop_index("ix_quant_strategy_qualifications_user_id", table_name="quant_strategy_qualifications")
    op.drop_table("quant_strategy_qualifications")
    op.drop_index("ix_quant_strategy_settings_user_id", table_name="quant_strategy_settings")
    op.drop_table("quant_strategy_settings")
