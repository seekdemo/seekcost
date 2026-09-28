"""add user nav items

Revision ID: d1e2f3a4b5c6
Revises: c9f1a87e5b42
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, None] = "c9f1a87e5b42"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("nav_items", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "nav_items")
