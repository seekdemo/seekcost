"""add_note_comment_permissions_and_replies

Revision ID: a7d8c9e1f234
Revises: e3f6a91c4b22
Create Date: 2026-06-29 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a7d8c9e1f234"
down_revision: Union[str, None] = "e3f6a91c4b22"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("notes") as batch_op:
        batch_op.add_column(sa.Column("allow_comments", sa.Boolean(), server_default=sa.true(), nullable=False))
    with op.batch_alter_table("note_comments") as batch_op:
        batch_op.add_column(sa.Column("parent_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_note_comments_parent_id_note_comments",
            "note_comments",
            ["parent_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch_op.create_index(op.f("ix_note_comments_parent_id"), ["parent_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("note_comments") as batch_op:
        batch_op.drop_index(op.f("ix_note_comments_parent_id"))
        batch_op.drop_constraint("fk_note_comments_parent_id_note_comments", type_="foreignkey")
        batch_op.drop_column("parent_id")
    with op.batch_alter_table("notes") as batch_op:
        batch_op.drop_column("allow_comments")
