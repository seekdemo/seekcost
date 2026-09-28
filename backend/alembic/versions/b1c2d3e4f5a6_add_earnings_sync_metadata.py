"""add earnings sync metadata

Revision ID: b1c2d3e4f5a6
Revises: aa1b2c3d4e5f
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "aa1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "earnings_events",
        sa.Column("source", sa.String(length=16), nullable=False, server_default="manual"),
    )
    op.add_column(
        "earnings_events",
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    with op.batch_alter_table("earnings_events") as batch_op:
        batch_op.drop_column("synced_at")
        batch_op.drop_column("source")
