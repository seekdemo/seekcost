"""add note favorites

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "note_favorites",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("note_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "note_id", name="uq_note_favorites_user_note"),
    )
    op.create_index(op.f("ix_note_favorites_note_id"), "note_favorites", ["note_id"], unique=False)
    op.create_index(op.f("ix_note_favorites_user_id"), "note_favorites", ["user_id"], unique=False)
    op.create_table(
        "note_series_favorites",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("series", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "series", name="uq_note_series_favorites_user_series"),
    )
    op.create_index(op.f("ix_note_series_favorites_series"), "note_series_favorites", ["series"], unique=False)
    op.create_index(op.f("ix_note_series_favorites_user_id"), "note_series_favorites", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_note_series_favorites_user_id"), table_name="note_series_favorites")
    op.drop_index(op.f("ix_note_series_favorites_series"), table_name="note_series_favorites")
    op.drop_table("note_series_favorites")
    op.drop_index(op.f("ix_note_favorites_user_id"), table_name="note_favorites")
    op.drop_index(op.f("ix_note_favorites_note_id"), table_name="note_favorites")
    op.drop_table("note_favorites")
