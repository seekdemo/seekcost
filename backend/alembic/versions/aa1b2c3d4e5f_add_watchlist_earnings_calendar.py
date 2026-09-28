"""add private watchlist earnings calendar

Revision ID: aa1b2c3d4e5f
Revises: f9a0b1c2d3e4
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "aa1b2c3d4e5f"
down_revision: Union[str, None] = "f9a0b1c2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "earnings_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("stock_id", sa.Integer(), nullable=False),
        sa.Column("event_date", sa.Date(), nullable=False),
        sa.Column("fiscal_period", sa.String(length=64), nullable=False, server_default=""),
        sa.Column(
            "status",
            sa.Enum("ESTIMATED", "CONFIRMED", "REPORTED", name="earningsstatus"),
            nullable=False,
            server_default="ESTIMATED",
        ),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stock_id"], ["watch_stocks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_earnings_events_user_id"), "earnings_events", ["user_id"], unique=False)
    op.create_index(op.f("ix_earnings_events_stock_id"), "earnings_events", ["stock_id"], unique=False)
    op.create_index(op.f("ix_earnings_events_event_date"), "earnings_events", ["event_date"], unique=False)
    op.create_index(op.f("ix_earnings_events_status"), "earnings_events", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_earnings_events_status"), table_name="earnings_events")
    op.drop_index(op.f("ix_earnings_events_event_date"), table_name="earnings_events")
    op.drop_index(op.f("ix_earnings_events_stock_id"), table_name="earnings_events")
    op.drop_index(op.f("ix_earnings_events_user_id"), table_name="earnings_events")
    op.drop_table("earnings_events")
    op.execute("DROP TYPE IF EXISTS earningsstatus")
