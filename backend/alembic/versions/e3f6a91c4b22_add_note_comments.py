"""add_note_comments

Revision ID: e3f6a91c4b22
Revises: d4c7a91b2e30
Create Date: 2026-06-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e3f6a91c4b22"
down_revision: Union[str, None] = "d4c7a91b2e30"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "note_comments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("note_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_note_comments_note_id"), "note_comments", ["note_id"], unique=False)
    op.create_index(op.f("ix_note_comments_user_id"), "note_comments", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_note_comments_user_id"), table_name="note_comments")
    op.drop_index(op.f("ix_note_comments_note_id"), table_name="note_comments")
    op.drop_table("note_comments")
