"""add note tags and series

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("notes", sa.Column("tags", sa.JSON(), server_default="[]", nullable=False))
    op.add_column("notes", sa.Column("series", sa.String(length=128), nullable=True))
    op.create_index(op.f("ix_notes_series"), "notes", ["series"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_notes_series"), table_name="notes")
    op.drop_column("notes", "series")
    op.drop_column("notes", "tags")
