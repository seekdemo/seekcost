"""add_note_comment_reply_to_user

Revision ID: b8e2d4a6f901
Revises: a7d8c9e1f234
Create Date: 2026-07-04 22:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b8e2d4a6f901"
down_revision: Union[str, None] = "a7d8c9e1f234"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("note_comments") as batch_op:
        batch_op.add_column(sa.Column("reply_to_user_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_note_comments_reply_to_user_id_users",
            "users",
            ["reply_to_user_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index(op.f("ix_note_comments_reply_to_user_id"), ["reply_to_user_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("note_comments") as batch_op:
        batch_op.drop_index(op.f("ix_note_comments_reply_to_user_id"))
        batch_op.drop_constraint("fk_note_comments_reply_to_user_id_users", type_="foreignkey")
        batch_op.drop_column("reply_to_user_id")
