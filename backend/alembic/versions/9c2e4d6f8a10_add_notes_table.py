"""add_notes_table

Revision ID: 9c2e4d6f8a10
Revises: b2a91b6d5e7c
Create Date: 2026-06-08 01:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9c2e4d6f8a10"
down_revision: Union[str, None] = "b2a91b6d5e7c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=256), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("format", sa.Enum("MARKDOWN", "RICH", name="noteformat"), server_default="MARKDOWN", nullable=False),
        sa.Column("visibility", sa.Enum("PRIVATE", "WORKSPACE", "PUBLIC", name="notevisibility"), server_default="PRIVATE", nullable=False),
        sa.Column("stock_symbols", sa.JSON(), nullable=False),
        sa.Column("knowledge_tags", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_notes_user_id"), "notes", ["user_id"], unique=False)
    op.create_index(op.f("ix_notes_visibility"), "notes", ["visibility"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_notes_visibility"), table_name="notes")
    op.drop_index(op.f("ix_notes_user_id"), table_name="notes")
    op.drop_table("notes")
    op.execute("DROP TYPE IF EXISTS notevisibility")
    op.execute("DROP TYPE IF EXISTS noteformat")
