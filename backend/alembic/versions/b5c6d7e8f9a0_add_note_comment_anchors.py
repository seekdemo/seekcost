"""add note comment anchors

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b5c6d7e8f9a0"
down_revision: Union[str, None] = "a4b5c6d7e8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("note_comments", sa.Column("quote_text", sa.Text(), nullable=True))
    op.add_column("note_comments", sa.Column("quote_prefix", sa.String(length=200), nullable=True))
    op.add_column("note_comments", sa.Column("quote_suffix", sa.String(length=200), nullable=True))
    op.add_column("note_comments", sa.Column("start_offset", sa.Integer(), nullable=True))
    op.add_column("note_comments", sa.Column("end_offset", sa.Integer(), nullable=True))
    op.add_column("note_comments", sa.Column("block_id", sa.String(length=64), nullable=True))
    op.add_column("note_comments", sa.Column("anchor_status", sa.String(length=16), server_default="active", nullable=False))


def downgrade() -> None:
    op.drop_column("note_comments", "anchor_status")
    op.drop_column("note_comments", "block_id")
    op.drop_column("note_comments", "end_offset")
    op.drop_column("note_comments", "start_offset")
    op.drop_column("note_comments", "quote_suffix")
    op.drop_column("note_comments", "quote_prefix")
    op.drop_column("note_comments", "quote_text")
