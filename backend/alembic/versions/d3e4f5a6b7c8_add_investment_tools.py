"""add private investment tool directory"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d3e4f5a6b7c8"
down_revision: Union[str, None] = "e4f5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "investment_tools",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("url", sa.String(length=2048), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("category", sa.String(length=32), nullable=False, server_default="other"),
        sa.Column("pricing", sa.String(length=24), nullable=False, server_default="unknown"),
        sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("source_url", sa.String(length=2048), nullable=True),
        sa.Column("starred", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "url", name="uq_investment_tool_user_url"),
    )
    op.create_index("ix_investment_tools_user_id", "investment_tools", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_investment_tools_user_id", table_name="investment_tools")
    op.drop_table("investment_tools")
