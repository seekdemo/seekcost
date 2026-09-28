"""add note comment reactions

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c6d7e8f9a0b1"
down_revision: Union[str, None] = "b5c6d7e8f9a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "note_comment_reactions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("comment_id", sa.Integer(), nullable=False),
        sa.Column("emoji", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["comment_id"], ["note_comments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "comment_id", "emoji", name="uq_note_comment_reactions_user_comment_emoji"),
    )
    op.create_index(op.f("ix_note_comment_reactions_comment_id"), "note_comment_reactions", ["comment_id"], unique=False)
    op.create_index(op.f("ix_note_comment_reactions_user_id"), "note_comment_reactions", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_note_comment_reactions_user_id"), table_name="note_comment_reactions")
    op.drop_index(op.f("ix_note_comment_reactions_comment_id"), table_name="note_comment_reactions")
    op.drop_table("note_comment_reactions")
